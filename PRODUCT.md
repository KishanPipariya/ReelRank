# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the maintainer, who uses ReelRank to explore films across Letterboxd lists they have liked. The repository is also structured as a reusable static site template for people who want to publish a catalogue for their own Letterboxd profile.

## Product Purpose

ReelRank brings together films found across a user's liked public Letterboxd lists and ranks them by how many lists they appear in. It supports personal discovery through a command-line tool and a browsable static catalogue. Success means making that cross-list signal easy to generate, explore, and share from a profile-specific snapshot.

## Positioning

ReelRank combines no-export aggregation of liked public lists with a profile-specific, filterable static catalogue. Film rank reflects repeated appearances across the lists the user liked, rather than a manually assembled watchlist or a general popularity score.

## Operating Context

The maintainer can run the Python CLI with a Letterboxd username; liked lists must be public, and watched-status filtering also requires a public Films page. The web edition is a static site driven by a checked-in snapshot for one configured username. Snapshot updates are manual: the matching snapshot and its edition-specific ranking CSV and poster-gallery files are committed and deployed together. A copied site is configured with a username and matching snapshot, and can be deployed on Vercel with `web` as its project root. Viewers browse ranked films and can search, filter, sort, inspect source lists, and open film details. Layout choices, poster selections, and saved views are local to each browser.

## Capabilities and Constraints

- The CLI ranks films across liked lists and can filter by watched status or Letterboxd genre, and can export genre-specific unwatched CSVs.
- The static site displays ranked films, list-appearance counts, watched status, and source-list links. Catalogue controls include search, sorting, and filters for watched status, genre, source list, director, production country, decade, running time, and language where snapshot metadata supports them.
- The site uses checked-in public snapshot data and has no sign-in, account database, or analytics code. Browser preferences remain in local storage.
- Snapshot generation and automated access to Letterboxd must be used only in ways Letterboxd authorizes. Public deployment shares the snapshot's profile and list information.
- The site must not show another profile's data when the configured username and snapshot do not match. Demo data is opt-in and clearly labelled. Loading failures provide a visible retry control.
- TMDB enrichment is optional. Without a key, available Letterboxd data can still be used; metadata enrichment and alternate-poster galleries depend on TMDB data. The optional API key belongs in the ignored local `.env` file and must not be committed or included in a public snapshot.
- Snapshot refreshes are not automated by GitHub Actions. The remaining workflow runs quality and accessibility checks.

## Evidence on Hand

- The CLI, static-site implementation, tests, and sample data are in `src/reelrank/`, `web/`, and `tests/`.
- `README.md` documents setup, snapshot publishing, CLI usage, data handling, and operating constraints.
- The checked-in web snapshot and poster-gallery data are in `web/data/`; the web configuration is in `web/site-config.json`.
- A written explanation of the ranking approach is linked from the web interface. Do not invent endorsements, user counts, or performance claims.

## Product Principles

- Make the signal from liked lists easy to explore without requiring a data export.
- Keep rankings tied to list appearances and make their source inspectable.
- Make each static edition clearly belong to its configured profile and snapshot.
- Keep optional enrichment and per-browser preferences separate from the public snapshot's core purpose.
- Respect data access authorization and communicate what a public deployment shares.
