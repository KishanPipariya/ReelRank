# ReelRank

ReelRank ranks films by how often they appear in public Letterboxd lists that you liked. Use your Letterboxd username to get the results.

## Run ReelRank

1. Install the dependencies.

   ```sh
   uv sync
   ```

2. Run ReelRank. Replace `YOUR_USERNAME` with your Letterboxd username.

   ```sh
   uv run reelrank YOUR_USERNAME
   ```

ReelRank writes the results to `liked-list-movies.csv`. Use `--output ranked.csv` to set a different path.

### Filter the results

Use `--unwatched` to exclude watched films. Your Films page must be public for this option.

```sh
uv run reelrank YOUR_USERNAME --unwatched
```

Use `--genre` to select a genre. You can combine it with `--unwatched`.

```sh
uv run reelrank YOUR_USERNAME --genre Comedy --unwatched
```

ReelRank scans the Letterboxd genre pages and matches them against your ranked films. If Letterboxd does not show the film grid, ReelRank uses TMDB. It uses the TMDB API if you set an API key. Otherwise, it uses a local TMDB metadata CSV file if one is available.

Use `--metadata` to set the path to the metadata file. Use the TMDB `movies_metadata.csv` column names, including `title`, `release_date`, and `genres`.

```sh
uv run reelrank YOUR_USERNAME --genre Horror --metadata data/tmdb-movies.csv --unwatched --output horror.csv
```

Use `--all-genres` to write one unwatched CSV file for each TMDB genre.

```sh
uv run reelrank YOUR_USERNAME --all-genres
```

ReelRank writes files such as `genre-lists/horror-unwatched.csv`. Use `--genre-output-dir` to set a different directory. ReelRank uses one TMDB discovery scan for all genres. It stores TMDB genre results in `.reelrank-cache/` for 30 days.

### Set the TMDB API key

Use `.env.example` as the template for `.env`. Put your TMDB v3 API key in `.env`.

```env
TMDB_API_KEY=your_tmdb_v3_api_key
```

Git ignores `.env`. You can also set `TMDB_API_KEY` in your shell. Use `--env-file` to select a different file.

## Set up your site

1. Select **Use this template** on GitHub to create your own repository.
2. Set your Letterboxd username in `web/site-config.json`.
3. Put a snapshot for that username in `web/data/snapshot.json`.
4. Connect your repository to Vercel.
5. Set the Vercel project root to `web`.

If the snapshot username differs from the configured username, the site shows a setup screen. You can open the labelled demo from that screen. Select **Retry loading** if the configuration or catalogue fails to load.

The site shows the detailed films first. It loads the compressed full ranking in the background. The ranking makes all ranked films available for search and browsing. If the full ranking is unavailable, the site shows the smaller set that you can search. The detailed snapshot contains metadata for up to 500 films. The site shows a notice when the snapshot is at least 30 days old.

Set `public_site_url` in `web/site-config.json` if you want links copied from a local preview to use the public site address.

### Generate a snapshot

Use the snapshot command only if Letterboxd authorizes your access. The liked lists and Films page must be public. See the [Letterboxd Terms of Use](https://letterboxd.com/legal/terms-of-use/).

1. Install the dependencies.

   ```sh
   uv sync
   ```

2. Generate the snapshot.

   ```sh
   uv run reelrank-snapshot
   ```

The command reads the username from `web/site-config.json`. Use `--username YOUR_USERNAME` to select a different username. If pagination stops advancing or reaches its safety limit, the command reports an error.

The command reads TMDB IDs from Letterboxd film pages. If you set a TMDB API key, it uses those IDs to get film metadata. If a film page has no TMDB link, the command can search TMDB by title and year. Metadata includes genres, directors, production countries, runtime, original title, and original language. The command also saves up to 24 alternate poster paths per matched film in the detailed set. The site requests this data when you open a poster gallery.

Use `--include-local-full` to add metadata for every ranked film. This option requires `TMDB_API_KEY` and can take longer. It creates `web/data/local/snapshot.json` and its data files. Git and Vercel ignore the local edition. On localhost, the site uses the public snapshot if the local edition is missing or invalid. If local enrichment fails, the command still updates the public snapshot and reports an error.

Version 2 snapshots require a `source_lists` URL table and integer `list_ids` on each film. Regenerate earlier snapshots with the current command. The command validates the snapshot before it replaces the current file.

To publish an update, commit the snapshot and the files named in `poster_gallery_url`, `ranking_csv_url`, and `ranking_gzip_url` together. Then deploy the site. GitHub Actions runs quality checks. Snapshot generation is manual.

### Data and privacy

The public snapshot includes film rankings, list counts, watched status, and links to source lists. Publish the site only if you want to share this data.

ReelRank has no sign-in, account database, or analytics code. The site requests poster images from TMDB or Letterboxd and fonts from Google Fonts. External profile and source-list links open Letterboxd.

Layout, poster choices, and saved views stay in the browser. Use **Export saved views** to create the JSON file that the import control accepts.

The TMDB API key is for local commands. Keep it in the ignored `.env` file. Keep it out of snapshots and commits.

Vercel applies the Content Security Policy and other browser security headers. The local static server does not apply the Vercel headers.

## Run checks

1. Install the Python development dependencies.

   ```sh
   uv sync --locked --group dev
   ```

2. Run the Python tests.

   ```sh
   uv run --locked pytest
   ```

3. Install the JavaScript dependencies.

   ```sh
   npm ci
   ```

4. Run the JavaScript tests.

   ```sh
   npm test
   ```

5. Install Chromium for Playwright.

   ```sh
   npx playwright-core install chromium
   ```

6. Start the local server.

   ```sh
   python3 -m http.server 4173 --directory web
   ```

7. Run the browser checks in a second terminal.

   ```sh
   npm run check:browser
   ```

The browser checks use `tests/fixtures/browser-snapshot.json`. They check keyboard navigation, screen-reader labels, and layout at desktop and mobile widths. GitHub Actions runs these checks on pull requests and pushes to `main`. It saves screenshots and saves traces when browser checks fail.

To run one scenario, use `npm run check:browser -- --scenario=catalogue`. Other scenarios are `sharing`, `preferences`, `recovery`, `accessibility`, and `reflow`.

Keep the server running for these checks.

| Command | What it checks |
| --- | --- |
| `npm run check:stress` | Five data states across seven layouts, plus known UI bugs. |
| `npm run check:invariants` | Catalogue behavior across linked views, history, and other combined actions. |
| `npm run check:safety` | Film links, focus, filters, genre lists, and poster zoom. |

Before you merge changes to catalogue controls or dialogs, follow the [manual screen-reader review](docs/screen-reader-review.md).
