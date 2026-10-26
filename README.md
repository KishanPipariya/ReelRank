# ReelRank

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

Until the snapshot matches the configured username, the site shows a setup screen rather than another profile's data. You can opt into a clearly labelled demo preview from that screen. If configuration or catalogue loading fails, use the visible Retry loading control. Snapshot updates are manual: commit the replacement snapshot and the edition-specific poster-gallery file named by its `poster_gallery_url` field together, then deploy them. Alternate-poster data is loaded only when a viewer opens a film's poster gallery. Shared programme and film links use the current site address; set an optional `public_site_url` in `web/site-config.json` to make links copied from local previews point to the public deployment. Layout choice, selected alternate posters, and named filter presets are stored locally in each browser; they are not shared with the public site or an account. The repository's snapshot command reads Letterboxd pages and may be denied; only use automated access in a way Letterboxd authorizes. See [Letterboxd's Terms of Use](https://letterboxd.com/legal/terms-of-use/). If you use the command, the liked lists and Films page must be public.

The public site displays ranked films, how many liked lists each film appears in, watched status, and source-list links. Its catalog can be filtered by genre, director, production country, and decade; expanded film details include original title and language when TMDB provides them. Use a public deployment only if you are comfortable sharing that information.

Snapshots can store source list URLs once in top-level `source_lists` and reference them from films with integer `list_ids`. Older schema version 1 snapshots that store per-film `lists` arrays remain supported; generated snapshots use the compact table contract to reduce repeated URLs.

The username is the only required site setting. Snapshot generation reads each featured film’s TMDB ID from its Letterboxd film page and records it, then uses that ID to fetch metadata when `TMDB_API_KEY` is configured. This includes genres, director credits, production countries, runtime, original title, and original language. When the key is configured, it also writes up to 24 alternate poster paths per matched film to an edition-specific file under `web/data/`; the snapshot's `poster_gallery_url` points to that file, and the compact main snapshot stays unchanged. If a page has no TMDB link, title/year matching is used as a fallback. Each film records the metadata source, enrichment status, and fetch time; metadata cache entries expire after 30 days. Without an API key, linked IDs are still recorded, while titles and poster image URLs come from fetched Letterboxd list pages and TMDB metadata such as genres and credits is empty. The GitHub Actions workflow does not need a TMDB secret because it does not refresh snapshots.

If you are authorized to use the snapshot command, run `uv sync` and then `uv run reelrank-snapshot`. It reads the username from `web/site-config.json`; pass `--username YOUR_USERNAME` to override it. Add `TMDB_API_KEY` to `.env` if you want TMDB metadata. A failed refresh leaves the previous snapshot in place. Snapshot files carry a schema version and are validated before they replace the current file.

Pagination stops with an explicit error if a Letterboxd collection exceeds its safety limit or stops advancing, rather than returning partial data as if it were complete.

Pull requests and pushes to `main` run parser/snapshot checks and browser accessibility checks in separate jobs. The Playwright scan uses a fixed fixture in `tests/fixtures/browser-snapshot.json`; it runs axe across desktop, mobile, dark mode, expanded programme notes, empty results, setup, and demo-preview states. It also checks sorting, country filters, display modes, browser Back and Forward, card expansion across rerenders, cached score and director state, the details dialog, keyboard focus, accessible names, result announcements, featured-film layout, and reflow at 200% and 400% zoom-equivalent viewport widths. Catalogue layout checks enforce that controls, display options, and results remain separate, appear in order, and do not overlap or overflow at desktop, mobile, and narrow reflow widths. Visible and screen-reader search descriptions are checked against the same field list. Desktop and mobile screenshots are uploaded for review without comparing them against image baselines; responsive layout assertions continue to run in CI. Failed browser checks save screenshots and traces as workflow artifacts. These automated checks do not replace testing with a real screen reader.

For local checks, run `uv sync --locked --group dev`, `uv run --locked pytest`, and `npm ci && npm test`. Start a static server with `python3 -m http.server 4173 --directory web`, then run `npm run check:browser` in another terminal. Run one browser scenario with `npm run check:browser -- --scenario=catalogue` (also `sharing`, `preferences`, `recovery`, `accessibility`, or `reflow`). The browser checks use the fixed fixture and do not contact Letterboxd or TMDB.

To enable **Use this template** on the upstream repository, open **Settings → General** and select **Template repository**. Until that setting is enabled, users should fork the repository.
