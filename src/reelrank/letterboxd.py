from __future__ import annotations

import csv
import re
from collections import defaultdict
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests
from rich.progress import Progress

from .errors import PaginationLimitReached, PaginationStalled
from .http import ThreadLocalSessionPool, create_http_session
from .models import Movie, MovieResult

Session = curl_requests.Session

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
    poster_url = ""
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
    if image:
        poster_url = image.get("data-src") or image.get("data-original") or ""
        if not poster_url:
            srcset = image.get("srcset") or image.get("data-srcset") or ""
            poster_url = srcset.split(",", 1)[0].strip().split(" ", 1)[0]
        if not poster_url:
            image_src = image.get("src") or ""
            poster_url = "" if image_src.startswith("data:") else image_src
        if poster_url:
            poster_url = urljoin(base_url, poster_url)
    title = _clean_title(title)
    if not title and not uri:
        return None
    return Movie(
        title=title or uri.rstrip("/").rsplit("/", 1)[-1],
        year=str(year),
        uri=uri,
        poster_url=poster_url,
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
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
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
        # A repeated next link or an empty page with a next link means the
        # crawl is incomplete, so do not return it as a full list.
        if not added and next_url is not None:
            raise PaginationStalled(f"List pagination stopped advancing at {page_url}.")
        if next_url in visited_pages:
            raise PaginationStalled(f"List pagination repeated {next_url}.")
        if not added:
            break
        page_url = next_url
    else:
        if page_url is not None:
            raise PaginationLimitReached(
                f"List pagination exceeded the {max_pages}-page limit; more pages may remain at {page_url}."
            )
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
    if max_pages < 1:
        raise ValueError("max_pages must be at least 1")
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
            raise PaginationStalled(f"Liked-list pagination repeated {next_url}.")
        page_url = next_url
    else:
        if page_url is not None:
            raise PaginationLimitReached(
                f"Liked-list pagination exceeded the {max_pages}-page limit; more pages may remain at {page_url}."
            )
    return list_urls

def fetch_user_watched_movies(client: Session, username: str, max_pages: int = 100) -> set[tuple[str, str]]:
    """Fetch all films marked watched on a user's public Films page."""
    movies = fetch_list(client, urljoin(_username_url(username), "films/"), max_pages=max_pages)
    return {(movie.title.casefold(), movie.year) for movie in movies if movie.title}

def rank_movies(
    list_urls: list[str],
    progress: Progress | None = None,
    progress_task: int | None = None,
    session_factory: Callable[[], Session] = create_http_session,
) -> list[MovieResult]:
    occurrences: defaultdict[str, set[int]] = defaultdict(set)
    movie_by_uri: dict[str, Movie] = {}

    def fetch_numbered_list(entry: tuple[int, str]) -> tuple[int, list[Movie]]:
        list_number, list_url = entry
        return list_number, fetch_list(sessions.get(), list_url)

    # Each worker reuses its own session and paginates one list at a time.
    entries = enumerate(list_urls)
    with ThreadLocalSessionPool(session_factory) as sessions:
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
