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

## Make your own site

The web demo is a static site backed by a weekly snapshot. Visitors only download that snapshot; the scheduled GitHub Action reads Letterboxd to find the public liked lists, list membership, and watched status.

1. Fork this repository.
2. In `site-config.json`, replace `intelkishan` with your Letterboxd username.
3. Connect your fork to Vercel and set the project root directory to `web`.

Pushing the username change starts the first refresh. The workflow commits the generated snapshot, which triggers the site deployment. Later refreshes run weekly; you can also start one from the Actions tab. Your liked lists and Films page must be public.

The username is the only required site setting. TMDB is optional: when `TMDB_API_KEY` is configured, TMDB provides film titles, years, posters, and synopses; without it, the site uses titles and poster image URLs already present in the fetched Letterboxd list pages. No additional Letterboxd requests are made for posters. To enable TMDB metadata, add a TMDB API key as the `TMDB_API_KEY` repository secret. Its metadata cache is reused between refreshes.

To generate a snapshot locally, run `uv sync` and then `uv run reelrank-snapshot --username YOUR_USERNAME`. Add `TMDB_API_KEY` to `.env` if you want TMDB metadata locally. A failed refresh leaves the previous snapshot in place.
