from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from urllib.parse import unquote, urlparse
from rich.progress import Progress

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
CATALOGUE_DETAIL_SHARD_COUNT = 128


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
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", snapshot["refreshed_at"]) is None:
        raise ValueError("Snapshot refreshed_at must be an ISO 8601 calendar timestamp with a timezone")
    try:
        refreshed_at = datetime.fromisoformat(snapshot["refreshed_at"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("Snapshot refreshed_at must be an ISO 8601 timestamp with a timezone") from error
    if refreshed_at.tzinfo is None:
        raise ValueError("Snapshot refreshed_at must be an ISO 8601 timestamp with a timezone")

    films = snapshot["films"]
    source_lists = snapshot["source_lists"]
    if len(set(source_lists)) != len(source_lists):
        raise ValueError("Snapshot source_lists cannot contain duplicates")
    if any(not _is_letterboxd_list_url(url) for url in source_lists):
        raise ValueError("Snapshot source_lists must contain HTTPS Letterboxd list URLs")
    for index, film in enumerate(films):
        if film["liked_in"] > snapshot["list_count"]:
            raise ValueError(f"snapshot.films[{index}].liked_in cannot exceed list_count")
        if film["letterboxd_url"] and not _is_letterboxd_film_url(film["letterboxd_url"]):
            raise ValueError(f"snapshot.films[{index}].letterboxd_url must be an HTTPS Letterboxd film URL")
        if any(item >= len(source_lists) for item in film["list_ids"]):
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


def _canonical_letterboxd_film_url(value: str) -> str | None:
    """Return the stable Letterboxd film URL used as the catalogue record key."""
    if not isinstance(value, str) or not _is_letterboxd_film_url(value):
        return None
    parsed = urlparse(value)
    return f"https://letterboxd.com{parsed.path.rstrip('/')}/"


def _catalogue_shard_bucket(film_url: str) -> int:
    digest = hashlib.sha256(film_url.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % CATALOGUE_DETAIL_SHARD_COUNT


def _compact_json_bytes(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


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
    # Escape literal apostrophes in the same prefix for the ranking reader.
    if isinstance(value, str) and re.match(r"^'*[\x00-\x20]*[=+\-@]", value):
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
    if isinstance(value, str) and len(value) > schema.get("maxLength", float("inf")):
        raise ValueError(f"{path} exceeds the supported text length")
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
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise ValueError(f"{path} has too few items")
        if len(value) > schema.get("maxItems", float("inf")):
            raise ValueError(f"{path} has too many items")
    if isinstance(value, list) and "items" in schema:
        for index, item in enumerate(value):
            _validate_schema(item, schema["items"], root, f"{path}[{index}]")


def _metadata_cache_is_fresh(
    value: object,
    now: datetime,
    needs_details: bool,
    needs_poster_gallery: bool = False,
) -> bool:
    if not isinstance(value, dict) or not _is_nonnegative_integer(value.get("tmdb_id")) or not value["tmdb_id"]:
        return False
    if needs_details and not value.get("metadata_details_loaded"):
        return False
    if needs_poster_gallery and not value.get("metadata_poster_gallery_loaded", "poster_gallery" in value):
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


def _prefer_cached_metadata(
    cached: object,
    refreshed: dict | None,
    require_poster_gallery: bool,
    now: datetime,
) -> bool:
    """Keep richer cached metadata when a refresh returns a partial result."""
    if not isinstance(cached, dict) or not isinstance(refreshed, dict):
        return False
    if not _is_nonnegative_integer(cached.get("tmdb_id")) or not cached["tmdb_id"]:
        return False
    if cached.get("tmdb_id") != refreshed.get("tmdb_id"):
        return False
    fetched_at = cached.get("metadata_fetched_at")
    if not isinstance(fetched_at, str):
        return False
    try:
        cached_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if cached_at.tzinfo is None:
        return False
    cached_age = now - cached_at
    if cached_age < timedelta(0) or cached_age > timedelta(days=90):
        return False
    if cached.get("metadata_details_loaded") and not refreshed.get("metadata_details_loaded"):
        return True
    if require_poster_gallery:
        cached_gallery = cached.get("metadata_poster_gallery_loaded", "poster_gallery" in cached)
        refreshed_gallery = refreshed.get("metadata_poster_gallery_loaded", "poster_gallery" in refreshed)
        return bool(cached_gallery and not refreshed_gallery)
    return False


def create_snapshot(
    username: str,
    include_all_metadata: bool = False,
    progress: Progress | None = None,
) -> dict:
    """Fetch and serialize one user's ranked liked-list films for the web demo."""
    username = username.strip().strip("/")
    tmdb_api_key = _load_tmdb_api_key()
    if include_all_metadata and not tmdb_api_key:
        raise ValueError("Full local metadata requires TMDB_API_KEY in .env or the environment")
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    generated_at_text = generated_at.isoformat().replace("+00:00", "Z")

    with create_http_session() as client:
        list_task = progress.add_task("Loading liked lists", total=None) if progress else None
        list_urls = fetch_user_list_urls(client, username)
        if not list_urls:
            raise ValueError(f"No public liked lists found for {username}")
        if progress and list_task is not None:
            progress.update(list_task, description=f"Loaded {len(list_urls):,} liked lists", total=1, completed=1)
        ranking_task = progress.add_task("Fetching films from liked lists", total=len(list_urls)) if progress else None
        results = rank_movies(list_urls, progress, ranking_task)
        if progress and ranking_task is not None:
            progress.update(ranking_task, description=f"Ranked {len(results):,} films")
        watched_task = progress.add_task("Loading watched films", total=None) if progress else None
        watched = fetch_user_watched_movies(client, username)
        if progress and watched_task is not None:
            progress.update(watched_task, description=f"Loaded {len(watched):,} watched films", total=1, completed=1)

        # Resolve movie metadata for the highest-ranked films through TMDB.
        featured_results = results if include_all_metadata else results[:500]
        metadata: dict[int, dict | None] = {}
        poster_galleries: dict[str, list[dict[str, str]]] = {}
        tmdb_match_count = 0
        tmdb_cache_path = Path(".reelrank-cache") / "tmdb-film-metadata-v6.json"
        tmdb_cache = _load_tmdb_metadata_cache(tmdb_cache_path)
        missing_metadata: list[tuple[int, MovieResult, str, dict | None]] = []
        metadata_task = progress.add_task("Checking cached film metadata", total=len(featured_results)) if progress else None
        for index, result in enumerate(featured_results):
            cache_key = _tmdb_metadata_key(result.movie)
            if cache_key in tmdb_cache:
                cached = tmdb_cache[cache_key]
                if _metadata_cache_is_fresh(
                    cached,
                    generated_at,
                    bool(tmdb_api_key),
                    bool(tmdb_api_key) and index < 500,
                ):
                    metadata[index] = cached
                    if progress and metadata_task is not None:
                        progress.advance(metadata_task)
                else:
                    missing_metadata.append((index, result, cache_key, cached))
            else:
                missing_metadata.append((index, result, cache_key, None))

        if progress and metadata_task is not None:
            progress.update(
                metadata_task,
                description=f"Enriching film metadata ({len(missing_metadata):,} uncached)",
                completed=len(metadata),
            )
        if missing_metadata:
            genre_names = _fetch_tmdb_movie_genres(client, tmdb_api_key) if tmdb_api_key else {}

            def fetch_tmdb_metadata(entry: tuple[int, MovieResult, str, dict | None]) -> tuple[int, str, dict | None, bool, dict | None]:
                index, result, cache_key, cached = entry
                worker_client = worker_sessions.get()
                value, cacheable, source = resolve_movie_metadata(
                    worker_client,
                    result.movie,
                    tmdb_api_key,
                    genre_names,
                    fetch_poster_gallery=index < 500,
                )
                if value is not None:
                    value.update({
                        "metadata_source": source,
                        "metadata_fetched_at": generated_at_text,
                        "metadata_status": "complete" if value.get("metadata_details_loaded") else ("id_only" if value.get("tmdb_id") else "partial"),
                    })
                return index, cache_key, value, cacheable, cached

            with ThreadLocalSessionPool() as worker_sessions:
                with ThreadPoolExecutor(max_workers=6) as executor:
                    for index, cache_key, value, cacheable, cached in executor.map(fetch_tmdb_metadata, missing_metadata):
                        keep_cached = _prefer_cached_metadata(
                            cached,
                            value,
                            bool(tmdb_api_key) and index < 500,
                            generated_at,
                        )
                        if keep_cached:
                            metadata[index] = cached
                        else:
                            metadata[index] = value
                        if cacheable and value is not None and not keep_cached:
                            tmdb_cache[cache_key] = value
                        if progress and metadata_task is not None:
                            progress.advance(metadata_task)
            _write_tmdb_metadata_cache(tmdb_cache_path, tmdb_cache)
        tmdb_match_count = sum(value is not None for value in metadata.values())
        if progress and metadata_task is not None:
            progress.update(metadata_task, description=f"Film metadata ready ({tmdb_match_count:,} matches)")
        if tmdb_api_key and not tmdb_match_count:
            raise ValueError("TMDB did not match any ranked films; the previous demo snapshot was left unchanged")

    films = []
    records_task = progress.add_task("Building snapshot records", total=len(featured_results)) if progress else None
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
        if progress and records_task is not None:
            progress.advance(records_task)
    if progress and records_task is not None:
        progress.update(records_task, description=f"Built {len(films):,} snapshot records")

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
        "_poster_galleries": poster_galleries,
        "_full_ranking": results,
        "_watched": watched,
    }
    return validate_snapshot(snapshot)


def public_snapshot_from_full(snapshot: dict, featured_limit: int = 500) -> dict:
    """Return the deployable top-film edition from a fully enriched local snapshot."""
    public_snapshot = {key: value for key, value in snapshot.items()}
    public_snapshot.pop("local_metadata_edition", None)
    for key in ("catalogue_index_url", "poster_gallery_url", "ranking_csv_url", "ranking_gzip_url"):
        value = public_snapshot.get(key)
        if isinstance(value, str) and value.startswith("/data/local/"):
            public_snapshot[key] = value.replace("/data/local/", "/data/", 1)
    public_snapshot["_catalogue_index_films"] = [dict(film) for film in snapshot["films"]]
    public_snapshot["_catalogue_index_source_lists"] = list(snapshot["source_lists"])
    films = [dict(film) for film in snapshot["films"][:featured_limit]]
    source_lists = snapshot["source_lists"]
    public_source_lists: list[str] = []
    source_list_index: dict[str, int] = {}
    for film in films:
        urls = [source_lists[int(index)] for index in film["list_ids"]]
        film["list_ids"] = []
        for url in urls:
            if url not in source_list_index:
                source_list_index[url] = len(public_source_lists)
                public_source_lists.append(url)
            film["list_ids"].append(source_list_index[url])

    public_snapshot["films"] = films
    public_snapshot["source_lists"] = public_source_lists
    public_snapshot["displayed_film_count"] = len(films)
    public_snapshot["displayed_unwatched_count"] = sum(not film["watched"] for film in films)
    public_snapshot["tmdb_match_count"] = sum(_is_schema_integer(film.get("tmdb_id")) and film["tmdb_id"] >= 0 for film in films)
    poster_galleries = snapshot.get("_poster_galleries")
    if isinstance(poster_galleries, dict):
        featured_ids = {str(film["tmdb_id"]) for film in films if film.get("tmdb_id") is not None}
        public_snapshot["_poster_galleries"] = {
            tmdb_id: gallery for tmdb_id, gallery in poster_galleries.items()
            if tmdb_id in featured_ids
        }
    return validate_snapshot(public_snapshot)


def local_snapshot_paths(snapshot: dict) -> dict:
    """Point a localhost edition at sidecars within the ignored local data directory."""
    local_snapshot = {key: value for key, value in snapshot.items()}
    local_snapshot["local_metadata_edition"] = True
    for key in ("catalogue_index_url", "poster_gallery_url", "ranking_csv_url", "ranking_gzip_url"):
        value = local_snapshot.get(key)
        if isinstance(value, str) and value.startswith("/data/"):
            local_snapshot[key] = value.replace("/data/", "/data/local/", 1)
    return validate_snapshot(local_snapshot)


def _catalogue_index_assets(snapshot: dict, output: Path) -> tuple[str, bytes, dict[str, bytes]] | None:
    """Build a compact all-film index and lazy synopsis shards for one snapshot."""
    full_ranking = snapshot.get("_full_ranking")
    if not isinstance(full_ranking, list):
        return None
    if len(full_ranking) != snapshot["film_count"]:
        raise ValueError("Snapshot catalogue index does not contain the declared full ranking")
    if len(full_ranking) > 100_000:
        raise ValueError("Catalogue index cannot contain more than 100,000 films")

    metadata_films = snapshot.get("_catalogue_index_films", snapshot["films"])
    if not isinstance(metadata_films, list):
        raise ValueError("Snapshot catalogue index metadata is invalid")
    metadata_by_url: dict[str, dict] = {}
    for film in metadata_films:
        if not isinstance(film, dict):
            continue
        canonical_url = _canonical_letterboxd_film_url(film.get("letterboxd_url", ""))
        if not canonical_url:
            continue
        if canonical_url in metadata_by_url:
            raise ValueError(f"Catalogue metadata has duplicate Letterboxd URL {canonical_url}")
        metadata_by_url[canonical_url] = film

    bootstrap_urls = {
        canonical_url
        for film in snapshot["films"]
        if (canonical_url := _canonical_letterboxd_film_url(film.get("letterboxd_url", "")))
    }
    source_lists = snapshot.get("_catalogue_index_source_lists")
    if not isinstance(source_lists, list):
        source_lists = list(dict.fromkeys(url for result in full_ranking for url in result.lists))
    if len(source_lists) > 100_000:
        raise ValueError("Catalogue index cannot contain more than 100,000 source lists")
    if any(not isinstance(url, str) or len(url) > 512 for url in source_lists):
        raise ValueError("Catalogue index source list URLs exceed the supported text length")
    source_list_index = {url: index for index, url in enumerate(source_lists)}
    if len(source_list_index) != len(source_lists):
        raise ValueError("Catalogue index source lists cannot contain duplicates")

    poster_galleries = snapshot.get("_poster_galleries", {})
    if not isinstance(poster_galleries, dict):
        poster_galleries = {}
    watched = snapshot.get("_watched", set())
    local_output = output.parent.name == "local"
    data_prefix = "/data/local" if local_output else "/data"
    bucket_records: dict[int, list[dict[str, str]]] = defaultdict(list)
    detail_id_by_film: dict[str, int] = {}
    unique_urls: set[str] = set()
    rows: list[tuple] = []

    for rank, result in enumerate(full_ranking, start=1):
        canonical_url = _canonical_letterboxd_film_url(result.movie.uri)
        if not canonical_url:
            raise ValueError(f"Ranked film {rank} has no canonical Letterboxd film URL")
        if canonical_url in unique_urls:
            raise ValueError(f"Catalogue ranking has duplicate Letterboxd URL {canonical_url}")
        unique_urls.add(canonical_url)

        metadata = metadata_by_url.get(canonical_url, {})
        title = metadata.get("title") or result.movie.title
        tmdb_id = metadata.get("tmdb_id")
        has_gallery = _is_schema_integer(tmdb_id) and str(int(tmdb_id)) in poster_galleries
        lists = list(dict.fromkeys(result.lists))
        if any(url not in source_list_index for url in lists):
            raise ValueError(f"Catalogue index film {rank} references an unavailable source list")
        genres = metadata.get("genres", [])
        directors = metadata.get("directors", [])
        countries = metadata.get("countries", [])
        if not all(isinstance(values, list) and all(isinstance(value, str) for value in values) for values in (genres, directors, countries)):
            raise ValueError(f"Catalogue index film {rank} has invalid metadata arrays")
        for field, values in (("genres", genres), ("directors", directors), ("countries", countries)):
            if len(values) > 1_000 or any(len(value) > 512 for value in values):
                raise ValueError(f"Catalogue index film {rank} has unsupported {field} values")
        if len(lists) > 100_000:
            raise ValueError(f"Catalogue index film {rank} has too many source lists")

        row = {
            "letterboxd_url": canonical_url,
            "title": title,
            "original_title": metadata.get("original_title") or title,
            "year": metadata.get("year") or result.movie.year,
            "letterboxd_title": result.movie.title,
            "letterboxd_year": result.movie.year,
            "poster_url": metadata.get("poster_url") or result.movie.poster_url,
            "tmdb_id": tmdb_id,
            "tmdb_url": metadata.get("tmdb_url", ""),
            "tmdb_rating": metadata.get("tmdb_rating"),
            "genres": genres,
            "directors": directors,
            "countries": countries,
            "original_language": metadata.get("original_language", ""),
            "runtime_minutes": metadata.get("runtime_minutes"),
            "metadata_source": metadata.get("metadata_source", ""),
            "metadata_fetched_at": metadata.get("metadata_fetched_at", ""),
            "metadata_status": metadata.get("metadata_status", "unavailable"),
            "liked_in": result.liked_in,
            "watched": movie_is_watched(result.movie, watched),
            "list_ids": [source_list_index[url] for url in lists],
            "has_poster_gallery": has_gallery,
        }
        string_limits = {
            "title": 1024, "original_title": 1024, "letterboxd_title": 1024,
            "year": 64, "letterboxd_year": 64, "original_language": 64,
            "poster_url": 2048, "tmdb_url": 2048, "metadata_fetched_at": 128,
        }
        for field, maximum in string_limits.items():
            value = row[field]
            if not isinstance(value, str) or len(value) > maximum:
                raise ValueError(f"Catalogue index film {rank} has unsupported {field}")
        if len(canonical_url) > 2048:
            raise ValueError(f"Catalogue index film {rank} has an overlong Letterboxd URL")
        if canonical_url not in bootstrap_urls:
            overview = metadata.get("overview")
            if isinstance(overview, str) and overview.strip():
                bucket = _catalogue_shard_bucket(canonical_url)
                bucket_records[bucket].append({"letterboxd_url": canonical_url, "overview": overview})
                detail_id_by_film[canonical_url] = bucket
        rows.append((row, detail_id_by_film.get(canonical_url)))

    detail_files: dict[str, bytes] = {}
    detail_shards: list[str | None] = [None] * CATALOGUE_DETAIL_SHARD_COUNT
    for bucket, records in bucket_records.items():
        records.sort(key=lambda record: record["letterboxd_url"])
        payload = {"schema_version": 1, "username": snapshot["username"], "records": records}
        body = _compact_json_bytes(payload)
        digest = hashlib.sha256(body).hexdigest()[:12]
        filename = f"film-details-{bucket:03d}-{digest}.json"
        detail_shards[bucket] = f"{data_prefix}/{filename}"
        detail_files[filename] = body

    strings = [""]
    string_index = {"": 0}

    def string_id(value: object, field: str) -> int:
        if not isinstance(value, str):
            raise ValueError(f"Catalogue index {field} must be a string")
        existing = string_index.get(value)
        if existing is not None:
            return existing
        if len(strings) >= 1_000_000:
            raise ValueError("Catalogue index string table cannot contain more than 1,000,000 values")
        if len(value) > 2048:
            raise ValueError(f"Catalogue index {field} exceeds the supported text length")
        index = len(strings)
        strings.append(value)
        string_index[value] = index
        return index

    encoded_films = []
    for row, detail_shard_id in rows:
        encoded_films.append([
            row["letterboxd_url"],
            string_id(row["title"], "title"),
            string_id(row["original_title"], "original_title"),
            string_id(row["year"], "year"),
            string_id(row["letterboxd_title"], "letterboxd_title"),
            string_id(row["letterboxd_year"], "letterboxd_year"),
            string_id(row["poster_url"], "poster_url"),
            row["tmdb_id"],
            string_id(row["tmdb_url"], "tmdb_url"),
            row["tmdb_rating"],
            [string_id(value, "genre") for value in row["genres"]],
            [string_id(value, "director") for value in row["directors"]],
            [string_id(value, "country") for value in row["countries"]],
            string_id(row["original_language"], "original_language"),
            row["runtime_minutes"],
            string_id(row["metadata_source"], "metadata_source"),
            string_id(row["metadata_fetched_at"], "metadata_fetched_at"),
            string_id(row["metadata_status"], "metadata_status"),
            row["liked_in"],
            row["watched"],
            row["list_ids"],
            detail_shard_id,
            row["has_poster_gallery"],
        ])

    index = {
        "schema_version": 1,
        "username": snapshot["username"],
        "refreshed_at": snapshot["refreshed_at"],
        "film_count": len(encoded_films),
        "strings": strings,
        "source_lists": source_lists,
        "detail_shards": detail_shards,
        "films": encoded_films,
    }
    index_body = _compact_json_bytes(index)
    index_digest = hashlib.sha256(index_body).hexdigest()[:12]
    index_url = f"{data_prefix}/catalogue-index-{index_digest}.json"
    return index_url, index_body, detail_files

def write_snapshot(snapshot: dict, output: Path) -> None:
    """Write the snapshot and sidecar files using atomic file replacements."""
    validate_snapshot(snapshot)
    catalogue_assets = _catalogue_index_assets(snapshot, output)
    if catalogue_assets:
        snapshot["catalogue_index_url"] = catalogue_assets[0]
        validate_snapshot(snapshot)
    gallery_url = snapshot.get("poster_gallery_url")
    ranking_name = Path(snapshot.get("ranking_csv_url", "")).name
    ranking_output = output.parent / ranking_name if ranking_name else None
    ranking_gzip_name = Path(snapshot.get("ranking_gzip_url", "")).name
    ranking_gzip_output = output.parent / ranking_gzip_name if ranking_gzip_name else None
    private_fields = {
        "_poster_galleries",
        "_full_ranking",
        "_watched",
        "_catalogue_index_films",
        "_catalogue_index_source_lists",
    }
    public_snapshot = {key: value for key, value in snapshot.items() if key not in private_fields}
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

    if gallery_url:
        gallery_payload = {
            "schema_version": SNAPSHOT_SCHEMA_VERSION,
            "snapshot_refreshed_at": snapshot["refreshed_at"],
            "galleries": snapshot.get("_poster_galleries", {}),
        }
        atomic_write_text(
            output.parent / Path(gallery_url).name,
            json.dumps(gallery_payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        )
    if catalogue_assets:
        _index_url, index_body, detail_files = catalogue_assets
        for filename, body in detail_files.items():
            atomic_write_bytes(output.parent / filename, body)
        atomic_write_bytes(output.parent / Path(snapshot["catalogue_index_url"]).name, index_body)
    if ranking_output is not None and ranking_csv is not None:
        atomic_write_text(ranking_output, ranking_csv)
        if ranking_gzip_output is not None:
            atomic_write_bytes(
                ranking_gzip_output,
                gzip.compress(ranking_csv.encode("utf-8"), mtime=0),
            )
    atomic_write_text(output, json.dumps(public_snapshot, ensure_ascii=False, indent=2) + "\n")
