# Reelrank

Find films that appear most often across the public lists you’ve liked on Letterboxd. Enter your username; no export file is needed.

```sh
uv sync
uv run reelrank YOUR_USERNAME
```

To exclude films you’ve marked as watched:

```sh
uv run reelrank YOUR_USERNAME --unwatched
```

Results are saved to `liked-list-movies.csv`. Choose a different path with `--output`, for example `--output ranked.csv`. Liked lists must be publicly accessible; `--unwatched` also requires your Films page to be public.
