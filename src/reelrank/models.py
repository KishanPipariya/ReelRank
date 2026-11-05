from __future__ import annotations

from dataclasses import dataclass
import re

@dataclass(frozen=True)
class Movie:
    title: str
    year: str
    uri: str
    poster_url: str = ""

@dataclass
class MovieResult:
    movie: Movie
    liked_in: int
    lists: list[str]


def ranked_movie_sort_key(result: MovieResult) -> tuple[int, str, str, str, str, str]:
    """Order by liked-list count, then title with one initial English article ignored."""
    title = result.movie.title.strip()
    title_without_article = re.sub(r"^the\s+(?=\S)", "", title, count=1, flags=re.IGNORECASE) or title
    return (
        -result.liked_in,
        title_without_article.casefold(),
        title.casefold(),
        title,
        result.movie.year,
        result.movie.uri,
    )
