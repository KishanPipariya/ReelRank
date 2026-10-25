from __future__ import annotations

from curl_cffi.requests.errors import RequestsError

from .models import Movie
from .tmdb import _fetch_letterboxd_tmdb_id, _select_tmdb_candidate, _tmdb_metadata_payload


def resolve_movie_metadata(client, movie: Movie, api_key: str | None, genre_names: dict[int, str]) -> tuple[dict | None, bool, str]:
    """Resolve one film's metadata, preferring its TMDB link on Letterboxd."""
    letterboxd_tmdb_id = _fetch_letterboxd_tmdb_id(client, movie.uri)
    if letterboxd_tmdb_id is not None:
        record = {"id": letterboxd_tmdb_id}
        cacheable = True
        if api_key:
            try:
                response = client.get(
                    f"https://api.themoviedb.org/3/movie/{letterboxd_tmdb_id}",
                    params={"api_key": api_key, "language": "en-US", "append_to_response": "credits"},
                )
                _raise_for_invalid_key(response, api_key)
                response.raise_for_status()
                details = response.json()
                if details.get("id") == letterboxd_tmdb_id:
                    record = details
                else:
                    cacheable = False
            except RequestsError:
                cacheable = False
        return _tmdb_metadata_payload(movie, record, genre_names), cacheable, "letterboxd"

    if not api_key:
        return None, False, ""

    try:
        response = client.get(
            "https://api.themoviedb.org/3/search/movie",
            params={"api_key": api_key, "query": movie.title, **({"year": movie.year} if movie.year.isdigit() else {})},
        )
        _raise_for_invalid_key(response, api_key)
        response.raise_for_status()
        candidates = response.json().get("results", [])
        fallback_title = None
        if not candidates and "," in movie.title:
            short_title = movie.title.split(",", 1)[0].strip()
            if short_title:
                fallback_title = short_title
                response = client.get(
                    "https://api.themoviedb.org/3/search/movie",
                    params={"api_key": api_key, "query": short_title, **({"year": movie.year} if movie.year.isdigit() else {})},
                )
                _raise_for_invalid_key(response, api_key)
                response.raise_for_status()
                candidates = response.json().get("results", [])
        if not candidates:
            return None, False, ""

        best = _select_tmdb_candidate(movie, candidates, fallback_title)
        if best is None:
                return None, False, ""
        best_id = best.get("id")
        if not isinstance(best_id, int):
            return _tmdb_metadata_payload(movie, best, genre_names), False, "title_match"
        details_response = client.get(
            f"https://api.themoviedb.org/3/movie/{best_id}",
            params={"api_key": api_key, "language": "en-US", "append_to_response": "credits"},
        )
        _raise_for_invalid_key(details_response, api_key)
        details_response.raise_for_status()
        details = details_response.json()
        record = details if details.get("id") == best_id else best
        return _tmdb_metadata_payload(movie, record, genre_names), True, "title_match"
    except RequestsError:
        return None, False, ""


def _raise_for_invalid_key(response, api_key: str) -> None:
    if response.status_code == 401:
        raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
