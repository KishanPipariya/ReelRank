# Reelrank

This small CLI takes your Letterboxd username, finds your publicly liked lists, visits each list, and ranks movies by the number of liked lists in which they appear. It can also fetch your watched films from your public profile to show only movies you have not seen. Requests use a Chrome-compatible HTTP fingerprint because Letterboxd may reject standard Python HTTP clients with a 403.

## Run with uv

Install/sync dependencies and run:

```sh
uv sync
uv run reelrank YOUR_USERNAME
```

The results are saved to `liked-list-movies.csv` in the project directory. The CSV includes each movie's title, year, count, Letterboxd URL, and source list URLs. The terminal shows live progress while the liked lists and, if requested, watched films are downloaded.

Useful options:

```sh
uv run reelrank YOUR_USERNAME --output ranked.csv

# Only include movies you have not watched yet
uv run reelrank YOUR_USERNAME --unwatched
```

Your liked lists and watched films need to be publicly accessible because the app fetches them from Letterboxd. A movie is counted at most once per list, even if a list contains duplicate entries. No Letterboxd export CSV is needed.
