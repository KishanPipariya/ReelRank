"""Find movies that occur most often in a user's liked Letterboxd lists."""

from __future__ import annotations

import argparse
import ast
import csv
import difflib
import json
import os
import re
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests
from curl_cffi.requests.errors import RequestsError
from rich.console import Console
from rich.progress import (
    BarColumn,
    Progress,
    SpinnerColumn,
    TaskProgressColumn,
    TextColumn,
    TimeElapsedColumn,
)


Session = curl_requests.Session


@dataclass(frozen=True)
class Movie:
    title: str
    year: str
    uri: str


@dataclass
class MovieResult:
    movie: Movie
    liked_in: int
    lists: list[str]


def _clean_title(value: str) -> str:
    value = re.sub(r"\s+Poster$", "", value, flags=re.IGNORECASE)
    return " ".join(value.split()).strip()


def _movie_key(movie: Movie) -> str:
    return movie.uri or f"{movie.title.casefold()}|{movie.year}"


def _canonical_letterboxd_url(url: str) -> str:
    """Use Letterboxd's canonical host for links from short URLs.

    A list opened through ``boxd.it`` can expose pagination links such as
    ``/page/2/``. Keeping the short-link host makes those links 404, while the
    same path works on ``letterboxd.com``.
    """
    parsed = urlparse(url)
    if parsed.netloc.lower() in {"boxd.it", "www.boxd.it"}:
        return urlunparse(parsed._replace(scheme="https", netloc="letterboxd.com"))
    return url


def _movie_from_item(item, base_url: str) -> Movie | None:
    """Extract a movie from one Letterboxd poster list item.

    Letterboxd has changed its poster markup a few times, so this intentionally
    checks several attributes and falls back to the film link and image alt text.
    """
    link = item.select_one('a[href*="/film/"]')
    component = item.select_one("[data-film-id], [data-film-name], [data-item-name]")
    image = item.select_one("img[alt]")
    source = component or item
    uri = ""
    film_href = (link.get("href") if link else "") or source.get("data-item-link", "")
    if film_href and "/film/" in film_href:
        parsed = urlparse(urljoin(base_url, film_href))
        uri = f"https://letterboxd.com{parsed.path.rstrip('/')}/"

    title = ""
    year = ""
    for key in ("data-film-name", "data-item-name", "data-name"):
        if source.get(key):
            title = source[key]
            break
    if not title and image:
        title = image.get("alt", "")
    if not title and link:
        title = link.get("title", "") or link.get_text(" ", strip=True)
    for key in ("data-film-release-year", "data-release-year", "data-year"):
        if source.get(key):
            year = source[key]
            break
    if not year:
        year_match = re.search(r"\((\d{4})\)", title)
        if year_match:
            year = year_match.group(1)
            title = title[: year_match.start()]
    title = _clean_title(title)
    if not title and not uri:
        return None
    return Movie(
        title=title or uri.rstrip("/").rsplit("/", 1)[-1],
        year=str(year),
        uri=uri,
    )


def parse_list_page(html: str, page_url: str) -> tuple[list[Movie], str | None]:
    soup = BeautifulSoup(html, "html.parser")
    items = soup.select("li.poster-container")
    if not items:
        items = soup.select('[data-component-class*="Poster"], .poster-container')
    movies = []
    seen: set[str] = set()
    for item in items:
        movie = _movie_from_item(item, page_url)
        if movie and _movie_key(movie) not in seen:
            movies.append(movie)
            seen.add(_movie_key(movie))
    next_link = soup.select_one('a.next[href], a[rel="next"][href]')
    next_url = _canonical_letterboxd_url(urljoin(page_url, next_link["href"])) if next_link else None
    return movies, next_url


def fetch_list(client: Session, list_url: str, max_pages: int = 100) -> list[Movie]:
    movies: list[Movie] = []
    seen: set[str] = set()
    visited_pages: set[str] = set()
    page_url: str | None = list_url
    for _ in range(max_pages):
        if page_url is None or page_url in visited_pages:
            break
        visited_pages.add(page_url)
        response = client.get(page_url)
        response.raise_for_status()
        # Use the final redirected URL as the base for pagination. This turns
        # relative links from boxd.it short URLs into canonical Letterboxd URLs.
        page_movies, next_url = parse_list_page(response.text, str(response.url))
        added = 0
        for movie in page_movies:
            if _movie_key(movie) not in seen:
                movies.append(movie)
                seen.add(_movie_key(movie))
                added += 1
        # A repeated next link or a page with no new posters indicates that
        # pagination is not advancing (often caused by a site-side redirect).
        if not added or next_url in visited_pages:
            break
        page_url = next_url
    return movies


def _username_url(username: str) -> str:
    username = username.strip().strip("/")
    if not username:
        raise ValueError("Please provide a Letterboxd username")
    if "/" in username or username.startswith("http"):
        raise ValueError("Enter your Letterboxd username, not a profile URL")
    return f"https://letterboxd.com/{username}/"


def fetch_user_list_urls(client: Session, username: str, max_pages: int = 100) -> list[str]:
    """Fetch the public lists liked by a Letterboxd user."""
    page_url: str | None = urljoin(_username_url(username), "likes/lists/")
    list_urls: list[str] = []
    seen_lists: set[str] = set()
    visited_pages: set[str] = set()
    for _ in range(max_pages):
        if page_url is None or page_url in visited_pages:
            break
        visited_pages.add(page_url)
        response = client.get(page_url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for link in soup.select('a[href*="/list/"]'):
            href = link.get("href", "")
            parsed = urlparse(urljoin(str(response.url), href))
            if parsed.netloc.lower() not in {"letterboxd.com", "www.letterboxd.com"}:
                continue
            if re.fullmatch(r"/[^/]+/list/[^/]+/?", parsed.path):
                list_url = f"https://letterboxd.com{parsed.path.rstrip('/')}/"
                if list_url not in seen_lists:
                    list_urls.append(list_url)
                    seen_lists.add(list_url)
        next_link = soup.select_one('a.next[href], a[rel="next"][href]')
        next_url = _canonical_letterboxd_url(urljoin(str(response.url), next_link["href"])) if next_link else None
        if next_url in visited_pages:
            break
        page_url = next_url
    return list_urls


def fetch_user_watched_movies(client: Session, username: str, max_pages: int = 100) -> set[tuple[str, str]]:
    """Fetch all films marked watched on a user's public Films page."""
    movies = fetch_list(client, urljoin(_username_url(username), "films/"), max_pages=max_pages)
    return {(movie.title.casefold(), movie.year) for movie in movies if movie.title}


def rank_movies(
    list_urls: list[str],
    client: Session,
    progress: Progress | None = None,
    progress_task: int | None = None,
) -> list[MovieResult]:
    occurrences: defaultdict[str, set[int]] = defaultdict(set)
    movie_by_uri: dict[str, Movie] = {}

    def fetch_numbered_list(entry: tuple[int, str]) -> tuple[int, list[Movie]]:
        list_number, list_url = entry
        return list_number, fetch_list(client, list_url)

    # Lists are independent, so fetch a few at once. curl_cffi sessions are
    # thread-safe; keeping pagination within fetch_list limits pressure on the site.
    entries = enumerate(list_urls)
    with ThreadPoolExecutor(max_workers=min(6, len(list_urls) or 1)) as executor:
        futures = [executor.submit(fetch_numbered_list, entry) for entry in entries]
        for future in as_completed(futures):
            list_number, movies = future.result()
            for movie in movies:
                key = _movie_key(movie)
                occurrences[key].add(list_number)
                movie_by_uri[key] = movie
            if progress is not None and progress_task is not None:
                progress.advance(progress_task)
    results = [
        MovieResult(movie_by_uri[key], len(list_numbers), [list_urls[i] for i in sorted(list_numbers)])
        for key, list_numbers in occurrences.items()
    ]
    return sorted(results, key=lambda result: (-result.liked_in, result.movie.title.lower(), result.movie.year))


def write_csv(results: list[MovieResult], output: Path) -> None:
    with output.open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["Title", "Year", "Liked in lists", "Letterboxd URI", "List URLs"])
        for result in results:
            writer.writerow([
                result.movie.title,
                result.movie.year,
                result.liked_in,
                result.movie.uri,
                " ".join(result.lists),
            ])


def filter_unwatched(results: list[MovieResult], watched: set[tuple[str, str]]) -> list[MovieResult]:
    """Remove movies present in the user's watched films.

    Matching uses title and year because both profile pages and liked-list
    pages expose canonical film URLs but may use different URL forms.
    """
    return [
        result
        for result in results
        if (result.movie.title.casefold(), result.movie.year) not in watched
    ]


def _tmdb_metadata_key(movie: Movie) -> str:
    normalized_title = re.sub(r"[^a-z0-9]+", " ", movie.title.casefold()).strip()
    return f"{normalized_title}|{movie.year}"


def _load_tmdb_metadata_cache(cache_path: Path) -> dict[str, dict | None]:
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        key: value
        for key, value in payload.items()
        if isinstance(key, str) and (value is None or isinstance(value, dict))
    }


def _write_tmdb_metadata_cache(cache_path: Path, cache: dict[str, dict | None]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = cache_path.with_name(f".{cache_path.name}.tmp")
    temporary.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(cache_path)


def create_snapshot(username: str) -> dict:
    """Fetch and serialize one user's ranked liked-list films for the web demo."""
    username = username.strip().strip("/")
    tmdb_api_key = _load_tmdb_api_key()
    if not tmdb_api_key:
        raise ValueError("Set TMDB_API_KEY in your environment or .env file to refresh the web demo snapshot")

    with curl_requests.Session(impersonate="chrome", allow_redirects=True, timeout=30.0) as client:
        list_urls = fetch_user_list_urls(client, username)
        if not list_urls:
            raise ValueError(f"No public liked lists found for {username}")
        results = rank_movies(list_urls, client)
        watched = fetch_user_watched_movies(client, username)

        # Resolve movie metadata for the highest-ranked films through TMDB.
        featured_results = results[:500]
        tmdb_cache_path = Path(".reelrank-cache") / "tmdb-film-metadata-v1.json"
        tmdb_cache = _load_tmdb_metadata_cache(tmdb_cache_path)
        metadata: dict[int, dict | None] = {}
        missing_metadata: list[tuple[int, MovieResult, str]] = []
        for index, result in enumerate(featured_results):
            cache_key = _tmdb_metadata_key(result.movie)
            if cache_key in tmdb_cache:
                metadata[index] = tmdb_cache[cache_key]
            else:
                missing_metadata.append((index, result, cache_key))

        def fetch_tmdb_metadata(entry: tuple[int, MovieResult, str]) -> tuple[int, str, dict | None, bool]:
            index, result, cache_key = entry
            try:
                response = client.get(
                    "https://api.themoviedb.org/3/search/movie",
                    params={
                        "api_key": tmdb_api_key,
                        "query": result.movie.title,
                        **({"year": result.movie.year} if result.movie.year.isdigit() else {}),
                    },
                )
                if response.status_code == 401:
                    raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
                response.raise_for_status()
                candidates = response.json().get("results", [])
                if not candidates:
                    return index, cache_key, None, False

                def title_score(candidate: dict) -> tuple[float, int]:
                    target = re.sub(r"[^a-z0-9]+", "", result.movie.title.casefold())
                    names = (candidate.get("title", ""), candidate.get("original_title", ""))
                    score = max(
                        difflib.SequenceMatcher(
                            None,
                            target,
                            re.sub(r"[^a-z0-9]+", "", name.casefold()),
                        ).ratio()
                        for name in names
                    )
                    candidate_year = (candidate.get("release_date") or "")[:4]
                    year_match = int(not result.movie.year or not candidate_year or candidate_year == result.movie.year)
                    return year_match, score

                best = max(candidates, key=title_score)
                year_match, score = title_score(best)
                if score < 0.55 or not year_match:
                    return index, cache_key, None, False
                poster_path = best.get("poster_path") or ""
                backdrop_path = best.get("backdrop_path") or ""
                return index, cache_key, {
                    "tmdb_id": best.get("id"),
                    "tmdb_url": f"https://www.themoviedb.org/movie/{best['id']}" if best.get("id") else "",
                    "title": best.get("title") or result.movie.title,
                    "year": (best.get("release_date") or "")[:4] or result.movie.year,
                    "overview": best.get("overview") or "",
                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "",
                    "backdrop_url": f"https://image.tmdb.org/t/p/w780{backdrop_path}" if backdrop_path else "",
                    "tmdb_rating": best.get("vote_average"),
                }, True
            except RequestsError:
                return index, cache_key, None, False

        if missing_metadata:
            with ThreadPoolExecutor(max_workers=6) as executor:
                for index, cache_key, value, cacheable in executor.map(fetch_tmdb_metadata, missing_metadata):
                    metadata[index] = value
                    if cacheable and value is not None:
                        tmdb_cache[cache_key] = value
            _write_tmdb_metadata_cache(tmdb_cache_path, tmdb_cache)
        tmdb_match_count = sum(value is not None for value in metadata.values())
        if not tmdb_match_count:
            raise ValueError("TMDB did not match any ranked films; the previous demo snapshot was left unchanged")

    films = []
    for index, result in enumerate(featured_results):
        movie = result.movie
        is_watched = (movie.title.casefold(), movie.year) in watched
        tmdb = metadata.get(index) or {}
        films.append(
            {
                "title": tmdb.get("title") or movie.title,
                "year": tmdb.get("year") or movie.year,
                "letterboxd_title": movie.title,
                "letterboxd_year": movie.year,
                "letterboxd_url": movie.uri,
                "poster_url": tmdb.get("poster_url", ""),
                "backdrop_url": tmdb.get("backdrop_url", ""),
                "overview": tmdb.get("overview", ""),
                "tmdb_id": tmdb.get("tmdb_id"),
                "tmdb_url": tmdb.get("tmdb_url", ""),
                "tmdb_rating": tmdb.get("tmdb_rating"),
                "liked_in": result.liked_in,
                "watched": is_watched,
                "lists": result.lists,
            }
        )

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "username": username,
        "profile_url": _username_url(username),
        "refreshed_at": now,
        "list_count": len(list_urls),
        "film_count": len(results),
        "displayed_film_count": len(films),
        "unwatched_count": sum(
            (result.movie.title.casefold(), result.movie.year) not in watched for result in results
        ),
        "displayed_unwatched_count": sum(not film["watched"] for film in films),
        "tmdb_match_count": tmdb_match_count,
        "films": films,
    }


def write_snapshot(snapshot: dict, output: Path) -> None:
    """Atomically replace a JSON snapshot, preserving the previous file on failure."""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    try:
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)


def refresh_snapshot_cli() -> None:
    parser = argparse.ArgumentParser(description="Refresh the static Reelrank web demo snapshot.")
    parser.add_argument("--username", default="intelkishan", help="Letterboxd username (default: intelkishan)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("web/data/snapshot.json"),
        help="JSON snapshot path (default: web/data/snapshot.json)",
    )
    args = parser.parse_args()
    snapshot = create_snapshot(args.username)
    write_snapshot(snapshot, args.output)
    print(
        f"Updated {args.output}: {snapshot['film_count']} films across {snapshot['list_count']} lists; "
        f"TMDB matched {snapshot['tmdb_match_count']} of {snapshot['displayed_film_count']} displayed films."
    )


def _genre_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def _filter_genre_from_tmdb_csv(
    results: list[MovieResult], genre_slug: str, metadata_path: Path
) -> list[MovieResult] | None:
    """Use a local TMDB export when Letterboxd's dynamic genre grid is unavailable."""
    if not metadata_path.is_file():
        return None
    genre_keys: set[tuple[str, str]] = set()
    try:
        with metadata_path.open(newline="", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                try:
                    genres = ast.literal_eval(row.get("genres", "[]") or "[]")
                except (ValueError, SyntaxError):
                    continue
                if not any(_genre_slug(str(item.get("name", ""))) == genre_slug for item in genres if isinstance(item, dict)):
                    continue
                title = (row.get("title") or row.get("original_title") or "").strip().casefold()
                year = (row.get("release_date") or "")[:4]
                if title and year:
                    genre_keys.add((title, year))
    except OSError:
        return None
    return [result for result in results if (result.movie.title.casefold(), result.movie.year) in genre_keys]


def _load_tmdb_api_key(env_path: Path = Path(".env")) -> str | None:
    """Read a TMDB v3 API key from the environment or a simple .env file."""
    if os.getenv("TMDB_API_KEY"):
        return os.environ["TMDB_API_KEY"].strip()
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if separator and key.strip() == "TMDB_API_KEY":
            value = value.strip().strip("\"'").strip()
            return value or None
    return None


def _filter_genre_from_tmdb_api(
    results: list[MovieResult],
    genre: str,
    client: Session,
    api_key: str,
    progress: Progress | None = None,
    progress_task: int | None = None,
) -> list[MovieResult]:
    """Match ranked films against TMDB's genre-filtered movie discovery results."""
    cache_path = Path(".reelrank-cache") / f"tmdb-{_genre_slug(genre)}.json"
    records = _load_tmdb_genre_cache(cache_path)
    if records is not None:
        if progress is not None and progress_task is not None:
            progress.update(
                progress_task,
                description=f"[cyan]Matching against cached TMDB {genre} data ({len(records)} titles)",
                total=1,
                completed=1,
            )
        return _match_tmdb_records(results, records)

    base_url = "https://api.themoviedb.org/3"
    genre_response = client.get(f"{base_url}/genre/movie/list", params={"api_key": api_key})
    if genre_response.status_code == 401:
        raise ValueError("TMDB rejected the API key. Check TMDB_API_KEY in your .env file.")
    genre_response.raise_for_status()
    genre_id = next(
        (item["id"] for item in genre_response.json().get("genres", []) if _genre_slug(item.get("name", "")) == _genre_slug(genre)),
        None,
    )
    if genre_id is None:
        supported = ", ".join(item["name"] for item in genre_response.json().get("genres", []))
        raise ValueError(f"Unknown TMDB genre '{genre}'. Supported genres: {supported}")

    records: set[tuple[str, str]] = set()
    first_response = client.get(
        f"{base_url}/discover/movie",
        params={"api_key": api_key, "with_genres": genre_id, "page": 1, "include_adult": "true"},
    )
    if first_response.status_code == 401:
        raise ValueError("TMDB rejected the API key. Check TMDB_API_KEY in your .env file.")
    first_response.raise_for_status()
    first_data = first_response.json()
    total_pages = max(1, min(int(first_data.get("total_pages", 0)), 500))

    def collect(page_data: dict) -> None:
        for film in page_data.get("results", []):
            title = (film.get("title") or "").casefold()
            year = (film.get("release_date") or "")[:4]
            if title:
                records.add((title, year))

    collect(first_data)
    if progress is not None and progress_task is not None:
        progress.update(progress_task, total=total_pages, completed=1,
                        description=f"[cyan]Checked TMDB 1/{total_pages} {genre} pages")
    for page in range(2, total_pages + 1):
        response = client.get(
            f"{base_url}/discover/movie",
            params={"api_key": api_key, "with_genres": genre_id, "page": page, "include_adult": "true"},
        )
        response.raise_for_status()
        collect(response.json())
        if progress is not None and progress_task is not None:
            progress.update(
                progress_task,
                completed=page,
                description=f"[cyan]Checked TMDB {page}/{total_pages} {genre} pages",
            )
    _write_tmdb_genre_cache(cache_path, records)
    return _match_tmdb_records(results, records)


def _match_tmdb_records(
    results: list[MovieResult], records: set[tuple[str, str]]
) -> list[MovieResult]:
    """Match cached or fetched TMDB title/year pairs in linear time."""
    candidates: dict[tuple[str, str], list[MovieResult]] = defaultdict(list)
    candidates_by_title: dict[str, list[MovieResult]] = defaultdict(list)
    for result in results:
        title = result.movie.title.casefold()
        candidates[(title, result.movie.year)].append(result)
        candidates_by_title[title].append(result)

    matches: dict[str, MovieResult] = {}
    for title, year in records:
        found = candidates.get((title, year), [])
        if not found:
            found = [result for result in candidates_by_title.get(title, []) if not result.movie.year or not year]
        for result in found:
            matches[_movie_key(result.movie)] = result
    return sorted(matches.values(), key=lambda result: (-result.liked_in, result.movie.title.lower(), result.movie.year))


def _load_tmdb_genre_cache(cache_path: Path) -> set[tuple[str, str]] | None:
    try:
        payload = json.loads(cache_path.read_text(encoding="utf-8"))
        fetched_at = datetime.fromisoformat(payload["fetched_at"])
        if datetime.now(timezone.utc) - fetched_at > timedelta(days=30):
            return None
        return {(str(title), str(year)) for title, year in payload["movies"]}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _write_tmdb_genre_cache(cache_path: Path, records: set[tuple[str, str]]) -> None:
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "movies": sorted(records),
        }
        cache_path.write_text(json.dumps(payload), encoding="utf-8")
    except OSError:
        # Caching improves repeat runs but should not block the current result.
        return


def build_tmdb_genre_caches(
    client: Session,
    api_key: str,
    metadata_path: Path = Path("movies_metadata.csv"),
    progress: Progress | None = None,
    progress_task: int | None = None,
) -> dict[str, set[tuple[str, str]]]:
    """Build per-genre caches from one TMDB discovery scan, supplemented by a local export."""
    base_url = "https://api.themoviedb.org/3"
    genre_response = client.get(f"{base_url}/genre/movie/list", params={"api_key": api_key})
    if genre_response.status_code == 401:
        raise ValueError("TMDB rejected the API key. Check TMDB_API_KEY in your .env file.")
    genre_response.raise_for_status()
    genres = genre_response.json().get("genres", [])
    by_id = {int(item["id"]): item["name"] for item in genres}
    cache_dir = Path(".reelrank-cache")
    cached_genres = {
        item["name"]: _load_tmdb_genre_cache(cache_dir / f"tmdb-{_genre_slug(item['name'])}.json")
        for item in genres
    }
    if cached_genres and all(records is not None for records in cached_genres.values()):
        return {name: records for name, records in cached_genres.items() if records is not None}
    genre_records: dict[str, set[tuple[str, str]]] = {
        item["name"]: set() for item in genres
    }

    # A local TMDB CSV can extend the API's popular discovery window, especially
    # for older and less popular films.
    if metadata_path.is_file():
        try:
            with metadata_path.open(newline="", encoding="utf-8-sig") as file:
                for row in csv.DictReader(file):
                    try:
                        local_genres = ast.literal_eval(row.get("genres", "[]") or "[]")
                    except (ValueError, SyntaxError):
                        continue
                    title = (row.get("title") or row.get("original_title") or "").strip().casefold()
                    year = (row.get("release_date") or "")[:4]
                    if not title or not year:
                        continue
                    for local_genre in local_genres:
                        if not isinstance(local_genre, dict):
                            continue
                        genre_name = next(
                            (name for name in genre_records if _genre_slug(name) == _genre_slug(str(local_genre.get("name", "")))),
                            None,
                        )
                        if genre_name:
                            genre_records[genre_name].add((title, year))
        except OSError:
            pass

    first_response = client.get(
        f"{base_url}/discover/movie",
        params={"api_key": api_key, "page": 1, "include_adult": "true"},
    )
    if first_response.status_code == 401:
        raise ValueError("TMDB rejected the API key. Check TMDB_API_KEY in your .env file.")
    first_response.raise_for_status()
    first_data = first_response.json()
    total_pages = max(1, min(int(first_data.get("total_pages", 0)), 500))

    def collect(page_data: dict) -> None:
        for film in page_data.get("results", []):
            title = (film.get("title") or "").strip().casefold()
            year = (film.get("release_date") or "")[:4]
            if not title or not year:
                continue
            for genre_id in film.get("genre_ids", []):
                genre_name = by_id.get(int(genre_id))
                if genre_name:
                    genre_records[genre_name].add((title, year))

    collect(first_data)
    if progress is not None and progress_task is not None:
        progress.update(progress_task, total=total_pages, completed=1,
                        description=f"[cyan]Building genre cache: page 1/{total_pages}")
    for page in range(2, total_pages + 1):
        response = client.get(
            f"{base_url}/discover/movie",
            params={"api_key": api_key, "page": page, "include_adult": "true"},
        )
        response.raise_for_status()
        collect(response.json())
        if progress is not None and progress_task is not None:
            progress.update(progress_task, completed=page,
                            description=f"[cyan]Building genre cache: page {page}/{total_pages}")

    for genre_name, records in genre_records.items():
        _write_tmdb_genre_cache(cache_dir / f"tmdb-{_genre_slug(genre_name)}.json", records)
    return genre_records


def filter_genre(
    results: list[MovieResult],
    genre: str,
    client: Session,
    metadata_path: Path = Path("movies_metadata.csv"),
    tmdb_api_key: str | None = None,
    progress: Progress | None = None,
    progress_task: int | None = None,
) -> list[MovieResult]:
    """Keep ranked movies found on Letterboxd's paginated genre browse page."""
    genre_slug = _genre_slug(genre)
    if not genre_slug:
        raise ValueError("Please provide a genre name")
    candidates: dict[tuple[str, str], list[MovieResult]] = defaultdict(list)
    candidates_by_title: dict[str, list[MovieResult]] = defaultdict(list)
    candidate_uris: dict[str, list[MovieResult]] = defaultdict(list)
    for result in results:
        title_key = result.movie.title.casefold()
        candidates[(title_key, result.movie.year)].append(result)
        candidates_by_title[title_key].append(result)
        if result.movie.uri:
            candidate_uris[result.movie.uri.rstrip("/")].append(result)

    matches: dict[str, MovieResult] = {}
    page_url: str | None = f"https://letterboxd.com/films/genre/{genre_slug}/"
    visited_pages: set[str] = set()
    max_pages = 5000
    scanned_movies = 0
    for page_number in range(1, max_pages + 1):
        if page_url is None or page_url in visited_pages:
            break
        visited_pages.add(page_url)
        response = client.get(page_url)
        response.raise_for_status()
        page_movies, next_url = parse_list_page(response.text, str(response.url))
        scanned_movies += len(page_movies)
        if page_number == 1 and not page_movies:
            if tmdb_api_key:
                return _filter_genre_from_tmdb_api(results, genre, client, tmdb_api_key, progress, progress_task)
            local_matches = _filter_genre_from_tmdb_csv(results, genre_slug, metadata_path)
            if local_matches is not None:
                if progress is not None and progress_task is not None:
                    progress.update(
                        progress_task,
                        description=f"[green]Matched {len(local_matches)} {genre} films from local TMDB data",
                        total=1,
                        completed=1,
                    )
                return sorted(
                    local_matches,
                    key=lambda result: (-result.liked_in, result.movie.title.lower(), result.movie.year),
                )
            raise ValueError(
                f"Letterboxd returned no films on the {genre} genre page, and metadata fallback file "
                f"'{metadata_path}' could not be used. The page markup may have changed or access may be restricted."
            )
        for movie in page_movies:
            page_uri = movie.uri.rstrip("/")
            found = candidate_uris.get(page_uri, []) if page_uri else []
            if not found:
                found = candidates.get((movie.title.casefold(), movie.year), [])
            if not found:
                found = [
                    result
                    for result in candidates_by_title.get(movie.title.casefold(), [])
                    if not result.movie.year or not movie.year
                ]
            for result in found:
                matches[_movie_key(result.movie)] = result
        if progress is not None and progress_task is not None:
            progress.update(
                progress_task,
                description=f"[cyan]Checked {page_number} {genre} pages; matched {len(matches)} films",
            )
            progress.advance(progress_task)
        if not next_url or next_url in visited_pages:
            break
        page_url = next_url

    if scanned_movies == 0:
        raise ValueError(f"No films could be read from Letterboxd's {genre} genre catalog")

    return sorted(matches.values(), key=lambda result: (-result.liked_in, result.movie.title.lower(), result.movie.year))


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank movies by how many of your liked Letterboxd lists contain them.")
    parser.add_argument("username", help="Your Letterboxd username")
    parser.add_argument("--unwatched", action="store_true", help="Only show movies not already marked watched on your profile")
    parser.add_argument("--genre", help="Only include movies tagged with this Letterboxd genre (for example: Drama)")
    parser.add_argument("--all-genres", action="store_true", help="Create a separate unwatched CSV for every TMDB movie genre")
    parser.add_argument("--genre-output-dir", type=Path, default=Path("genre-lists"), help="Directory for --all-genres CSV files (default: genre-lists)")
    parser.add_argument("--metadata", type=Path, default=Path("movies_metadata.csv"), help="TMDB metadata CSV used if Letterboxd's genre page has no film grid (default: movies_metadata.csv)")
    parser.add_argument("--env-file", type=Path, default=Path(".env"), help="Environment file containing TMDB_API_KEY (default: .env)")
    parser.add_argument("--output", type=Path, default=Path("liked-list-movies.csv"), help="CSV output path (default: liked-list-movies.csv)")
    args = parser.parse_args()

    try:
        if args.all_genres and args.genre:
            raise ValueError("Use either --genre or --all-genres, not both")
        tmdb_api_key = _load_tmdb_api_key(args.env_file)
        genre_match_count: int | None = None
        all_genre_counts: dict[str, int] | None = None
        with curl_requests.Session(impersonate="chrome", allow_redirects=True, timeout=30.0) as client:
            with Progress(
                SpinnerColumn(spinner_name="dots"),
                TextColumn("{task.description}"),
                BarColumn(bar_width=28),
                TaskProgressColumn(),
                TimeElapsedColumn(),
                console=Console(stderr=True),
            ) as progress:
                liked_task = progress.add_task("[cyan]Loading liked lists", total=None)
                list_urls = fetch_user_list_urls(client, args.username)
                if not list_urls:
                    raise ValueError(f"No public liked lists found for {args.username}")
                progress.update(
                    liked_task,
                    description=f"[green]Loaded {len(list_urls)} liked lists",
                    total=1,
                    completed=1,
                )

                list_task = progress.add_task("[cyan]Fetching list movies", total=len(list_urls))
                results = rank_movies(list_urls, client, progress, list_task)
                progress.update(list_task, description="[green]Fetched list movies")

                if args.all_genres:
                    if not tmdb_api_key:
                        raise ValueError("--all-genres requires TMDB_API_KEY in your .env file")
                    cache_task = progress.add_task("[cyan]Building TMDB genre caches", total=None)
                    genre_records = build_tmdb_genre_caches(
                        client, tmdb_api_key, args.metadata, progress, cache_task
                    )
                    progress.update(
                        cache_task,
                        description=f"[green]Cached {len(genre_records)} TMDB genres",
                        total=1,
                        completed=1,
                    )
                    watched_task = progress.add_task("[cyan]Loading watched films", total=None)
                    watched = fetch_user_watched_movies(client, args.username)
                    progress.update(
                        watched_task,
                        description=f"[green]Loaded {len(watched)} watched films",
                        total=1,
                        completed=1,
                    )
                    args.genre_output_dir.mkdir(parents=True, exist_ok=True)
                    all_genre_counts = {}
                    for genre_name, records in genre_records.items():
                        genre_results = _match_tmdb_records(results, records)
                        genre_results = filter_unwatched(genre_results, watched)
                        output_path = args.genre_output_dir / f"{_genre_slug(genre_name)}-unwatched.csv"
                        write_csv(genre_results, output_path)
                        all_genre_counts[genre_name] = len(genre_results)
                elif args.genre:
                    genre_task = progress.add_task(f"[cyan]Loading {args.genre} genre pages", total=None)
                    results = filter_genre(
                        results, args.genre, client, args.metadata, tmdb_api_key, progress, genre_task
                    )
                    genre_match_count = len(results)
                    progress.update(
                        genre_task,
                        description=f"[green]Found {len(results)} {args.genre} films",
                        total=1,
                        completed=1,
                    )

                if args.unwatched:
                    watched_task = progress.add_task("[cyan]Loading watched films", total=None)
                    watched = fetch_user_watched_movies(client, args.username)
                    results = filter_unwatched(results, watched)
                    progress.update(
                        watched_task,
                        description=f"[green]Loaded {len(watched)} watched films",
                        total=1,
                        completed=1,
                    )
        if all_genre_counts is not None:
            print(f"\nCreated {len(all_genre_counts)} unwatched genre CSVs in {args.genre_output_dir}.")
            print("Movies per genre: " + ", ".join(f"{name}: {count}" for name, count in all_genre_counts.items()))
        else:
            write_csv(results, args.output)
            genre_label = f" in the {args.genre} genre" if args.genre else ""
            filter_summary = f" ({genre_match_count} matched the genre before watched filtering)" if genre_match_count is not None and args.unwatched else ""
            print(f"\nRanked {len(results)} unique movies{genre_label} across {len(list_urls)} liked lists{filter_summary}.")
            print(f"CSV saved to {args.output}")
    except RequestsError as error:
        if error.response is not None and error.response.status_code == 403:
            page_url = str(error.response.url)
            print(
                "Error: Letterboxd denied this automated request (HTTP 403). "
                f"The page is {page_url}. Check that it opens while signed out in a browser; "
                "if this still happens, Letterboxd may be requiring a browser challenge or "
                "restricting automated access from your network.",
                file=sys.stderr,
            )
            raise SystemExit(1) from error
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    except OSError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1) from error
