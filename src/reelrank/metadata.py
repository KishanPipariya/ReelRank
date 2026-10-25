from __future__ import annotations

from curl_cffi.requests.errors import RequestsError

from .models import Movie
from .tmdb import _fetch_letterboxd_tmdb_id, _select_tmdb_candidate, _tmdb_metadata_payload


def _fetch_tmdb_poster_gallery(client, movie_id: int, api_key: str) -> tuple[list[dict], bool]:
    try:
        response = client.get(
            f"https://api.themoviedb.org/3/movie/{movie_id}/images",
            params={"api_key": api_key},
        )
        _raise_for_invalid_key(response, api_key)
        response.raise_for_status()
    except RequestsError:
        return [], False

    image_payload = response.json()
    if not isinstance(image_payload, dict):
        return [], True
    posters = image_payload.get("posters", [])
    if not isinstance(posters, list):
        return [], True
    unique = {}
    for poster in posters:
        if not isinstance(poster, dict):
            continue
        path = poster.get("file_path")
        if not isinstance(path, str) or not path.startswith("/"):
            continue
        language = poster.get("iso_639_1")
        votes = poster.get("vote_count")
        unique[path] = {
            "path": path,
            "language": language if isinstance(language, str) else "",
            "votes": votes if isinstance(votes, int) and not isinstance(votes, bool) else 0,
        }
    ranked = sorted(unique.values(), key=lambda poster: (-poster["votes"], poster["path"]))
    return [{"path": poster["path"], "language": poster["language"]} for poster in ranked[:24]], True


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
            poster_gallery, gallery_loaded = (
                _fetch_tmdb_poster_gallery(client, letterboxd_tmdb_id, api_key)
                if record.get("poster_path") or movie.poster_url
                else ([], True)
            )
            if gallery_loaded:
                record["poster_gallery"] = poster_gallery
            else:
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
        payload = _tmdb_metadata_payload(movie, record, genre_names)
        poster_gallery, gallery_loaded = (
            _fetch_tmdb_poster_gallery(client, best_id, api_key)
            if record.get("poster_path") or movie.poster_url
            else ([], True)
        )
        if gallery_loaded:
            payload["poster_gallery"] = poster_gallery
        return payload, gallery_loaded, "title_match"
    except RequestsError:
        return None, False, ""


def _raise_for_invalid_key(response, api_key: str) -> None:
    if response.status_code == 401:
        raise ValueError("TMDB rejected TMDB_API_KEY; check the API key configured for this job")
