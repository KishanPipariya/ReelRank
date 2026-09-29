# Letterboxd liked-list movies

This small CLI reads the `likes/lists.csv` file from a Letterboxd data export, visits each liked list, and ranks movies by the number of liked lists in which they appear.

## Run with uv

Install/sync dependencies and run:

```sh
uv sync
uv run letterboxd
```

The default output is a table in the terminal and `liked-list-movies.csv` in the project directory. The CSV includes each movie's title, year, count, Letterboxd URL, and source list URLs.

Useful options:

```sh
uv run letterboxd --lists path/to/likes/lists.csv --output ranked.csv

# Only include movies you have not watched yet
uv run letterboxd --unwatched
```

The lists need to be publicly accessible because the app fetches them from Letterboxd. A movie is counted at most once per list, even if a list contains duplicate entries.
