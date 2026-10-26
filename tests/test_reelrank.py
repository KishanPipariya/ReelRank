import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier

import pytest

from reelrank import Movie, MovieResult, create_snapshot, filter_unwatched, parse_list_page
from reelrank import letterboxd, snapshot, tmdb
from reelrank import metadata as movie_metadata
from reelrank.cli import _configured_site_username
from reelrank.errors import PaginationLimitReached, PaginationStalled
from reelrank.http import ThreadLocalSessionPool


def test_parse_list_page_extracts_movies_and_next_page():
    html = """
    <ul>
      <li class="poster-container">
        <div class="react-component" data-film-name="Arrival" data-film-release-year="2016">
          <a href="/film/arrival/"><img alt="Arrival Poster"></a>
        </div>
      </li>
      <li class="poster-container">
        <div class="react-component" data-film-name="Moonlight" data-film-release-year="2016">
          <a href="/film/moonlight/"><img alt="Moonlight Poster"></a>
        </div>
      </li>
    </ul>
    <a class="next" href="?page=2">Next</a>
    """

    movies, next_url = parse_list_page(html, "https://letterboxd.com/kishan/list/favorites/")

    assert [(movie.title, movie.year) for movie in movies] == [
        ("Arrival", "2016"),
        ("Moonlight", "2016"),
    ]
    assert next_url == "https://letterboxd.com/kishan/list/favorites/?page=2"


def test_parse_list_page_canonicalizes_boxd_it_pagination():
    html = '<a class="next" href="/fcbarcelona/list/movies-everyone-should-watch-at-least-once/page/2/">Next</a>'

    _, next_url = parse_list_page(html, "https://boxd.it/fcbarcelona/list/movies-everyone-should-watch-at-least-once/")

    assert next_url == "https://letterboxd.com/fcbarcelona/list/movies-everyone-should-watch-at-least-once/page/2/"


def test_parse_list_page_captures_poster_without_extra_request():
    html = """
    <li class="poster-container">
      <div data-film-name="Arrival" data-film-release-year="2016">
        <a href="/film/arrival/"><img alt="Arrival Poster" data-src="//a.ltrbxd.com/resized/poster.jpg"></a>
      </div>
    </li>
    """

    movies, _ = parse_list_page(html, "https://letterboxd.com/kishan/list/favorites/")

    assert movies[0].poster_url == "https://a.ltrbxd.com/resized/poster.jpg"


def test_snapshot_without_tmdb_uses_letterboxd_poster(monkeypatch, tmp_path):
    class EmptySession:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def close(self):
            pass

    result = MovieResult(
        Movie("Poster fallback", "2019", "https://letterboxd.com/film/poster-fallback/", "https://a.ltrbxd.com/poster.jpg"),
        1,
        ["https://letterboxd.com/user/list/favorites/"],
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(snapshot, "_load_tmdb_api_key", lambda: None)
    monkeypatch.setattr(snapshot, "create_http_session", EmptySession)
    monkeypatch.setattr(snapshot, "resolve_movie_metadata", lambda *_: (None, False, ""))
    monkeypatch.setattr(snapshot, "fetch_user_list_urls", lambda *_: result.lists)
    monkeypatch.setattr(snapshot, "rank_movies", lambda *_: [result])
    monkeypatch.setattr(snapshot, "fetch_user_watched_movies", lambda *_: set())

    generated_snapshot = create_snapshot("new-viewer")

    assert generated_snapshot["schema_version"] == 1
    assert generated_snapshot["username"] == "new-viewer"
    assert generated_snapshot["tmdb_match_count"] == 0
    assert generated_snapshot["films"][0]["poster_url"] == "https://a.ltrbxd.com/poster.jpg"
    assert generated_snapshot["source_lists"] == result.lists
    assert generated_snapshot["films"][0]["list_ids"] == [0]
    assert "lists" not in generated_snapshot["films"][0]


def test_filter_unwatched_uses_title_and_year():
    results = [
        MovieResult(Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/"), 2, []),
        MovieResult(Movie("Moonlight", "2016", "https://letterboxd.com/film/moonlight/"), 1, []),
    ]

    remaining = filter_unwatched(results, {("arrival", "2016")})

    assert [result.movie.title for result in remaining] == ["Moonlight"]


def test_movie_is_watched_requires_year_for_title_fallback_but_keeps_uri_match():
    watched = {"https://letterboxd.com/film/watched-film/", ("same title", "")}
    for invalid_year in ("", "   ", "unknown", "20X0"):
        movie = Movie("Same title", invalid_year, "https://letterboxd.com/film/different-film/")
        assert not letterboxd.movie_is_watched(movie, watched | {("same title", invalid_year)})

    valid_movie = Movie("Same title", "2020", "https://letterboxd.com/film/different-film/")
    assert letterboxd.movie_is_watched(valid_movie, watched | {("same title", "2020")})
    assert letterboxd.movie_is_watched(
        Movie("Same title", "", "https://letterboxd.com/film/different-film/"),
        watched | {"https://letterboxd.com/film/different-film/"},
    )


def test_fetch_list_raises_instead_of_silently_truncating():
    class Response:
        url = "https://letterboxd.com/user/list/favorites/"
        text = """
        <li class="poster-container"><div data-film-name="Arrival" data-film-release-year="2016">
          <a href="/film/arrival/"><img alt="Arrival Poster"></a>
        </div></li>
        <a class="next" href="?page=2">Next</a>
        """

        def raise_for_status(self):
            pass

    class Client:
        def get(self, _url):
            return Response()

    with pytest.raises(PaginationLimitReached, match="1-page limit"):
        letterboxd.fetch_list(Client(), "https://letterboxd.com/user/list/favorites/", max_pages=1)


def test_fetch_list_accepts_final_page_at_the_limit():
    class Response:
        url = "https://letterboxd.com/user/list/favorites/"
        text = '<li class="poster-container"><div data-film-name="Arrival"><a href="/film/arrival/"></a></div></li>'

        def raise_for_status(self):
            pass

    class Client:
        def get(self, _url):
            return Response()

    movies = letterboxd.fetch_list(Client(), "https://letterboxd.com/user/list/favorites/", max_pages=1)

    assert [movie.title for movie in movies] == ["Arrival"]


def test_fetch_list_raises_when_a_next_page_repeats_only_seen_movies():
    class Response:
        def __init__(self, url, next_url):
            self.url = url
            self.text = f'''<li class="poster-container"><div data-film-name="Arrival" data-film-release-year="2016">
              <a href="/film/arrival/"></a></div></li><a class="next" href="{next_url}">Next</a>'''

        def raise_for_status(self):
            pass

    class Client:
        def get(self, url):
            page = "?page=2" if "page=2" not in url else "?page=3"
            return Response(url, page)

    with pytest.raises(PaginationStalled, match="stopped advancing"):
        letterboxd.fetch_list(Client(), "https://letterboxd.com/user/list/favorites/", max_pages=3)


def test_fetch_user_list_urls_raises_at_page_limit():
    class Response:
        url = "https://letterboxd.com/user/likes/lists/"
        text = '<a href="/user/list/favorites/">Favorites</a><a class="next" href="?page=2">Next</a>'

        def raise_for_status(self):
            pass

    class Client:
        def get(self, _url):
            return Response()

    with pytest.raises(PaginationLimitReached, match="Liked-list pagination exceeded"):
        letterboxd.fetch_user_list_urls(Client(), "user", max_pages=1)


def test_tmdb_candidate_match_respects_year_tolerance_and_ambiguity():
    movie = Movie("Amélie", "2001", "https://letterboxd.com/film/amelie/")
    candidate = {"id": 194, "title": "Amelie", "original_title": "Le Fabuleux Destin d'Amélie Poulain", "release_date": "2001-04-25"}
    assert tmdb._select_tmdb_candidate(movie, [candidate]) == candidate

    ambiguous = [candidate, {**candidate, "id": 195}]
    assert tmdb._select_tmdb_candidate(movie, ambiguous) is None

    distant_year = {**candidate, "release_date": "2004-04-25"}
    assert tmdb._select_tmdb_candidate(movie, [distant_year]) is None


def test_snapshot_schema_rejects_unknown_version_and_preserves_existing_file(tmp_path):
    output = tmp_path / "snapshot.json"
    output.write_text('{"valid":true}\n', encoding="utf-8")

    with pytest.raises(ValueError, match="Unsupported snapshot schema version"):
        snapshot.write_snapshot({"schema_version": 99}, output)

    assert output.read_text(encoding="utf-8") == '{"valid":true}\n'


def test_snapshot_schema_rejects_inconsistent_display_counts():
    with pytest.raises(ValueError, match="must match films"):
        snapshot.validate_snapshot({
            "schema_version": 1,
            "username": "viewer",
            "profile_url": "https://letterboxd.com/viewer/",
            "refreshed_at": "2026-10-25T00:00:00Z",
            "list_count": 1,
            "film_count": 1,
            "displayed_film_count": 1,
            "unwatched_count": 1,
            "displayed_unwatched_count": 1,
            "tmdb_match_count": 0,
            "films": [],
        })


def test_snapshot_schema_accepts_shared_fixture_without_optional_tmdb_fields():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    assert snapshot.validate_snapshot(fixture) == fixture


def test_python_and_browser_snapshot_schemas_are_identical():
    package_schema = json.loads((Path(snapshot.__file__).parent / "snapshot.schema.json").read_text())
    browser_schema = json.loads((Path(__file__).parent.parent / "web" / "snapshot.schema.json").read_text())
    assert package_schema == browser_schema


def test_snapshot_schema_rejects_shared_invalid_tmdb_id_fixture():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0]["tmdb_id"] = True
    with pytest.raises(ValueError, match="tmdb_id.*schema"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_schema_rejects_invalid_metadata_type_and_unsafe_counts():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0]["metadata_source"] = []
    with pytest.raises(ValueError, match="metadata_source"):
        snapshot.validate_snapshot(fixture)
    fixture["films"][0].pop("metadata_source")
    fixture["film_count"] = 9007199254740992
    with pytest.raises(ValueError, match="film_count"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_schema_rejects_boolean_schema_version():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["schema_version"] = True
    with pytest.raises(ValueError, match="schema_version"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_schema_accepts_json_integer_valued_float():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["film_count"] = 1.0
    assert snapshot.validate_snapshot(fixture) == fixture


def test_snapshot_cli_uses_site_config_username_by_default(tmp_path):
    config = tmp_path / "site-config.json"
    config.write_text(json.dumps({"letterboxd_username": "  filmfan  "}), encoding="utf-8")

    assert _configured_site_username(config) == "filmfan"


def test_metadata_resolver_prefers_authoritative_letterboxd_id(monkeypatch):
    movie = Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/")
    monkeypatch.setattr(movie_metadata, "_fetch_letterboxd_tmdb_id", lambda *_: 329865)
    payload, cacheable, source = movie_metadata.resolve_movie_metadata(object(), movie, None, {})
    assert cacheable is True
    assert source == "letterboxd"
    assert payload["tmdb_id"] == 329865
    assert payload["tmdb_url"] == "https://www.themoviedb.org/movie/329865"


def test_metadata_resolver_uses_confident_title_match_as_fallback(monkeypatch):
    movie = Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/")
    monkeypatch.setattr(movie_metadata, "_fetch_letterboxd_tmdb_id", lambda *_: None)

    class Response:
        status_code = 200

        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self.payload

    class Client:
        def __init__(self):
            self.responses = [
                Response({"results": [{"id": 329865, "title": "Arrival", "original_title": "Arrival", "release_date": "2016-11-10"}]}),
                Response({"id": 329865, "title": "Arrival", "original_title": "Arrival", "release_date": "2016-11-10", "genres": [{"name": "Drama"}], "credits": {"crew": []}}),
            ]

        def get(self, *_args, **_kwargs):
            return self.responses.pop(0)

    payload, cacheable, source = movie_metadata.resolve_movie_metadata(Client(), movie, "key", {})
    assert cacheable is True
    assert source == "title_match"
    assert payload["tmdb_id"] == 329865
    assert payload["genres"] == ["Drama"]


def test_metadata_cache_requires_a_recent_enrichment_timestamp():
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    entry = {"tmdb_id": 329865, "metadata_details_loaded": True, "metadata_fetched_at": now.isoformat()}
    assert snapshot._metadata_cache_is_fresh(entry, now, needs_details=True)
    entry["metadata_fetched_at"] = (now - timedelta(days=31)).isoformat()
    assert not snapshot._metadata_cache_is_fresh(entry, now, needs_details=True)
    entry["metadata_fetched_at"] = (now + timedelta(days=365)).isoformat()
    assert not snapshot._metadata_cache_is_fresh(entry, now, needs_details=True)


def test_old_metadata_cache_uses_file_time_as_migration_timestamp(tmp_path):
    cache_path = tmp_path / "metadata.json"
    cache_path.write_text(json.dumps({"arrival": {"tmdb_id": 329865}}), encoding="utf-8")
    migrated = tmdb._load_tmdb_metadata_cache(cache_path)["arrival"]
    assert migrated["metadata_source"] == "legacy"
    assert migrated["metadata_status"] == "id_only"
    assert migrated["metadata_fetched_at"]


def test_thread_local_session_pool_reuses_and_closes_one_session_per_worker():
    class FakeSession:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    sessions = []
    barrier = Barrier(4)

    def factory():
        session = FakeSession()
        sessions.append(session)
        return session

    with ThreadLocalSessionPool(factory) as pool:
        def worker(_):
            first = pool.get()
            second = pool.get()
            barrier.wait(timeout=3)
            return id(first), id(second)

        with ThreadPoolExecutor(max_workers=4) as executor:
            pairs = list(executor.map(worker, range(4)))

    assert all(first == second for first, second in pairs)
    assert len({first for first, _ in pairs}) == 4
    assert all(session.closed for session in sessions)


def test_rank_movies_fetches_lists_with_worker_local_sessions(monkeypatch):
    class FakeSession:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    sessions = []
    barrier = Barrier(4)

    def factory():
        session = FakeSession()
        sessions.append(session)
        return session

    def fetch_one_list(_client, _url):
        barrier.wait(timeout=3)
        return [Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/")]

    monkeypatch.setattr(letterboxd, "fetch_list", fetch_one_list)
    results = letterboxd.rank_movies([f"https://letterboxd.com/user/list/{index}/" for index in range(4)], session_factory=factory)

    assert len(results) == 1
    assert results[0].liked_in == 4
    assert len(sessions) == 4
    assert all(session.closed for session in sessions)
