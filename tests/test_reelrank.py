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
    monkeypatch.setattr(snapshot, "resolve_movie_metadata", lambda *_, **__: (None, False, ""))
    monkeypatch.setattr(snapshot, "fetch_user_list_urls", lambda *_: result.lists)
    monkeypatch.setattr(snapshot, "rank_movies", lambda *_: [result])
    monkeypatch.setattr(snapshot, "fetch_user_watched_movies", lambda *_: set())

    generated_snapshot = create_snapshot("new-viewer")

    assert generated_snapshot["schema_version"] == 2
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


def test_fetch_list_refuses_external_pagination_without_following_it():
    class Response:
        url = "https://letterboxd.com/user/list/favorites/"
        text = '''<li class="poster-container"><div data-film-name="Arrival"><a href="/film/arrival/"></a></div></li>
          <a class="next" href="https://example.com/next">Next</a>'''

        def raise_for_status(self):
            pass

    class Client:
        requests = 0

        def get(self, _url):
            self.requests += 1
            return Response()

    client = Client()
    with pytest.raises(PaginationStalled, match="pointed outside Letterboxd"):
        letterboxd.fetch_list(client, "https://letterboxd.com/user/list/favorites/")
    assert client.requests == 1


def test_username_is_encoded_as_a_single_profile_path_segment():
    assert letterboxd._username_url("viewer?admin") == "https://letterboxd.com/viewer%3Fadmin/"
    with pytest.raises(ValueError, match="not a profile URL"):
        letterboxd._username_url("https://letterboxd.com/viewer/")


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
            "schema_version": 2,
            "source_lists": [],
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


def test_snapshot_rejects_film_appearances_above_scanned_list_count():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0]["liked_in"] = fixture["list_count"] + 1

    with pytest.raises(ValueError, match="liked_in cannot exceed list_count"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_schema_accepts_shared_fixture_without_optional_tmdb_fields():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    assert snapshot.validate_snapshot(fixture) == fixture


def test_snapshot_schema_enforces_metadata_array_item_limit():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0]["genres"] = ["Drama"] * 1001
    with pytest.raises(ValueError, match="genres has too many items"):
        snapshot.validate_snapshot(fixture)


def test_catalogue_index_rejects_overlong_title_from_full_ranking(tmp_path):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    list_url = fixture["source_lists"][0]
    fixture["film_count"] = 2
    fixture["_full_ranking"] = [
        MovieResult(Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/"), 1, [list_url]),
        MovieResult(Movie("A" * 1025, "2000", "https://letterboxd.com/film/long-title/"), 1, [list_url]),
    ]
    with pytest.raises(ValueError, match="unsupported title"):
        snapshot._catalogue_index_assets(fixture, tmp_path / "data" / "snapshot.json")


def test_catalogue_index_rejects_overlong_source_list_url(tmp_path):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    long_list_url = "https://letterboxd.com/user/list/" + "a" * 520 + "/"
    fixture["_full_ranking"] = [MovieResult(
        Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/"), 1, [long_list_url],
    )]
    with pytest.raises(ValueError, match="source list URLs exceed"):
        snapshot._catalogue_index_assets(fixture, tmp_path / "data" / "snapshot.json")


@pytest.mark.parametrize("field,limit", [("title", 1024), ("overview", 20000), ("directors", 512)])
def test_snapshot_text_limits_reject_overflow_before_replacing_output(tmp_path, field, limit):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0][field] = ["A" * limit] if field == "directors" else "A" * limit
    assert snapshot.validate_snapshot(fixture) == fixture
    fixture["films"][0][field] = ["A" * (limit + 1)] if field == "directors" else "A" * (limit + 1)
    output = tmp_path / "snapshot.json"
    output.write_text("previous catalogue", encoding="utf-8")
    with pytest.raises(ValueError, match=field + r".*supported text length"):
        snapshot.write_snapshot(fixture, output)
    assert output.read_text(encoding="utf-8") == "previous catalogue"


@pytest.mark.parametrize("field,limit", [("title", 1024), ("overview", 20000), ("directors", 512)])
def test_snapshot_text_limits_count_unicode_code_points(field, limit):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    value = "A" * (limit - 1) + "🎬"
    fixture["films"][0][field] = [value] if field == "directors" else value
    assert snapshot.validate_snapshot(fixture) == fixture
    fixture["films"][0][field] = [value + "🎬"] if field == "directors" else value + "🎬"
    with pytest.raises(ValueError, match=field + r".*supported text length"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_writer_exports_full_ranking_without_private_payload(tmp_path):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    film = Movie("=SUM(1,1)", "2016", "https://letterboxd.com/film/arrival/")
    fixture["ranking_csv_url"] = "/data/ranking-20261025T000000Z-0123456789ab.csv"
    fixture["_full_ranking"] = [MovieResult(film, 3, ["https://letterboxd.com/user/list/favorites/"])]
    fixture["_watched"] = {"https://letterboxd.com/film/arrival/"}

    output = tmp_path / "data" / "snapshot.json"
    snapshot.write_snapshot(fixture, output)

    public_snapshot = json.loads(output.read_text(encoding="utf-8"))
    assert "_full_ranking" not in public_snapshot
    assert "_watched" not in public_snapshot
    csv_text = (output.parent / "ranking-20261025T000000Z-0123456789ab.csv").read_text(encoding="utf-8")
    assert "Rank,Title,Year,Watched,Liked in lists,Letterboxd URI,List URLs" in csv_text
    assert "1,\"'=SUM(1,1)\",2016,yes,3," in csv_text


def test_catalogue_index_writer_uses_url_keys_and_lazy_synopsis_shards(tmp_path):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    source_list = fixture["source_lists"][0]
    ranking = [
        MovieResult(
            Movie(f"Film {rank}", "2010", f"https://letterboxd.com/film/film-{rank}/"),
            1,
            [source_list],
        )
        for rank in range(1, 501)
    ]
    tail_movie = Movie("Tail Film", "2011", "https://www.letterboxd.com/film/tail-film")
    ranking.append(MovieResult(tail_movie, 2, [source_list]))
    fixture.update({
        "film_count": 501,
        "unwatched_count": 501,
        "_full_ranking": ranking,
        "_watched": set(),
        "_poster_galleries": {"123": [{"path": "/poster.jpg", "language": "en"}]},
        "_catalogue_index_films": [{
            "title": "Tail Film",
            "original_title": "Tail Film Original",
            "original_language": "en",
            "year": "2011",
            "letterboxd_title": "Tail Film",
            "letterboxd_year": "2011",
            "letterboxd_url": tail_movie.uri,
            "poster_url": "https://image.tmdb.org/t/p/w500/poster.jpg",
            "tmdb_id": 123,
            "tmdb_url": "https://www.themoviedb.org/movie/123",
            "tmdb_rating": 7.5,
            "genres": ["Drama"],
            "directors": ["A Director"],
            "countries": ["France"],
            "runtime_minutes": 100,
            "metadata_source": "letterboxd",
            "metadata_fetched_at": "2026-10-25T00:00:00Z",
            "metadata_status": "complete",
            "overview": "Synopsis for the tail film.",
        }],
    })

    index_url, index_body, detail_files = snapshot._catalogue_index_assets(
        fixture,
        tmp_path / "data" / "snapshot.json",
    )
    index = json.loads(index_body)
    strings = index["strings"]
    tail = index["films"][-1]
    tail_shard_id = tail[21]

    assert index_url.startswith("/data/catalogue-index-")
    assert len(index["films"]) == 501
    assert index["films"][0][0] == "https://letterboxd.com/film/film-1/"
    assert tail[0] == "https://letterboxd.com/film/tail-film/"
    assert strings[tail[1]] == "Tail Film"
    assert strings[tail[2]] == "Tail Film Original"
    assert strings[tail[10][0]] == "Drama"
    assert strings[tail[11][0]] == "A Director"
    assert tail[20] == [0]
    assert tail[21] == snapshot._catalogue_shard_bucket(tail[0])
    assert tail[22] is True
    assert len(index["detail_shards"]) == 128
    detail_url = index["detail_shards"][tail_shard_id]
    assert detail_url.startswith("/data/film-details-")
    assert Path(detail_url).name in detail_files
    assert len(detail_files) == 1
    detail = json.loads(next(iter(detail_files.values())))
    assert "refreshed_at" not in detail
    assert detail["records"] == [{
        "letterboxd_url": "https://letterboxd.com/film/tail-film/",
        "overview": "Synopsis for the tail film.",
    }]

    refreshed = {**fixture, "refreshed_at": "2026-10-26T00:00:00Z"}
    refreshed_url, _refreshed_body, refreshed_details = snapshot._catalogue_index_assets(
        refreshed,
        tmp_path / "data" / "snapshot.json",
    )
    assert refreshed_url != index_url
    assert set(refreshed_details) == set(detail_files)
    assert refreshed_details == detail_files

    duplicate = {
        **fixture,
        "film_count": 502,
        "_full_ranking": [*ranking, ranking[0]],
    }
    with pytest.raises(ValueError, match="duplicate Letterboxd URL"):
        snapshot._catalogue_index_assets(duplicate, tmp_path / "data" / "snapshot.json")

    full_local = {**fixture, "films": [*fixture["films"], fixture["_catalogue_index_films"][0]]}
    _local_url, _local_body, local_details = snapshot._catalogue_index_assets(
        full_local,
        tmp_path / "data" / "local" / "snapshot.json",
    )
    assert local_details == {}


@pytest.mark.parametrize("title,expected", [
    ("  + One", "'  + One"),
    ("'=Installation", "''=Installation"),
    ("''=Installation", "'''=Installation"),
    ("Installation, 🎬", "Installation, 🎬"),
])
def test_ranking_csv_escapes_spreadsheet_title_prefixes_reversibly(title, expected):
    assert snapshot._spreadsheet_safe_cell(title) == expected


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
    with pytest.raises(ValueError, match="Unsupported snapshot schema version"):
        snapshot.validate_snapshot(fixture)


def test_snapshot_validation_rejects_unsafe_urls_and_invalid_edition_time():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["profile_url"] = "https://example.com/viewer/"
    with pytest.raises(ValueError, match="profile_url"):
        snapshot.validate_snapshot(fixture)

    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["refreshed_at"] = "yesterday"
    with pytest.raises(ValueError, match="refreshed_at"):
        snapshot.validate_snapshot(fixture)

    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["source_lists"] = ["https://example.com/user/list/favorites/"]
    with pytest.raises(ValueError, match="HTTPS Letterboxd list URLs"):
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


def test_old_metadata_cache_is_ignored(tmp_path):
    cache_path = tmp_path / "metadata.json"
    cache_path.write_text(json.dumps({"arrival": {"tmdb_id": 329865}}), encoding="utf-8")
    assert tmdb._load_tmdb_metadata_cache(cache_path) == {}


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


def test_snapshot_timestamp_contract_uses_shared_calendar_cases():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    cases = json.loads((Path(__file__).parent / "fixtures" / "timestamp-cases.json").read_text())
    for case in cases:
        fixture["refreshed_at"] = case["timestamp"]
        if case["valid"]:
            assert snapshot.validate_snapshot(fixture) == fixture
        else:
            with pytest.raises(ValueError, match="refreshed_at"):
                snapshot.validate_snapshot(fixture)


def test_public_snapshot_remaps_compact_source_lists():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    original_url = fixture["source_lists"][0]
    public = snapshot.public_snapshot_from_full(fixture)
    assert public["source_lists"] == [original_url]
    assert public["films"][0]["list_ids"] == [0]
    assert "lists" not in public["films"][0]
    assert fixture["films"][0]["list_ids"] == [0]
    compact = json.loads(json.dumps(fixture))
    compact["source_lists"] = ["https://letterboxd.com/viewer/list/unused/", original_url]
    compact["films"][0]["list_ids"] = [1]
    assert snapshot.public_snapshot_from_full(compact)["source_lists"] == [original_url]


def test_public_snapshot_uses_deployable_assets_when_input_is_local():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture.update({
        "local_metadata_edition": True,
        "catalogue_index_url": "/data/local/catalogue-index-a1b2c3d4e5f6.json",
        "poster_gallery_url": "/data/local/poster-galleries-20261117T000000Z.json",
        "ranking_csv_url": "/data/local/ranking-20261117T000000Z-0123456789ab.csv",
        "ranking_gzip_url": "/data/local/ranking-20261117T000000Z-0123456789ab.csv.gz",
    })

    public = snapshot.public_snapshot_from_full(fixture)

    assert "local_metadata_edition" not in public
    assert public["catalogue_index_url"] == "/data/catalogue-index-a1b2c3d4e5f6.json"
    assert public["poster_gallery_url"] == "/data/poster-galleries-20261117T000000Z.json"
    assert public["ranking_csv_url"] == "/data/ranking-20261117T000000Z-0123456789ab.csv"
    assert public["ranking_gzip_url"] == "/data/ranking-20261117T000000Z-0123456789ab.csv.gz"


@pytest.mark.parametrize("metadata,expected", [
    ({}, 0),
    ({"metadata_status": "unavailable"}, 0),
    ({"metadata_status": "complete"}, 0),
    ({"tmdb_id": None, "metadata_status": "partial"}, 0),
    ({"tmdb_id": 329865}, 1),
    ({"tmdb_id": 329865.0}, 1),
    ({"tmdb_id": 329865, "metadata_status": "id_only"}, 1),
    ({"tmdb_id": 329865, "metadata_status": "complete"}, 1),
    ({"tmdb_id": 329865, "metadata_status": "partial"}, 1),
    ({"tmdb_id": 329865, "metadata_status": "unavailable"}, 1),
])
def test_public_snapshot_counts_actual_tmdb_ids_not_missing_metadata_status(metadata, expected):
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    fixture["films"][0].update(metadata)
    assert snapshot.public_snapshot_from_full(fixture)["tmdb_match_count"] == expected


def test_public_snapshot_match_count_only_includes_featured_films():
    fixture = json.loads((Path(__file__).parent / "fixtures" / "snapshot-minimal.json").read_text())
    second = {**fixture["films"][0], "title": "Matched film", "tmdb_id": 329865}
    fixture["films"].append(second)
    fixture["film_count"] = fixture["displayed_film_count"] = 2
    assert snapshot.public_snapshot_from_full(fixture, featured_limit=1)["tmdb_match_count"] == 0
    assert snapshot.public_snapshot_from_full(fixture, featured_limit=2)["tmdb_match_count"] == 1
