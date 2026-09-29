"""Find movies that occur most often in a user's liked Letterboxd lists."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
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
    if link and link.get("href"):
        parsed = urlparse(urljoin(base_url, link["href"]))
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
    return Movie(title=title or uri.rstrip("/").rsplit("/", 1)[-1], year=str(year), uri=uri)


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank movies by how many of your liked Letterboxd lists contain them.")
    parser.add_argument("username", help="Your Letterboxd username")
    parser.add_argument("--unwatched", action="store_true", help="Only show movies not already marked watched on your profile")
    parser.add_argument("--output", type=Path, default=Path("liked-list-movies.csv"), help="CSV output path (default: liked-list-movies.csv)")
    args = parser.parse_args()

    try:
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
        write_csv(results, args.output)
        print(f"\nRanked {len(results)} unique movies across {len(list_urls)} liked lists.")
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
