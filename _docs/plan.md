# ReelRank demo plan

> Historical plan. The scheduled Letterboxd snapshot refresh workflow has been removed; do not restore automated page extraction without authorization from Letterboxd. The separate quality and accessibility workflow remains active.

## Goal

Build and deploy a public ReelRank demo for the Letterboxd profile `intelkishan`. The page will show a weekly-refreshed snapshot of films ranked by how often they appear across the profile's liked public lists.

## Scope

- Use only the `intelkishan` profile; visitors cannot enter a different username.
- Show the top 500 ranked films with poster, title, release year, and the number of liked lists they appear in. Include the total ranked-film count in the summary.
- Link each film to Letterboxd and show links to the lists containing it.
- Include a filter to show all films or only unwatched films.
- Show when the snapshot was last refreshed.
- Skip genre filtering for the first version.
- If a refresh fails, keep serving the last successful snapshot.

## Recommended stack

- **Ranking and data refresh:** Keep the existing Python 3.13 code and dependencies. Refactor the ranking flow into reusable functions and add JSON output for the web snapshot. Use Letterboxd for public liked lists and watched status, and TMDB for film metadata, posters, and summaries. Retain the CLI.
- **Frontend:** A static HTML, CSS, and JavaScript page that reads the generated JSON. This is enough for the single-profile demo and avoids adding an API framework or database.
- **Hosting:** Vercel, connected to the Git repository. Vercel creates deployments when repository changes are pushed.
- **Weekly schedule:** GitHub Actions runs the Python refresh job once a week, updates the snapshot in the repository, and pushes the change. That push triggers a Vercel deployment. Manual runs remain available when the data needs an earlier refresh.

This keeps the existing Python stack. Vercel supports Python and `pyproject.toml` if a server-side API is needed later, but this demo does not need one. A static snapshot avoids putting scraping work in a visitor's request and avoids provisioning persistent storage for cached results.

## Implementation steps

1. **Refactor the ranking flow** so the existing scraping and ranking logic can be called by both the CLI and a scheduled refresh job.
2. **Add snapshot generation** that writes JSON containing total counts and the top 500 films, including watched status, TMDB metadata and poster URLs, list counts, list URLs, and a refresh timestamp. Resolve TMDB metadata for this bounded set.
3. **Build the static page** with the ranked film list, poster artwork, Letterboxd links, list links, incremental loading, and an all/unwatched filter. Include loading, empty, and stale-snapshot states.
4. **Add the weekly GitHub Actions workflow** to install the project, refresh the snapshot, and commit changes only when the snapshot has changed. A failed refresh must not overwrite the last good snapshot.
5. **Create the Vercel project** from the Git repository and configure its static output/build settings.
6. **Verify the deployed demo** against `intelkishan`: check ranking, poster display, list and film links, watched filtering, the timestamp, and behavior when a refresh fails.

## Assumptions and dependencies

- The liked lists and Films page needed for watched status are public. The existing README notes that these pages must be publicly accessible.
- The repository will be hosted on GitHub and connected to Vercel. GitHub Actions needs permission to commit the generated snapshot.
- `TMDB_API_KEY` must be configured as a GitHub Actions repository secret (and locally in `.env` only if running the snapshot command by hand).
- The demo will use Letterboxd's publicly accessible page data and will not ask visitors to authenticate.
- The initial deployment can use Vercel's default project URL; a custom domain can be added later.
- The site will show TMDB's required logo and attribution notice.

## Future options

- Add genre filtering or additional profiles.
- Replace the static snapshot flow with a live API if the product needs on-demand refreshes.
- Add a custom domain or richer analytics after the demo is working.
