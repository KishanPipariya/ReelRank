"""Find movies that occur most often in a user's liked Letterboxd lists."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup


USER_AGENT = "letterboxd-liked-lists/0.1 (+https://letterboxd.com/)"


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


def read_list_urls(path: Path) -> list[str]:
    """Read list URLs from a Letterboxd ``likes/lists.csv`` export."""
    with path.open(newline="", encoding="utf-8-sig") as file:
        rows = csv.DictReader(file)
        if not rows.fieldnames or "Content" not in rows.fieldnames:
            raise ValueError(f"{path} must contain a 'Content' column")
        return [row["Content"].strip() for row in rows if row.get("Content", "").strip()]


def read_watched_movies(path: Path) -> set[tuple[str, str]]:
    """Read watched title/year pairs from a Letterboxd watched export."""
    with path.open(newline="", encoding="utf-8-sig") as file:
        rows = csv.DictReader(file)
        if not rows.fieldnames or "Name" not in rows.fieldnames:
            raise ValueError(f"{path} must contain a 'Name' column")
        return {
            (row.get("Name", "").strip().casefold(), row.get("Year", "").strip())
            for row in rows
            if row.get("Name", "").strip()
        }


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


def fetch_list(client: httpx.Client, list_url: str, max_pages: int = 100) -> list[Movie]:
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


def rank_movies(list_urls: list[str], client: httpx.Client) -> list[MovieResult]:
    occurrences: defaultdict[str, set[int]] = defaultdict(set)
    movie_by_uri: dict[str, Movie] = {}
    for list_number, list_url in enumerate(list_urls):
        print(f"Fetching list {list_number + 1}/{len(list_urls)}...", file=sys.stderr)
        movies = fetch_list(client, list_url)
        for movie in movies:
            key = _movie_key(movie)
            occurrences[key].add(list_number)
            movie_by_uri[key] = movie
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


def print_results(results: list[MovieResult]) -> None:
    if not results:
        print("No movies found. Check that the liked lists are public and the export is current.")
        return
    headers = ("#", "Movie", "Year", "Liked in")
    rows = [(str(index), result.movie.title, result.movie.year or "—", str(result.liked_in)) for index, result in enumerate(results, 1)]
    widths = [max(len(headers[i]), *(len(row[i]) for row in rows)) for i in range(4)]
    print("  ".join(headers[i].ljust(widths[i]) for i in range(4)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(row[i].ljust(widths[i]) for i in range(4)))


def filter_unwatched(results: list[MovieResult], watched: set[tuple[str, str]]) -> list[MovieResult]:
    """Remove movies present in the watched export.

    Matching uses title and year because watched exports contain boxd.it film
    URLs while scraped list pages contain canonical /film/ URLs.
    """
    return [
        result
        for result in results
        if (result.movie.title.casefold(), result.movie.year) not in watched
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank movies by how many of your liked Letterboxd lists contain them.")
    parser.add_argument("--lists", type=Path, default=Path("likes/lists.csv"), help="Letterboxd liked-lists CSV (default: likes/lists.csv)")
    parser.add_argument("--unwatched", action="store_true", help="Only show movies not present in watched.csv")
    parser.add_argument("--watched", type=Path, default=Path("watched.csv"), help="Watched export used with --unwatched (default: watched.csv)")
    parser.add_argument("--output", type=Path, default=Path("liked-list-movies.csv"), help="CSV output path (default: liked-list-movies.csv)")
    args = parser.parse_args()

    try:
        list_urls = read_list_urls(args.lists)
        if not list_urls:
            raise ValueError(f"No list URLs found in {args.lists}")
        with httpx.Client(headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=30.0) as client:
            results = rank_movies(list_urls, client)
        if args.unwatched:
            results = filter_unwatched(results, read_watched_movies(args.watched))
        write_csv(results, args.output)
        print_results(results)
        print(f"\nRanked {len(results)} unique movies across {len(list_urls)} liked lists.")
        print(f"CSV saved to {args.output}")
    except (OSError, ValueError, httpx.HTTPError) as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)


__all__ = [
    "Movie", "MovieResult", "fetch_list", "filter_unwatched", "parse_list_page",
    "rank_movies", "read_watched_movies", "main",
]
