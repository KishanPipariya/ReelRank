from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from curl_cffi.requests.errors import RequestsError

from .http import ThreadLocalSessionPool, create_http_session
from .letterboxd import _username_url, fetch_user_list_urls, fetch_user_watched_movies, rank_movies
from .models import Movie, MovieResult
from .tmdb import (
    _fetch_letterboxd_tmdb_id,
    _fetch_tmdb_movie_genres,
    _load_tmdb_api_key,
    _load_tmdb_metadata_cache,
    _tmdb_metadata_key,
    _tmdb_metadata_payload,
    _select_tmdb_candidate,
    _write_tmdb_metadata_cache,
)

SNAPSHOT_SCHEMA_VERSION = 1


def validate_snapshot(snapshot: object) -> dict:
    """Validate the public snapshot contract before saving or rendering it."""
    if not isinstance(snapshot, dict):
        raise ValueError("Snapshot must be a JSON object")
    if not _is_nonnegative_integer(snapshot.get("schema_version")) or snapshot["schema_version"] != SNAPSHOT_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported snapshot schema version {snapshot.get('schema_version')!r}; "
            f"expected {SNAPSHOT_SCHEMA_VERSION}"
        )

    string_fields = ("username", "profile_url", "refreshed_at")
    if any(not isinstance(snapshot.get(field), str) or not snapshot[field].strip() for field in string_fields):
        raise ValueError("Snapshot username, profile_url, and refreshed_at must be non-empty strings")

    count_fields = (
        "list_count",
        "film_count",
        "displayed_film_count",
        "unwatched_count",
        "displayed_unwatched_count",
        "tmdb_match_count",
    )
    if any(not _is_nonnegative_integer(snapshot.get(field)) for field in count_fields):
        raise ValueError("Snapshot counts must be non-negative integers")
    films = snapshot.get("films")
    if not isinstance(films, list):
        raise ValueError("Snapshot films must be an array")
    if snapshot["displayed_film_count"] != len(films) or snapshot["displayed_film_count"] > snapshot["film_count"]:
        raise ValueError("Snapshot displayed_film_count must match films and not exceed film_count")
    if snapshot["unwatched_count"] > snapshot["film_count"]:
        raise ValueError("Snapshot unwatched_count cannot exceed film_count")
    if snapshot["displayed_unwatched_count"] > snapshot["displayed_film_count"]:
        raise ValueError("Snapshot displayed_unwatched_count cannot exceed displayed_film_count")
    if snapshot["tmdb_match_count"] > snapshot["displayed_film_count"]:
        raise ValueError("Snapshot tmdb_match_count cannot exceed displayed_film_count")

    film_string_fields = (
        "title",
        "year",
        "letterboxd_title",
        "letterboxd_year",
        "letterboxd_url",
        "poster_url",
        "backdrop_url",
        "overview",
        "tmdb_url",
    )
    for index, film in enumerate(films):
        if not isinstance(film, dict):
            raise ValueError(f"Snapshot film {index} must be an object")
        if any(not isinstance(film.get(field), str) for field in film_string_fields):
            raise ValueError(f"Snapshot film {index} has an invalid string field")
        if not film["title"].strip():
            raise ValueError(f"Snapshot film {index} must have a title")
        if not isinstance(film.get("watched"), bool):
            raise ValueError(f"Snapshot film {index} watched must be a boolean")
        if not _is_nonnegative_integer(film.get("liked_in")):
            raise ValueError(f"Snapshot film {index} liked_in must be a non-negative integer")
        if not _is_string_list(film.get("genres")) or not _is_string_list(film.get("lists")):
            raise ValueError(f"Snapshot film {index} genres and lists must be arrays of strings")
        if "directors" in film and not _is_string_list(film["directors"]):
            raise ValueError(f"Snapshot film {index} directors must be an array of strings")
        if "countries" in film and not _is_string_list(film["countries"]):
            raise ValueError(f"Snapshot film {index} countries must be an array of strings")
        runtime = film.get("runtime_minutes")
        if runtime is not None and (not _is_nonnegative_integer(runtime) or runtime == 0):
            raise ValueError(f"Snapshot film {index} runtime_minutes must be a positive integer or null")
        tmdb_id = film.get("tmdb_id")
        if tmdb_id is not None and not _is_nonnegative_integer(tmdb_id):
            raise ValueError(f"Snapshot film {index} tmdb_id must be an integer or null")
        rating = film.get("tmdb_rating")
        if rating is not None and (
            isinstance(rating, bool) or not isinstance(rating, (int, float)) or not math.isfinite(rating)
        ):
            raise ValueError(f"Snapshot film {index} tmdb_rating must be a number or null")

    actual_displayed_unwatched = sum(not film["watched"] for film in films)
    if snapshot["displayed_unwatched_count"] != actual_displayed_unwatched:
        raise ValueError("Snapshot displayed_unwatched_count does not match the film records")
    return snapshot


def _is_nonnegative_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_string_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def create_snapshot(username: str) -> dict:
    """Fetch and serialize one user's ranked liked-list films for the web demo."""
    username = username.strip().strip("/")
    tmdb_api_key = _load_tmdb_api_key()

    with create_http_session() as client:
        list_urls = fetch_user_list_urls(client, username)
        if not list_urls:
            raise ValueError(f"No public liked lists found for {username}")
        results = rank_movies(list_urls)
        watched = fetch_user_watched_movies(client, username)

        # Resolve movie metadata for the highest-ranked films through TMDB.
        featured_results = results[:500]
        metadata: dict[int, dict | None] = {}
        tmdb_match_count = 0
        tmdb_cache_path = Path(".reelrank-cache") / "tmdb-film-metadata-v4.json"
        tmdb_cache = _load_tmdb_metadata_cache(tmdb_cache_path)
        missing_metadata: list[tuple[int, MovieResult, str]] = []
        for index, result in enumerate(featured_results):
            cache_key = _tmdb_metadata_key(result.movie)
            if cache_key in tmdb_cache:
                cached = tmdb_cache[cache_key]
                if isinstance(cached, dict) and (
                    (tmdb_api_key and all(field in cached for field in ("genres", "directors", "countries", "runtime_minutes")) and cached.get("metadata_details_loaded"))
                    or (not tmdb_api_key and cached.get("tmdb_id"))
                ):
                    metadata[index] = cached
                else:
                    missing_metadata.append((index, result, cache_key))
            else:
                missing_metadata.append((index, result, cache_key))

        if missing_metadata:
            genre_names = _fetch_tmdb_movie_genres(client, tmdb_api_key) if tmdb_api_key else {}

            def fetch_tmdb_metadata(entry: tuple[int, MovieResult, str]) -> tuple[int, str, dict | None, bool]:
                index, result, cache_key = entry
                worker_client = worker_sessions.get()
                movie = result.movie
                letterboxd_tmdb_id = _fetch_letterboxd_tmdb_id(worker_client, movie.uri)
                if letterboxd_tmdb_id is not None:
                    record = {"id": letterboxd_tmdb_id}
                    cacheable = True
                    if tmdb_api_key:
                        try:
                            response = worker_client.get(
                                f"https://api.themoviedb.org/3/movie/{letterboxd_tmdb_id}",
                                params={"api_key": tmdb_api_key, "language": "en-US", "append_to_response": "credits"},
                            )
                            if response.status_code == 401:
                                raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
                            response.raise_for_status()
                            details = response.json()
                            if details.get("id") == letterboxd_tmdb_id:
                                record = details
                            else:
                                cacheable = False
                        except RequestsError:
                            cacheable = False
                    return index, cache_key, _tmdb_metadata_payload(movie, record), cacheable

                if not tmdb_api_key:
                    return index, cache_key, None, False

                try:
                    response = worker_client.get(
                        "https://api.themoviedb.org/3/search/movie",
                        params={
                            "api_key": tmdb_api_key,
                            "query": movie.title,
                            **({"year": movie.year} if movie.year.isdigit() else {}),
                        },
                    )
                    if response.status_code == 401:
                        raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
                    response.raise_for_status()
                    candidates = response.json().get("results", [])
                    fallback_title = None
                    if not candidates and "," in movie.title:
                        short_title = movie.title.split(",", 1)[0].strip()
                        if short_title:
                            fallback_title = short_title
                            response = worker_client.get(
                                "https://api.themoviedb.org/3/search/movie",
                                params={
                                    "api_key": tmdb_api_key,
                                    "query": short_title,
                                    **({"year": result.movie.year} if result.movie.year.isdigit() else {}),
                                },
                            )
                            if response.status_code == 401:
                                raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
                            response.raise_for_status()
                            candidates = response.json().get("results", [])
                    if not candidates:
                        return index, cache_key, None, False

                    best = _select_tmdb_candidate(movie, candidates, fallback_title)
                    if best is None:
                        return index, cache_key, None, False
                    best_id = best.get("id")
                    if not isinstance(best_id, int):
                        return index, cache_key, _tmdb_metadata_payload(movie, best, genre_names), False
                    details_response = worker_client.get(
                        f"https://api.themoviedb.org/3/movie/{best_id}",
                        params={"api_key": tmdb_api_key, "language": "en-US", "append_to_response": "credits"},
                    )
                    if details_response.status_code == 401:
                        raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
                    details_response.raise_for_status()
                    details = details_response.json()
                    record = details if details.get("id") == best_id else best
                    return index, cache_key, _tmdb_metadata_payload(movie, record, genre_names), True
                except RequestsError:
                    return index, cache_key, None, False

            with ThreadLocalSessionPool() as worker_sessions:
                with ThreadPoolExecutor(max_workers=6) as executor:
                    for index, cache_key, value, cacheable in executor.map(fetch_tmdb_metadata, missing_metadata):
                        metadata[index] = value
                        if cacheable and value is not None:
                            tmdb_cache[cache_key] = value
            _write_tmdb_metadata_cache(tmdb_cache_path, tmdb_cache)
        tmdb_match_count = sum(value is not None for value in metadata.values())
        if tmdb_api_key and not tmdb_match_count:
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
                "poster_url": tmdb.get("poster_url") or movie.poster_url,
                "backdrop_url": tmdb.get("backdrop_url", ""),
                "overview": tmdb.get("overview", ""),
                "tmdb_id": tmdb.get("tmdb_id"),
                "tmdb_url": tmdb.get("tmdb_url", ""),
                "tmdb_rating": tmdb.get("tmdb_rating"),
                "genres": tmdb.get("genres", []),
                "directors": tmdb.get("directors", []),
                "countries": tmdb.get("countries", []),
                "runtime_minutes": tmdb.get("runtime_minutes"),
                "liked_in": result.liked_in,
                "watched": is_watched,
                "lists": result.lists,
            }
        )

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    snapshot = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
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
    return validate_snapshot(snapshot)

def write_snapshot(snapshot: dict, output: Path) -> None:
    """Atomically replace a JSON snapshot, preserving the previous file on failure."""
    validate_snapshot(snapshot)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.tmp")
    try:
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
