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

To include only films in a Letterboxd genre:

```sh
uv run reelrank YOUR_USERNAME --genre Drama
```

You can combine filters, for example `--genre Comedy --unwatched`. Genre filtering scans Letterboxd’s paginated genre catalog and matches it against your ranked films. If Letterboxd serves a genre page without its film grid, the tool uses the TMDB API when `TMDB_API_KEY` is set, with a local TMDB `movies_metadata.csv` as a fallback. TMDB genre results are cached in `.reelrank-cache/` for 30 days, so repeat runs only do an in-memory title/year match.

Create an unwatched CSV for every TMDB movie genre with:

```sh
uv run reelrank YOUR_USERNAME --all-genres
```

This writes files such as `genre-lists/horror-unwatched.csv`. The cache is built with one shared TMDB discovery scan and is reused for 30 days. Set a different output directory with `--genre-output-dir`.

Put your TMDB v3 API key in `.env`:

```env
TMDB_API_KEY=your_tmdb_v3_api_key
```

This workspace has a blank `.env`; `.env.example` is the template for fresh checkouts. The `.env` file is ignored by Git so your key stays local. You can also set `TMDB_API_KEY` in your shell or choose a different env file with `--env-file`.

Choose a different TMDB metadata file with `--metadata`:

```sh
uv run reelrank YOUR_USERNAME --genre Horror --metadata data/tmdb-movies.csv --unwatched --output horror.csv
```

The metadata file should use TMDB’s `movies_metadata.csv` columns, including `title`, `release_date`, and `genres`. It is only used when Letterboxd’s genre grid is unavailable and no TMDB API key is set.

Results are saved to `liked-list-movies.csv`. Choose a different path with `--output`, for example `--output ranked.csv`. Liked lists must be publicly accessible; `--unwatched` also requires your Films page to be public.

## Reelrank web demo

The `web/` directory contains a static demo for the `intelkishan` profile. It displays the top 500 ranked films, posters, liked-list links, watched status, and an unwatched filter, alongside totals for the full ranking. The site reads `web/data/snapshot.json`; it does not scrape Letterboxd when someone visits.

Add the key to `.env` before refreshing the snapshot locally:

```env
TMDB_API_KEY=your_tmdb_v3_api_key
```

```sh
uv sync
uv run reelrank-snapshot
```

The GitHub Actions workflow in `.github/workflows/refresh-demo.yml` refreshes the snapshot daily and can also be started manually from the Actions tab. It commits changed data, which triggers a Vercel deployment. Connect the repository to Vercel and set the project root directory to `web` to deploy the static site. A failed refresh leaves the previous snapshot in place.

The refresh workflow reads `TMDB_API_KEY` from a GitHub Actions repository secret. Add it under **Settings → Secrets and variables → Actions** before running the workflow. The demo includes TMDB's required attribution and approved logo.
