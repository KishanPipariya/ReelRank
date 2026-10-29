from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from urllib.parse import unquote, urlparse

from .fileio import atomic_write_bytes, atomic_write_text
from .http import ThreadLocalSessionPool, create_http_session
from .letterboxd import _username_url, fetch_user_list_urls, fetch_user_watched_movies, movie_is_watched, rank_movies
from .metadata import resolve_movie_metadata
from .models import Movie, MovieResult
from .tmdb import (
    _fetch_tmdb_movie_genres,
    _load_tmdb_api_key,
    _load_tmdb_metadata_cache,
    _tmdb_metadata_key,
    _write_tmdb_metadata_cache,
)

METADATA_CACHE_DAYS = 30


def validate_snapshot(snapshot: object) -> dict:
    """Validate the public snapshot contract before saving or rendering it."""
    if not isinstance(snapshot, dict) or snapshot.get("schema_version") != SNAPSHOT_SCHEMA_VERSION:
        version = snapshot.get("schema_version") if isinstance(snapshot, dict) else None
        raise ValueError(f"Unsupported snapshot schema version {version!r}; expected {SNAPSHOT_SCHEMA_VERSION}")
    _validate_schema(snapshot, _snapshot_schema())
    username = snapshot["username"].strip().strip("/")
    profile = urlparse(snapshot["profile_url"])
    if (
        profile.scheme != "https"
        or profile.hostname not in {"letterboxd.com", "www.letterboxd.com"}
        or profile.port not in (None, 443)
        or profile.username is not None
        or profile.password is not None
        or profile.query
        or profile.fragment
        or unquote(profile.path).rstrip("/").casefold() != f"/{username}".casefold()
    ):
        raise ValueError("Snapshot profile_url must be the HTTPS Letterboxd profile for its username")
    try:
        refreshed_at = datetime.fromisoformat(snapshot["refreshed_at"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Snapshot refreshed_at must be an ISO 8601 timestamp with a timezone") from error
    if refreshed_at.tzinfo is None:
        raise ValueError("Snapshot refreshed_at must be an ISO 8601 timestamp with a timezone")

    films = snapshot.get("films")
    source_lists = snapshot.get("source_lists")
    if isinstance(source_lists, list):
        if len(set(source_lists)) != len(source_lists):
            raise ValueError("Snapshot source_lists cannot contain duplicates")
        if any(not _is_letterboxd_list_url(url) for url in source_lists):
            raise ValueError("Snapshot source_lists must contain HTTPS Letterboxd list URLs")
    for index, film in enumerate(films):
        if "lists" not in film and "list_ids" not in film:
            raise ValueError(f"snapshot.films[{index}] must include lists or list_ids")
        if film["letterboxd_url"] and not _is_letterboxd_film_url(film["letterboxd_url"]):
            raise ValueError(f"snapshot.films[{index}].letterboxd_url must be an HTTPS Letterboxd film URL")
        if "lists" in film:
            if len(set(film["lists"])) != len(film["lists"]):
                raise ValueError(f"snapshot.films[{index}].lists cannot contain duplicates")
            if any(not _is_letterboxd_list_url(url) for url in film["lists"]):
                raise ValueError(f"snapshot.films[{index}].lists must contain HTTPS Letterboxd list URLs")
        if "list_ids" in film:
            if not isinstance(source_lists, list) or any(not _is_nonnegative_integer(item) or item >= len(source_lists) for item in film["list_ids"]):
                raise ValueError(f"snapshot.films[{index}].list_ids references an unavailable source list")
            if len(set(film["list_ids"])) != len(film["list_ids"]):
                raise ValueError(f"snapshot.films[{index}].list_ids cannot contain duplicates")
    if snapshot["displayed_film_count"] != len(films) or snapshot["displayed_film_count"] > snapshot["film_count"]:
        raise ValueError("Snapshot displayed_film_count must match films and not exceed film_count")
    if snapshot["unwatched_count"] > snapshot["film_count"]:
        raise ValueError("Snapshot unwatched_count cannot exceed film_count")
    if snapshot["displayed_unwatched_count"] > snapshot["displayed_film_count"]:
        raise ValueError("Snapshot displayed_unwatched_count cannot exceed displayed_film_count")
    if snapshot["tmdb_match_count"] > snapshot["displayed_film_count"]:
        raise ValueError("Snapshot tmdb_match_count cannot exceed displayed_film_count")

    actual_displayed_unwatched = sum(not film["watched"] for film in films)
    if snapshot["displayed_unwatched_count"] != actual_displayed_unwatched:
        raise ValueError("Snapshot displayed_unwatched_count does not match the film records")
    return snapshot


def _is_letterboxd_list_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return (
            parsed.scheme == "https"
            and parsed.hostname in {"letterboxd.com", "www.letterboxd.com"}
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
            and not parsed.query
            and not parsed.fragment
            and re.fullmatch(r"/[^/]+/list/[^/]+/?", parsed.path) is not None
        )
    except ValueError:
        return False


def _is_letterboxd_film_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return (
            parsed.scheme == "https"
            and parsed.hostname in {"letterboxd.com", "www.letterboxd.com"}
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
            and not parsed.query
            and not parsed.fragment
            and re.fullmatch(r"/film/[^/]+/?", parsed.path) is not None
        )
    except ValueError:
        return False


@lru_cache(maxsize=1)
def _snapshot_schema() -> dict:
    return json.loads(files("reelrank").joinpath("snapshot.schema.json").read_text(encoding="utf-8"))


SNAPSHOT_SCHEMA_VERSION = _snapshot_schema()["properties"]["schema_version"]["const"]


def _is_nonnegative_integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 9007199254740991


def _is_schema_integer(value: object) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or abs(value) > 9007199254740991:
        return False
    if isinstance(value, float):
        return math.isfinite(value) and value.is_integer()
    return True


def _spreadsheet_safe_cell(value: object) -> object:
    """Prevent untrusted text fields from being interpreted as spreadsheet formulas."""
    if isinstance(value, str) and re.match(r"^[\x00-\x20]*[=+\-@]", value):
        return f"'{value}"
    return value


def _validate_schema(value: object, schema: dict, root: dict | None = None, path: str = "snapshot") -> None:
    root = schema if root is None else root
    if "$ref" in schema:
        target = root
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part.replace("~1", "/").replace("~0", "~")]
        _validate_schema(value, target, root, path)
        return
    if "anyOf" in schema:
        for alternative in schema["anyOf"]:
            try:
                _validate_schema(value, alternative, root, path)
                break
            except ValueError:
                continue
        else:
            raise ValueError(f"{path} does not match its schema")
        return
    expected = schema.get("type")
    valid_type = {
        "object": lambda item: isinstance(item, dict),
        "array": lambda item: isinstance(item, list),
        "string": lambda item: isinstance(item, str),
        "boolean": lambda item: isinstance(item, bool),
        "integer": _is_schema_integer,
        "number": lambda item: isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item),
        "null": lambda item: item is None,
    }.get(expected, lambda _item: True)
    if not valid_type(value):
        raise ValueError(f"{path} must be {expected}")
    if "const" in schema and value != schema["const"]:
        raise ValueError(f"{path} has an unsupported value")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{path} has an unsupported value")
    if isinstance(value, str) and len(value) < schema.get("minLength", 0):
        raise ValueError(f"{path} must not be empty")
    if isinstance(value, str) and "pattern" in schema and re.search(schema["pattern"], value) is None:
        raise ValueError(f"{path} does not match its required text pattern")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value < schema.get("minimum", float("-inf")) or value > schema.get("maximum", float("inf")):
            raise ValueError(f"{path} is outside the supported range")
    if isinstance(value, dict):
        for field in schema.get("required", []):
            if field not in value:
                raise ValueError(f"{path}.{field} is required")
        for field, child_schema in schema.get("properties", {}).items():
            if field in value:
                _validate_schema(value[field], child_schema, root, f"{path}.{field}")
    if isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            _validate_schema(item, schema["items"], root, f"{path}[{index}]")


def _metadata_cache_is_fresh(value: object, now: datetime, needs_details: bool) -> bool:
    if not isinstance(value, dict) or not _is_nonnegative_integer(value.get("tmdb_id")) or not value["tmdb_id"]:
        return False
    if needs_details and not value.get("metadata_details_loaded"):
        return False
    fetched_at = value.get("metadata_fetched_at")
    if not isinstance(fetched_at, str):
        return False
    try:
        timestamp = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if timestamp.tzinfo is None or now.tzinfo is None:
        return False
    age = now - timestamp
    return timedelta(0) <= age <= timedelta(days=METADATA_CACHE_DAYS)


def create_snapshot(username: str) -> dict:
    """Fetch and serialize one user's ranked liked-list films for the web demo."""
    username = username.strip().strip("/")
    tmdb_api_key = _load_tmdb_api_key()
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    generated_at_text = generated_at.isoformat().replace("+00:00", "Z")

    with create_http_session() as client:
        list_urls = fetch_user_list_urls(client, username)
        if not list_urls:
            raise ValueError(f"No public liked lists found for {username}")
        results = rank_movies(list_urls)
        watched = fetch_user_watched_movies(client, username)

        # Resolve movie metadata for the highest-ranked films through TMDB.
        featured_results = results[:500]
        metadata: dict[int, dict | None] = {}
        poster_galleries: dict[str, list[dict[str, str]]] = {}
        tmdb_match_count = 0
        tmdb_cache_path = Path(".reelrank-cache") / "tmdb-film-metadata-v6.json"
        tmdb_cache = _load_tmdb_metadata_cache(tmdb_cache_path)
        missing_metadata: list[tuple[int, MovieResult, str]] = []
        for index, result in enumerate(featured_results):
            cache_key = _tmdb_metadata_key(result.movie)
            if cache_key in tmdb_cache:
                cached = tmdb_cache[cache_key]
                if _metadata_cache_is_fresh(cached, generated_at, bool(tmdb_api_key)):
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
                value, cacheable, source = resolve_movie_metadata(worker_client, result.movie, tmdb_api_key, genre_names)
                if value is not None:
                    value.update({
                        "metadata_source": source,
                        "metadata_fetched_at": generated_at_text,
                        "metadata_status": "complete" if value.get("metadata_details_loaded") else ("id_only" if value.get("tmdb_id") else "partial"),
                    })
                return index, cache_key, value, cacheable

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
        is_watched = movie_is_watched(movie, watched)
        tmdb = metadata.get(index) or {}
        tmdb_id = tmdb.get("tmdb_id")
        poster_gallery = tmdb.get("poster_gallery")
        if isinstance(tmdb_id, int) and not isinstance(tmdb_id, bool) and isinstance(poster_gallery, list):
            valid_posters = [
                poster for poster in poster_gallery
                if isinstance(poster, dict)
                and isinstance(poster.get("path"), str)
                and poster["path"].startswith("/")
            ]
            if valid_posters:
                poster_galleries[str(tmdb_id)] = valid_posters
        films.append(
            {
                "title": tmdb.get("title") or movie.title,
                "original_title": tmdb.get("original_title") or tmdb.get("title") or movie.title,
                "original_language": tmdb.get("original_language", ""),
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
                "metadata_source": tmdb.get("metadata_source", ""),
                "metadata_fetched_at": tmdb.get("metadata_fetched_at", ""),
                "metadata_status": tmdb.get("metadata_status", "unavailable"),
                "liked_in": result.liked_in,
                "watched": is_watched,
                "lists": result.lists,
            }
        )

    source_lists = list(dict.fromkeys(url for film in films for url in film["lists"]))
    source_list_index = {url: index for index, url in enumerate(source_lists)}
    for film in films:
        film["list_ids"] = [source_list_index[url] for url in film.pop("lists")]

    ranking_signature = [
        [result.movie.uri, result.movie.title, result.movie.year, result.liked_in, movie_is_watched(result.movie, watched)]
        for result in results
    ]
    ranking_digest = hashlib.sha256(
        json.dumps(ranking_signature, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()[:12]
    snapshot = {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "username": username,
        "profile_url": _username_url(username),
        "refreshed_at": generated_at_text,
        "poster_gallery_url": (
            f"/data/poster-galleries-{generated_at.strftime('%Y%m%dT%H%M%SZ')}-"
            f"{hashlib.sha256(json.dumps(poster_galleries, sort_keys=True).encode()).hexdigest()[:12]}.json"
        ),
        "ranking_csv_url": f"/data/ranking-{generated_at.strftime('%Y%m%dT%H%M%SZ')}-{ranking_digest}.csv",
        "ranking_gzip_url": f"/data/ranking-{generated_at.strftime('%Y%m%dT%H%M%SZ')}-{ranking_digest}.csv.gz",
        "list_count": len(list_urls),
        "film_count": len(results),
        "displayed_film_count": len(films),
        "unwatched_count": sum(
            not movie_is_watched(result.movie, watched) for result in results
        ),
        "displayed_unwatched_count": sum(not film["watched"] for film in films),
        "tmdb_match_count": tmdb_match_count,
        "films": films,
        "source_lists": source_lists,
        "_poster_galleries": {
            "schema_version": 1,
            "snapshot_refreshed_at": generated_at_text,
            "galleries": poster_galleries,
        },
        "_full_ranking": results,
        "_watched": watched,
    }
    return validate_snapshot(snapshot)

def write_snapshot(snapshot: dict, output: Path) -> None:
    """Write the snapshot and sidecar files using atomic file replacements."""
    validate_snapshot(snapshot)
    gallery_name = Path(snapshot.get("poster_gallery_url", "/data/poster-galleries.json")).name
    gallery_output = output.parent / gallery_name
    ranking_name = Path(snapshot.get("ranking_csv_url", "")).name
    ranking_output = output.parent / ranking_name if ranking_name else None
    ranking_gzip_name = Path(snapshot.get("ranking_gzip_url", "")).name
    ranking_gzip_output = output.parent / ranking_gzip_name if ranking_gzip_name else None
    private_fields = {"_poster_galleries", "_full_ranking", "_watched"}
    public_snapshot = {key: value for key, value in snapshot.items() if key not in private_fields}
    gallery_payload = snapshot.get("_poster_galleries") or {
        "schema_version": 1,
        "snapshot_refreshed_at": snapshot["refreshed_at"],
        "galleries": {},
    }
    full_ranking = snapshot.get("_full_ranking")
    watched = snapshot.get("_watched", set())
    ranking_csv = None
    if ranking_output is not None:
        if not isinstance(full_ranking, list) or len(full_ranking) != snapshot["film_count"]:
            raise ValueError("Snapshot declares a full-ranking CSV but contains no full ranking data")
        from .letterboxd import movie_is_watched

        csv_buffer = io.StringIO(newline="")
        writer = csv.writer(csv_buffer)
        writer.writerow(["Rank", "Title", "Year", "Watched", "Liked in lists", "Letterboxd URI", "List URLs"])
        for rank, result in enumerate(full_ranking, start=1):
            writer.writerow([
                _spreadsheet_safe_cell(rank),
                _spreadsheet_safe_cell(result.movie.title),
                _spreadsheet_safe_cell(result.movie.year),
                _spreadsheet_safe_cell("yes" if movie_is_watched(result.movie, watched) else "no"),
                _spreadsheet_safe_cell(result.liked_in),
                _spreadsheet_safe_cell(result.movie.uri),
                _spreadsheet_safe_cell(" ".join(result.lists)),
            ])
        ranking_csv = csv_buffer.getvalue()

    atomic_write_text(
        gallery_output,
        json.dumps(gallery_payload, ensure_ascii=False, separators=(",", ":")) + "\n",
    )
    if ranking_output is not None and ranking_csv is not None:
        atomic_write_text(ranking_output, ranking_csv)
        if ranking_gzip_output is not None:
            atomic_write_bytes(
                ranking_gzip_output,
                gzip.compress(ranking_csv.encode("utf-8"), mtime=0),
            )
    atomic_write_text(output, json.dumps(public_snapshot, ensure_ascii=False, indent=2) + "\n")
