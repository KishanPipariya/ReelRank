from __future__ import annotations

import ast
import csv
import difflib
import json
import os
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests
from curl_cffi.requests.errors import RequestsError
from rich.progress import Progress

from .letterboxd import _movie_key
from .models import Movie, MovieResult

Session = curl_requests.Session

def _tmdb_metadata_key(movie: Movie) -> str:
    if movie.uri:
        return f"letterboxd:{movie.uri.rstrip('/')}"
    normalized_title = _normalize_tmdb_title(movie.title) or movie.title.casefold().strip()
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

def _normalize_tmdb_title(value: str) -> str:
    """Normalize punctuation and accents while preserving non-Latin letters."""
    normalized = unicodedata.normalize("NFKD", value.casefold())
    result: list[str] = []
    previous_base_is_latin = False
    for character in normalized:
        if unicodedata.category(character).startswith("M"):
            # Latin diacritics are usually spelling variants for matching;
            # keep combining marks in other scripts because they can change
            # the letter or pronunciation.
            if not previous_base_is_latin:
                result.append(character)
        elif character.isalnum():
            result.append(character)
            previous_base_is_latin = unicodedata.name(character, "").startswith("LATIN ")
        else:
            previous_base_is_latin = False
    return "".join(result)

def _select_tmdb_candidate(
    movie: Movie,
    candidates: list[dict],
    alternate_title: str | None = None,
) -> dict | None:
    """Choose a confidently matching TMDB result, rejecting unresolved ties."""
    target = _normalize_tmdb_title(movie.title)
    alternate = _normalize_tmdb_title(alternate_title or "")
    if not target:
        return None

    short_title = len(target) <= 4
    exact_year_threshold = 0.95 if short_title else 0.75
    scored: list[tuple[int, float, int, dict]] = []
    for candidate in candidates:
        names = {
            _normalize_tmdb_title(name)
            for name in (candidate.get("title", ""), candidate.get("original_title", ""))
            if isinstance(name, str)
        }
        names.discard("")
        targets = {target}
        if alternate:
            targets.add(alternate)
        if not names:
            continue
        score = max(
            difflib.SequenceMatcher(None, candidate_name, target_name).ratio()
            for candidate_name in names
            for target_name in targets
        )

        candidate_year = (candidate.get("release_date") or "")[:4]
        has_both_years = movie.year.isdigit() and candidate_year.isdigit()
        year_delta = abs(int(movie.year) - int(candidate_year)) if has_both_years else None
        if year_delta is not None:
            if year_delta > 1:
                continue
            year_tier = 2 if year_delta == 0 else 1
            minimum_score = exact_year_threshold if year_delta == 0 else 0.9
        else:
            # A missing date is not evidence of a year match. Require a very
            # strong title match; short titles need a usable year to be safe.
            if short_title:
                continue
            year_tier = 0
            minimum_score = 0.95

        if alternate and score < 0.9:
            continue
        if score < minimum_score:
            continue
        scored.append((year_tier, score, -(year_delta or 0), candidate))

    if not scored:
        return None

    # Prefer a strong title identity first; year should distinguish close title
    # matches, not make a different film beat an exact title one year away.
    scored.sort(key=lambda item: (item[1], item[0], item[2]), reverse=True)
    best_tier, best_score, _, best = scored[0]
    tied = [
        candidate
        for tier, score, _, candidate in scored
        if tier == best_tier and best_score - score <= 0.02
    ]
    distinct = {
        (
            candidate.get("id"),
            _normalize_tmdb_title(candidate.get("title", "")),
            _normalize_tmdb_title(candidate.get("original_title", "")),
            (candidate.get("release_date") or "")[:4],
        )
        for candidate in tied
    }
    return best if len(distinct) == 1 else None

def _fetch_letterboxd_tmdb_id(client: Session, movie_uri: str) -> int | None:
    """Read the authoritative TMDB movie ID linked from a Letterboxd film page."""
    if not movie_uri:
        return None
    try:
        response = client.get(movie_uri)
        response.raise_for_status()
    except RequestsError:
        return None

    soup = BeautifulSoup(response.text, "html.parser")
    for link in soup.select('a[href*="themoviedb.org/movie/"]'):
        parsed = urlparse(link.get("href", ""))
        if parsed.netloc.lower() not in {"themoviedb.org", "www.themoviedb.org"}:
            continue
        match = re.match(r"^/movie/(\d+)(?:[-/]|$)", parsed.path)
        if match:
            return int(match.group(1))
    return None

def _tmdb_metadata_payload(movie: Movie, record: dict, genre_names: dict[int, str] | None = None) -> dict:
    movie_id = record.get("id")
    genre_records = record.get("genres", [])
    if isinstance(genre_records, list) and genre_records and all(isinstance(item, dict) for item in genre_records):
        genres = [item["name"] for item in genre_records if isinstance(item.get("name"), str)]
    else:
        genre_names = genre_names or {}
        genres = [genre_names[genre_id] for genre_id in record.get("genre_ids", []) if genre_id in genre_names]
    poster_path = record.get("poster_path") or ""
    backdrop_path = record.get("backdrop_path") or ""
    crew = record.get("credits", {}).get("crew", []) if isinstance(record.get("credits"), dict) else []
    directors = list(dict.fromkeys(
        person["name"]
        for person in crew
        if isinstance(person, dict) and person.get("job") == "Director"
        and isinstance(person.get("name"), str) and person["name"].strip()
    )) if isinstance(crew, list) else []
    production_countries = record.get("production_countries", [])
    countries = list(dict.fromkeys(
        country["name"]
        for country in production_countries
        if isinstance(country, dict) and isinstance(country.get("name"), str) and country["name"].strip()
    )) if isinstance(production_countries, list) else []
    runtime = record.get("runtime")
    runtime_minutes = runtime if isinstance(runtime, int) and not isinstance(runtime, bool) and runtime > 0 else None
    return {
        "tmdb_id": movie_id,
        "tmdb_url": f"https://www.themoviedb.org/movie/{movie_id}" if movie_id else "",
        "title": record.get("title") or movie.title,
        "year": (record.get("release_date") or "")[:4] or movie.year,
        "overview": record.get("overview") or "",
        "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else "",
        "backdrop_url": f"https://image.tmdb.org/t/p/w780{backdrop_path}" if backdrop_path else "",
        "tmdb_rating": record.get("vote_average"),
        "genres": genres,
        "directors": directors,
        "countries": countries,
        "runtime_minutes": runtime_minutes,
        "metadata_details_loaded": isinstance(record.get("credits"), dict),
    }

def _fetch_tmdb_movie_genres(client: curl_requests.Session, api_key: str) -> dict[int, str]:
    try:
        response = client.get(
            "https://api.themoviedb.org/3/genre/movie/list",
            params={"api_key": api_key, "language": "en-US"},
        )
        if response.status_code == 401:
            raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
        response.raise_for_status()
    except RequestsError as error:
        raise ValueError("TMDB movie genre lookup failed; the previous snapshot was left unchanged") from error

    genres = response.json().get("genres", [])
    if not isinstance(genres, list):
        raise ValueError("TMDB returned an invalid movie genre list; the previous snapshot was left unchanged")
    genre_names = {
        genre["id"]: genre["name"]
        for genre in genres
        if isinstance(genre, dict) and isinstance(genre.get("id"), int) and isinstance(genre.get("name"), str)
    }
    if not genre_names:
        raise ValueError("TMDB returned no movie genres; the previous snapshot was left unchanged")
    return genre_names

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
