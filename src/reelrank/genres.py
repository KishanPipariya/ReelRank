from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

from curl_cffi import requests as curl_requests
from rich.progress import Progress

from .errors import PaginationLimitReached, PaginationStalled
from .letterboxd import _movie_key, parse_list_page
from .models import MovieResult
from .tmdb import _filter_genre_from_tmdb_api, _filter_genre_from_tmdb_csv, _genre_slug

Session = curl_requests.Session

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
        if page_url is None:
            break
        if page_url in visited_pages:
            raise PaginationStalled(f"Letterboxd's {genre} genre catalog repeated {page_url}.")
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
            if next_url in visited_pages:
                raise PaginationStalled(f"Letterboxd's {genre} genre catalog repeated {next_url}.")
            break
        page_url = next_url

    if page_url is not None and len(visited_pages) >= max_pages:
        raise PaginationLimitReached(
            f"Letterboxd's {genre} genre catalog exceeded the {max_pages}-page limit; more pages may remain at {page_url}."
        )

    if scanned_movies == 0:
        raise ValueError(f"No films could be read from Letterboxd's {genre} genre catalog")

    return sorted(matches.values(), key=lambda result: (-result.liked_in, result.movie.title.lower(), result.movie.year))
