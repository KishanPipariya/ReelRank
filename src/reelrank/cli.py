from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from curl_cffi.requests.errors import RequestsError
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TaskProgressColumn, TextColumn, TimeElapsedColumn

from .genres import filter_genre
from .http import create_http_session
from .letterboxd import fetch_user_list_urls, fetch_user_watched_movies, filter_unwatched, rank_movies, write_csv
from .snapshot import create_snapshot, write_snapshot
from .tmdb import _genre_slug, _load_tmdb_api_key, _match_tmdb_records, build_tmdb_genre_caches

def refresh_snapshot_cli() -> None:
    parser = argparse.ArgumentParser(description="Refresh the static ReelRank web demo snapshot.")
    parser.add_argument("--username", help="Letterboxd username (defaults to web/site-config.json)")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("web/data/snapshot.json"),
        help="JSON snapshot path (default: web/data/snapshot.json)",
    )
    args = parser.parse_args()
    try:
        username = args.username or _configured_site_username()
        snapshot = create_snapshot(username)
        write_snapshot(snapshot, args.output)
    except (RequestsError, ValueError, OSError) as error:
        parser.exit(1, f"Error: {error}\n")
    metadata_summary = (
        f"TMDB matched {snapshot['tmdb_match_count']} of {snapshot['displayed_film_count']} displayed films."
        if snapshot["tmdb_match_count"]
        else "TMDB metadata unavailable; using Letterboxd titles and available posters."
    )
    print(
        f"Updated {args.output}: {snapshot['film_count']} films across {snapshot['list_count']} lists; "
        f"{metadata_summary}"
    )


def _configured_site_username(config_path: Path = Path("web/site-config.json")) -> str:
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Set --username or provide a valid site config at {config_path}") from error
    username = config.get("letterboxd_username") if isinstance(config, dict) else None
    if not isinstance(username, str) or not username.strip():
        raise ValueError(f"Set --username or a non-empty letterboxd_username in {config_path}")
    return username.strip()

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
        with create_http_session() as client:
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
                results = rank_movies(list_urls, progress, list_task)
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
