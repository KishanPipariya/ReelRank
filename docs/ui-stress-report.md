# ReelRank UI stress test — 7 November 2026

Latest: [fresh read-only post-fix audit and remaining findings](ui-stress-retest.md).

Performed with GPT-6.1 Sol using `.agents/skills/break-ui/SKILL.md` and its worst-case catalog. Scope: catalogue summary, featured film, poster cards, table view, search and facet controls, source-list provenance, film details, shared film links, and poster loading. All six findings have now been fixed. The original findings and before screenshots are preserved below; the following verification records the completed changes.

## Fixes applied and verified

| Finding | Applied change | Current location |
| --- | --- | --- |
| 1 | Restore a shared film after matching results finish. Refresh only the navigation when the full ranking arrives, preserving the synopsis DOM, reading position, and focused control. Navigation stacks to match the actual detail column width. | `web/app.js:1985`, `web/app.js:2156`, `web/film-views.js:311`, `web/styles.css:982` |
| 2 | Show complete source-list names as wrapped links, including the distinguishing suffix. | `web/styles.css:899`, `web/styles.css:902` |
| 3 | Wrap the card title/year row and bound year text to its container; table years also wrap. Existing accepted year values remain supported. | `web/styles.css:482`, `web/styles.css:725`, `web/styles.css:762` |
| 4 | Give long numeric values a complete row, size them against their container, wrap the descriptive label, and widen the table's numeric column when needed. Every digit remains visible. | `web/app.js:1528`, `web/film-views.js:408`, `web/styles.css:495`, `web/styles.css:766`, `web/styles.css:879` |
| 5 | Select singular summary, search-scope, metadata-scope, and footer wording when the count is one. | `web/app.js:2092`, `web/app.js:2111`, `web/app.js:2154`, `web/index.html:86` |
| 6 | Compact card genre chips to one line with the full text in their accessible name and native title. Full long genre labels wrap as plain filter text in details. | `web/film-components.js:5`, `web/app.js:1142`, `web/film-views.js:452`, `web/styles.css:783`, `web/styles.css:883` |

The accepted numeric and year schema limits were retained. These fixes support existing snapshots and leave their boundary fixtures useful as regression data.

Verification: `npm test` passes all 25 tests; `npm run check:browser` passes the full existing suite; `npm run check:stress` passes all five actual toggle states at 320, 1440, 2560, and 720px, dark 320px, enlarged root text at 320px, and RTL at 320px (35 combinations). Shared film 99,999 has functioning Previous/Next controls and a correctly formatted position in every profile. The delayed 6,001-film ranking refresh preserves reading content, focus, and scroll position; choosing a genre closes the dialog and applies its filter. Light/dark axe scans, keyboard navigation, setup/retry, sharing, preferences, and 200%/400% zoom-equivalent reflow pass. `git diff --check` is clean.

After screenshots: [card, year, count and compact genre](ui-stress/fixed-card-320.png), [detail score and full genre text](ui-stress/fixed-score-320.png), [full source-list names](ui-stress/fixed-sources-320.png). Browser checks emulate touch and reflow; physical devices and screen readers remain untested.

The browser harness now explicitly excludes the ignored localhost snapshot so the fixed test fixture is used. Its saved-view check verifies disabled empty-selection actions and waits for file import to finish. The retained stress fixtures and bottom-center toggle remain localhost-only.

## Original findings

The file/line references in this original table identify the pre-fix revision.

The explicit schema-boundary row deliberately uses the limits the application accepts. Its huge numbers and 512-character metadata are contract tests, not claims about typical Letterboxd data.

| # | Severity | Field | Worst-case value | What happens | Proposed fix and location |
| --- | --- | --- | --- | --- | --- |
| 1 | Broken | Shared film link / result navigation | Open film 99,999 directly in the 100,000-row fixture | The film opens, but Previous, Next, and result position never appear, even after the catalogue reports `Showing 43 of 100,000 films`. `initializeSnapshot` starts the asynchronous render and restores the dialog before matching films are available. | Await the initial render before restoring the film, and refresh an open detail view when the matching catalogue changes. Start at `web/app.js:2144`; navigation currently depends on the result set at `web/film-views.js:316`. |
| 2 | Broken | Source-list names | Two lists named `The Complete International Cinema Restoration And Preservation Programme 2026 Including Alternate Cuts And Newly Rediscovered Films`, one with `Directors Cuts And Extended Editions` appended | At 320px, both show the same clipped prefix. The links are 220px wide with 770px and 983px of content. There is no tooltip or local full-name disclosure. The title is also clipped at wider dialog sizes. | Wrap full names in the details view: `min-width: 0; white-space: normal; overflow-wrap: anywhere`, and allow the link height to grow. `web/styles.css:887` and `web/styles.css:890`; optional desktop `title` at `web/app.js:1367`. |
| 3 | Broken | Release year | Schema-valid 64-character `2026 (restoration; original release date remains unconfirmed)` plus padding | The year has `flex: 0 0 auto`; its 448px width takes the whole 266px card text row. The film title collapses and the year is clipped at the viewport edge. The snapshot schema accepts this value, while the ranking CSV requires four digits. | Let the year wrap or move onto a separate row when necessary at `web/styles.css:722` and `web/styles.css:759`. Align the year contract with CSV validation at `web/snapshot.schema.json:29` and `web/ranking-csv.js:103`. |
| 4 | Broken | List-appearance count | Schema maximum `9,007,199,254,740,991` | At 320px, the details dialog has 286px of usable width but 343px of horizontal content. The score line is a nonwrapping flex row; `list appearances` spills off the visible panel. At 720px, the card's 182px count area also contains a number wider than the area. | Wrap the score label below the number at `web/styles.css:868`; give numeric content a full row or a smaller responsive numeric size in narrow cards at `web/styles.css:760`. Preserve the complete number. Consider a meaningful domain maximum in both snapshot schemas. |
| 5 | Ugly | Singular counts | Exactly one film and one liked list | Summary says `1 films found` and `1 liked lists scanned`; search scope says `1 detailed films`; footer says `Browsing 1 ranked films`. Results, placeholder, detail count, and selection-end copy already use the singular correctly. | Use count-aware labels for `web/index.html:86`, `web/index.html:88`, `web/app.js:2105`, `web/app.js:2108`, and `web/app.js:2142`. |
| 6 | Ugly | Genre label | A 512-character genre, the string-item limit in the snapshot schema | A single secondary genre becomes a large multiline pill that dominates the card and details. Expanding the filter can devote its selected-item scroller to this one label. It remains readable but loses the compact tag presentation. | Add a compact visible label with an accessible full-value reveal, or deliberately render long genre names as wrapped text rather than pills. `web/styles.css:774`; review the domain limit at `web/snapshot.schema.json:23`. |

Reproduce #1 at:

`http://127.0.0.1:4173/?data=100000&film=https%3A%2F%2Fletterboxd.com%2Ffilm%2Freelrank-stress-99999%2F`

Evidence: [missing navigation](ui-stress/large-deep-link-1440.png), [indistinguishable list names](ui-stress/source-lists-320.png), [long year and genre](ui-stress/schema-boundary-320.png), [overflowing score](ui-stress/score-320.png), [singular copy](ui-stress/one-320.png).

## Decisions for you

- **Source-list titles:** recommend wrapping their full names in film details, because identifying the source is the purpose of that section. Compact facet chips already wrap safely on mobile.
- **Year contract:** recommend a four-digit year or empty value, matching the CSV contract. If restoration notes are supported, store and display them separately.
- **Long genres:** recommend a short card label plus full name in an explicit disclosure. Keep ordinary genre names unchanged.
- **Numeric bounds:** the current maximum is JavaScript's safe integer limit. Either retain support with responsive numeric layout or choose documented domain limits; avoid silent rounding or truncation.

## What held up

- No horizontal page scrolling at 320, 720, 1440, or 2560px. The intentionally scrollable table retains its separate horizontal scroller. Individual clipped content in findings #2–4 is still a failure despite the page's `overflow-x: clip`.
- 1,024-character film titles clamp on cards and remain fully readable in details. A 20,000-character synopsis wraps in the scrollable dialog.
- CJK, Arabic, Vietnamese diacritics, apostrophes, emoji and a ZWJ emoji sequence remain intact. Short credits `J` and `Jo` do not create empty separators. Missing year, director, country, runtime, genres and synopsis use the existing omissions/fallbacks.
- Literal `<script>alert(1)</script> &amp; **bold**` remains text; it does not execute or become markup.
- Counts 0, 1 and 1,284 format correctly in result totals and film-appearance labels. Empty progress remains `0%`, with no `NaN` or division-by-zero output.
- Zero-film and no-results states explain what happened. Clear search restores results and returns focus to the search input.
- The 100,000-row catalogue initially rendered 42 cards plus the featured film, then 82 cards after one additional batch. Initial settled results took about 3.1 seconds; searching for generated film 99,999 took about 610ms; adding the next batch took about 69ms on this machine. These are single local runs, not device performance guarantees.
- Exactly 40 and 41 films behave correctly in title sort: 40/40 has no extra batch; 40/41 becomes 41/41. Identical film names keep their release-year metadata and distinct destinations.
- Twelve directors, thirteen countries and twelve source lists retain their expansion controls. All twelve source links can be shown. Long selected source-list chips wrap at 320px without page overflow.
- The real 5,220-minute runtime formats as `3d 15h`.
- Missing and failed posters use a fallback. Stubbed 4000×200 and 200×4000 media use `object-fit: cover`. Slow loading retained each poster's 253.5px height before and after loading at 390px, with no poster layout shift. [Media evidence](ui-stress/media-390.png).
- Loading, HTTP failure, Retry loading, and unavailable alternate-poster data expose useful statuses and recover as expected.
- Axe reports no violations on the settled light and dark catalogue surfaces, with each watch filter active in dark mode. Test chrome was excluded from the audit. A media-theme transition produced transient color results in an initial scan; all settled reruns passed.
- All 25 existing JavaScript tests pass. Demo, Worst case, Empty, One, and 100,000-row snapshots pass the shared snapshot validator. The localhost gate rejects a public hostname.

## Test coverage and limits

Viewed and captured Demo and Worst case at 320, 1440 and 2560px. The page caps its actual catalogue width at 1320px; card widths were tested inside that real layout. Also checked Worst case at a 720px viewport, equivalent to the reflow width of a 1440px window at 200% zoom, and at 320px with the existing `?text=200` root-font setting. This was reflow and large-text testing, not a claim that browser chrome zoom was operated.

Dark mode and the existing `?dir=rtl` development diagnostic were exercised at 320px. Touch behavior was emulated at 320 and 390px. No physical device or screen reader was used. The app exposes English copy and no locale picker, account permission model, currency field, email field, or avatar; those catalog cases do not apply to this surface. The stale-edition calculation's threshold and future-date behavior are covered by the existing unit checks. Saved-view editing, import/export, and printed-page layout were outside this catalogue-focused pass.

## Rendered-value map

Limits below come from the shared `web/snapshot.schema.json`, mirrored by the Python package. Optional arrays can be absent; required strings may still allow an empty value where noted.

| Rendered value | Source / boundary | Type and limit | Optional? |
| --- | --- | --- | --- |
| Profile name, stamp, footer identity, document title | `snapshot.username` | String, 1–128 | No |
| Profile destination | `snapshot.profile_url` | String, 1–2048; validated HTTPS Letterboxd profile matching the username | No |
| Edition date, date tooltip, stale notice | `snapshot.refreshed_at`; age derived from current time | String, 1–128; valid ISO time with timezone; derived day count has no separate display bound | No |
| Summary counts and progress | `film_count`, `list_count`, `unwatched_count`, displayed counts; watched count derived | Integers 0–9,007,199,254,740,991; progress clamps zero total | No |
| Number of films; visible and matching counts; pagination labels | `snapshot.films`, full-ranking CSV, filters and `visibleLimit` | Array length unbounded; rendered batches 40, plus up to 3 highlighted entries | No |
| Film name, poster fallback, detail title, navigation labels, accessible labels | `film.title` | Nonempty string, 1–1024 | No |
| Film release year / unknown-year copy | `film.year` | String, 0–64 in snapshot; empty or four digits in ranking CSV | Required, may be empty |
| Original title and language | `film.original_title`, `film.original_language` | Strings, 1024 and 64; original language has no code-pattern restriction | Yes |
| Directors, production countries, genres and their filter labels/counts | `film.directors`, `film.countries`, `film.genres`; facet counts derived | Each string up to 512; array lengths unbounded | Directors/countries optional; genres required |
| Synopsis and featured excerpt | `film.overview` | String, 0–20,000 | Required, may be empty |
| Running time and runtime filter | `film.runtime_minutes` | Null or integer 1–9,007,199,254,740,991 | Yes |
| Watched badge, watch-filter membership, status text | `film.watched`; copy selected from fixed strings | Boolean | No |
| List appearances and score meter | `film.liked_in`; highest matching score derived | Integer 0–9,007,199,254,740,991, no greater than snapshot `list_count` | No |
| Overall rank, catalogue number, detail position | Index in full or matching film array | Derived integer; array length unbounded; some rank labels render the raw integer | No |
| Source-list names, destinations and appearance counts | `source_lists` + `film.list_ids`, or legacy `film.lists`; URL slug becomes label | String-array entries ≤512; array lengths unbounded; validated HTTPS Letterboxd list URLs | Either list representation required |
| Film and TMDB external destinations | `film.letterboxd_url`, `film.tmdb_url` | Strings ≤2048; browser safe-host checks; Letterboxd film URL validated | Required, may be empty |
| Posters, fallbacks, preview trigger, poster loading/error status | `film.poster_url`, poster gallery records, selected browser preference | Snapshot URL ≤2048; allowed image hosts; gallery count is unbounded in browser code | Required URL, may be empty; gallery optional |
| Alternate poster language labels and availability | Lazy gallery payload, `tmdb_id` | Gallery label strings have no browser-side length cap; TMDB ID is null or safe nonnegative integer | Yes |
| Shared film URL | Current URL and film identifier | String; no explicit application length limit; rendered in a readonly input | Derived |
| Search text and active facet chips | Input, URL query and selected metadata | Query and selected-value collections unbounded at URL boundary; snapshot-backed labels have limits above | Yes |
| Loading/error/empty copy, retry and expansion labels | Fetch state, result counts, available metadata | Fixed English strings plus derived counts | Conditional |

`letterboxd_title` / `letterboxd_year` support matching and CSV merging rather than separate displayed fields. Backdrop, rating, metadata timestamps and provenance enums are accepted by the snapshot but are not independently rendered by these catalogue views.

## Development harness

Reused the existing fixture selector in `web/dev-data.js` and its localhost gate. Added long, similar-prefix source lists with coherent compact IDs; a real multi-day runtime; short/long and mixed-script credits; long metadata labels; and a clearly identified schema-boundary row. The worst fixture now contains 13 films. The existing fixture assertion now checks the maximum count across all rows, validates the completed snapshot, and verifies source IDs resolve to the expected URLs.

Renamed the Demo button to **Demo data** and moved the neutral switch to the bottom center as required by the skill. No catalogue markup, product styles, data renderer, or product behavior was changed to create or fix a failure. Only the development control's styles changed. Public hosts continue to ignore the data parameter and keep the switch hidden.

The server is left running at [http://127.0.0.1:4173/?data=worst](http://127.0.0.1:4173/?data=worst). States: **Demo data / Worst case / Empty / One / 100,000 rows**. Selection persists in the URL. `&text=200` and `&dir=rtl` retain the project's existing environment diagnostics.

All six fixes are applied. The development toggle and worst-case fixtures remain available for regression checks.
