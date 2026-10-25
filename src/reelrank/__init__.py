"""Find movies that occur most often in a user's liked Letterboxd lists."""

from .cli import main, refresh_snapshot_cli
from .errors import PaginationError, PaginationLimitReached, PaginationStalled
from .genres import filter_genre
from .letterboxd import (
    Movie,
    MovieResult,
    fetch_list,
    fetch_user_list_urls,
    fetch_user_watched_movies,
    filter_unwatched,
    parse_list_page,
    rank_movies,
    write_csv,
)
from .snapshot import SNAPSHOT_SCHEMA_VERSION, create_snapshot, validate_snapshot, write_snapshot
from .tmdb import build_tmdb_genre_caches

__all__ = [
    "Movie",
    "MovieResult",
    "PaginationLimitReached",
    "PaginationError",
    "PaginationStalled",
    "SNAPSHOT_SCHEMA_VERSION",
    "build_tmdb_genre_caches",
    "create_snapshot",
    "fetch_list",
    "fetch_user_list_urls",
    "fetch_user_watched_movies",
    "filter_genre",
    "filter_unwatched",
    "main",
    "parse_list_page",
    "rank_movies",
    "refresh_snapshot_cli",
    "validate_snapshot",
    "write_csv",
    "write_snapshot",
]
