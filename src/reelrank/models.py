from __future__ import annotations

from dataclasses import dataclass

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
