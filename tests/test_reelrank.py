from reelrank import Movie, MovieResult, filter_unwatched, parse_list_page


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


def test_filter_unwatched_uses_title_and_year():
    results = [
        MovieResult(Movie("Arrival", "2016", "https://letterboxd.com/film/arrival/"), 2, []),
        MovieResult(Movie("Moonlight", "2016", "https://letterboxd.com/film/moonlight/"), 1, []),
    ]

    remaining = filter_unwatched(results, {("arrival", "2016")})

    assert [result.movie.title for result in remaining] == ["Moonlight"]
