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

The web demo is a static site backed by a checked-in snapshot. The GitHub Actions workflow that contacted Letterboxd to refresh it has been removed; the remaining workflow runs quality and accessibility checks only.

1. Create your own copy of the repository. Once the repository is marked as a GitHub template, use **Use this template**; otherwise, fork it.
2. In `web/site-config.json`, replace `intelkishan` with your Letterboxd username.
3. Supply a snapshot in `web/data/snapshot.json` whose username matches the configured username, using a data source you are authorized to use.
4. Connect your copy to Vercel and set the project root directory to `web`.

Until the snapshot matches the configured username, the site shows a setup screen rather than another profile's data. You can opt into a clearly labelled demo preview from that screen. Snapshot updates are manual: commit the replacement snapshot and deploy it. The repository's snapshot command reads Letterboxd pages and may be denied; only use automated access in a way Letterboxd authorizes. See [Letterboxd's Terms of Use](https://letterboxd.com/legal/terms-of-use/). If you use the command, the liked lists and Films page must be public.

The public site displays ranked films, how many liked lists each film appears in, watched status, and source-list links. Use a public deployment only if you are comfortable sharing that information.

The username is the only required site setting. TMDB is optional: when `TMDB_API_KEY` is configured while generating a snapshot, TMDB provides film titles, years, posters, and synopses; without it, the snapshot generator uses titles and poster image URLs already present in fetched Letterboxd list pages. No additional Letterboxd requests are made for posters. The GitHub Actions workflow does not need a TMDB secret because it does not refresh snapshots.

If you are authorized to use the snapshot command, run `uv sync` and then `uv run reelrank-snapshot --username YOUR_USERNAME`. Add `TMDB_API_KEY` to `.env` if you want TMDB metadata. A failed refresh leaves the previous snapshot in place.

Pull requests and pushes to `main` run parser/snapshot checks and an axe accessibility scan across desktop, mobile, dark mode, expanded synopsis, empty results, setup, and demo-preview states.

To enable **Use this template** on the upstream repository, open **Settings → General** and select **Template repository**. Until that setting is enabled, users should fork the repository.
