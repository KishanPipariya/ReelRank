# ReelRank UI invariant audit, 9 November 2026

Baseline is `c4e3157` plus the R3 and R4 work already present. This pass uses six sequential cycles. Each cycle tests the listed scenarios against the unchanged baseline for that cycle, records failures, applies scoped fixes, and reruns the relevant checks. The field and limit map from the [original audit](ui-stress-report.md#rendered-value-map) and [cross-boundary audit](ui-stress-four-cycles-2026-11-08.md#field-and-limit-map) still applies. Inputs enter through the existing localhost toggle, snapshot and ranking responses, imported preferences, or normal controls.

## Coverage matrix

| Cycle | Scenario | Invariant | Existing checks | Planned additional probe |
| --- | --- | --- | --- | --- |
| 1 | Snapshot and ranking CSV with Unicode, quoting, or missing metadata | Producer and browser agree on accepted data and preserve visible title and metadata identity | Snapshot schema and timestamp parity, legacy list provenance, title/year collisions | Round-trip CSV boundary titles and compare the expanded display identity |
| 2 | Multiple filters through Apply, reload, clear and browser history | The same valid constraints select the same films across entry points | Stale facets, canonical source URLs, saved view capacity | Combine filters and probe remaining import normalization differences |
| 3 | Film links and modal dismissal across posters and ledger | The intended film opens and focus returns to a usable control | Duplicate URL-less IDs, Back and Forward opener type | Exercise history and focus across unavailable openers and nested dialogs |
| 4 | Poster media failure and ranking data arriving asynchronously | The newest action wins, and saved and original posters keep their identities | Retry, cancellation, sidecar poster reset | Interleave requests, metadata refresh, poster action and dialog lifecycle |
| 5 | Printing and download while search and ranking are in transition | An output describes the same selection and ordering that it contains | Native and in-app print, text wrapping, max score, debounce | Compare matched result, CSV and print at the transition boundary |
| 6 | Small and wide layouts, 200% text, dark, RTL, and touch | Essential content remains readable and controls stay reachable | Five states across seven stress profiles, axe | Check a composed layout and interaction path at boundary widths and settings |

The existing dev control supplies Demo data, Worst case, Empty, One, and 100,000 rows. The coverage rows are representative combinations of named transitions and boundary values.

## Reproduced failures and fixes

| Cycle | Severity | Boundary value or sequence | Observed failure | Fix location |
| --- | --- | --- | --- | --- |
| 1 | Broken | Sparse CSV titles `  + One` and `'=Installation` | Browser expansion added an apostrophe to the first title and removed one from the second. | Mark new sidecars as using reversible prefix escapes and preserve legacy decoding for multiple leading apostrophes. [Python writer](../src/reelrank/snapshot.py#L155), [browser reader](../web/ranking-csv.js#L59). |
| 2 | Broken | Imported language ` en ` and blank genre, combined with query, duplicate genres, director, blank country, and five-digit decade | Valid saved files applied different constraints than the reloaded URL, changing the result set. | Normalize saved and URL facets with the same rules. [Shared normalization](../web/url-state.js#L6), [saved views](../web/local-preferences.js#L8). |
| 3 | Broken | Keyboard-opened legacy `www` film URL without trailing slash, then canonical sidecar completion | Film position and Next disappeared when the detailed record was replaced by its canonical counterpart. | Share canonical film identity between sidecar merge and navigation, preserve exact link priority, and resolve replacement opener controls. [URL identity](../web/letterboxd-film-url.js#L1), [navigation](../web/film-navigation.js#L38), [focus lookup](../web/app.js#L1487). |
| 3 | Broken | Ledger detail → Browse posters → browser Back | The detail and its URL closed while the poster viewer stayed modal with keyboard focus inside. | Dismiss the nested viewer before restoring the catalogue or switching films. [History restoration](../web/film-navigation.js#L95), [poster dismissal](../web/film-views.js#L258). |
| 4 | Broken | Open director filmography and focus The Third Man, then release ranking sidecar | Refresh closed the filmography and moved focus to the document body. | Retain the disclosure and restore the equivalent film or decade control after refreshing its rows. [Filmography refresh](../web/app.js#L1735). |
| 5 | Broken | Native or in-app print while eight of nine films are available | The output contained eight rows and claimed to be the full catalogue. | Include the loaded catalogue scope for partial unfiltered and filtered prints. [Print context](../web/print-programme.js#L37). |
| 6 | Broken | Dark, RTL, doubled text, Drama and Thriller active, then remove Drama with Enter | The chip disappears and focus moves to the document body. | Move focus to the next or preceding chip, or the filter/search fallback after the final removal. [Chip removal](../web/filter-controls.js#L4). |
| 6 | Ugly | Dark, RTL and doubled text at 320px with the floating Filters shortcut visible | The fixed shortcut covers the right edge of the result count and nearby controls. | Size the rail with the text and reserve clearance where the existing gutter is too narrow. [Catalogue gutter](../web/styles.css#L285), [shortcut](../web/styles.css#L934). |

## Cycle verification

Each cycle passed its targeted probes before the next began. The sixth cycle's visual review caught the floating shortcut overlap and added a geometric assertion before final verification.

1. Python checks cover escaped cells and the new snapshot marker. JavaScript checks cover old and new decoding, repeated apostrophes, whitespace, and comma/emoji titles. The Chromium ledger displays both expanded titles as authored at 320px and 1440px.
2. One composed saved view selects Arrival through Apply and reload. Back restores eight unfiltered films and Forward restores Arrival. Query parameters are compared by meaning, since reload can reorder independent keys.
3. Delayed ranking preserves film position and Next after canonicalization. Back restores the rebuilt ledger opener. Forward and reload reopen the correct film. Back also dismisses the nested poster viewer and returns focus to its film opener.
4. The original filmography summary stays mounted and open while the sidecar loads. The equivalent focused film control remains usable and Enter opens the right detail.
5. Pending native PDF lists eight films and says that eight of nine are loaded. An immediately printed Arrival search lists one film and retains the partial scope. The completed native PDF lists all nine. The linked full CSV contains nine films even while the displayed view is filtered.
6. At 320px and 1440px in combined dark, RTL, 32px root text, reduced motion, and emulated touch, removing Drama focuses Thriller. Removing the last chip focuses search. Back and touch removal preserve the URL state and no horizontal overflow appears. The floating shortcut and its label fit in their own area at both widths.

## Decisions and coverage boundaries

- Historical unmarked CSV has an ambiguous byte sequence for a literal leading apostrophe directly before a formula prefix. Newly written sidecars carry the escape marker and round-trip that value. Previously generated marked or unmarked sidecars remain readable under their own rules.
- Filter normalization keeps valid retired constraints and the spelling of nonblank genre, director, and country values. It strips padding from search and language, removes blank facets, and omits saved decades that cannot round-trip through the four-digit URL format.
- Partial print is immediately available and reports its scope. Full CSV remains an export of the linked ranking independently of the selected filters. The composed probe checks the target bytes in Chromium. The operating system's save dialog was outside this check.
- The fixture probes cover deliberate combinations across the six boundaries. Real-device touch, other browser engines, screen-reader output, browser zoom controls, physical printers, and PDF pagination fidelity remain outside this run. Native Chromium PDF generation and text were checked.

Run `npm run check:invariants` to reproduce all six fixture rows or pass a cycle number, such as `npm run check:invariants -- 3`. Run `npm run check:invariants -- --local` for the actual local toggle matrix. The [dev toggle](http://127.0.0.1:4173/?data=worst) remains available.

[Screenshots, native PDF samples, local measurements, and verification logs](ui-stress/invariant-loop-2026-11-09/).

## Final verification

| Check | Result |
| --- | --- |
| `npm test` | 38 passed |
| `.venv/bin/python -m pytest -q` | 54 passed |
| `npm run check:browser` | Passed, including Chromium, axe, keyboard/history and reflow checks |
| `npm run check:stress` | Passed all 35 combinations and the accumulated regression groups |
| `npm run check:invariants` | Passed all six cycles at 320px and 1440px, 12 combinations |
| `npm run check:invariants -- --local` | Passed all five toggle states at 320px, 1440px, and 2560px, 15 combinations |
| `git diff --check` | Passed |

The actual local demo contained 34,509 films. The 100,000-row fixture still rendered a 43-film first batch. All eight reproduced failures passed their targeted verification in the final state.
