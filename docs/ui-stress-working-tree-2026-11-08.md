# ReelRank break-ui audit — current working tree, 8 November 2026

Performed in GPT-6.1 Sol using the break-ui skill. This audits the **working tree based on HEAD `4de2a8c`, including the uncommitted print-text fixes**, not only committed source. All earlier fixes pass their existing checks. **Three additional failures remain.** No product code, test source, development fixture or toggle was modified in this pass; only this fresh report and evidence were added. No commit was created.

## What broke

| # | Severity | Field / environment | Worst-case value | Verified failure signature | Proposed fix and location |
| --- | --- | --- | --- | --- | --- |
| 1 | **Broken** | Exported synopsis / catalogue loading | A 20,001-character ASCII archive description; declared overview maximum is 20,000 | The real Python `validate_snapshot` accepts it and `write_snapshot` writes the catalogue. Loading that actual output at 320 and 1440px hides the entire catalogue and shows the unsupported-format setup screen. Browser validation reports `snapshot.films[0].overview exceeds the supported text length`. Python's recursive schema validator implements `minLength` and `pattern` but omits `maxLength`; this is an enforcement gap beyond the single overview example. | Enforce declared `maxLength` during Python validation at `src/reelrank/snapshot.py:194`, before export via `src/reelrank/snapshot.py:470`. Test overflow at string and string-array boundaries, and writer rejection. Keep the frontend guard. |
| 2 | **Broken** | Unicode synopsis / browser length measurement | Exactly 20,000 Unicode code points: 19,999 ordinary text characters plus one `🎬`; this occupies 20,001 UTF-16 code units | Python accepts and writes it, but the browser rejects it at both widths with the same setup failure. A control synopsis with 20,000 ASCII characters loads correctly. Browser `.length` counts the emoji as two units, so content at the declared character boundary is rejected. | Measure snapshot string lengths consistently by Unicode code point in `web/snapshot.js:30`–31, matching Python `len`. Add parity cases at the boundary and one code point over it; preserve emoji rather than removing them or silently shortening the field. |
| 3 | **Broken** | Printed film titles under a dark system preference | Ordinary titles such as `The Third Man`, Compact and Reader at a 696px printable-layout width | All eight film titles become pale on the light print background. Measured foreground is `rgb(236, 236, 226)` against `rgb(253, 251, 247)`: **1.15:1 contrast**. Light preference renders the same titles at **15.02:1**. The print title rule uses the screen `--ink`, which dark mode makes pale; the print background stays light. | Give print titles a stable dark print ink, or override `--ink` in the print scope, at `web/styles.css:1388`. The dark variable originates at `web/styles.css:1192`; preserve screen dark mode and the repaired print score/text geometry. |

Evidence: [over-limit export, 320px](ui-stress/working-tree-2026-11-08/contract-ascii-overflow-320.png), [Unicode boundary, 320px](ui-stress/working-tree-2026-11-08/contract-unicode-boundary-320.png), [Unicode boundary, 1440px](ui-stress/working-tree-2026-11-08/contract-unicode-boundary-1440.png), [Python acceptance and actual-write measurements](ui-stress/working-tree-2026-11-08/contract-python.json), [browser outcomes](ui-stress/working-tree-2026-11-08/contract-browser.json). Full exported snapshots are retained under the three contract-case directories.

Print comparison: [Compact dark preference](ui-stress/working-tree-2026-11-08/print-compact-dark.png), [Compact light preference](ui-stress/working-tree-2026-11-08/print-compact-light.png), [Reader dark preference](ui-stress/working-tree-2026-11-08/print-reader-dark.png), [Reader light preference](ui-stress/working-tree-2026-11-08/print-reader-light.png), [per-title colors and contrast](ui-stress/working-tree-2026-11-08/theme-results.json).

The overflow description exercises the maximum the producer currently accepts: Python does not enforce the declared ceiling. The Unicode case stays within that declared code-point boundary. Neither failure is created by editing markup or CSS. The dark-print failure uses normal existing demo titles, without extreme text.

## Decisions for you

- **Over-limit source metadata:** recommend rejecting it during export validation with the field path and limit, before replacing the catalogue. If clipping imported metadata is desired, make that an explicit ingestion policy rather than letting exporter and browser disagree.
- **Character counting:** recommend Unicode code points consistently across the two validators. Keep complete emoji and the existing declared limits.
- **Print theme:** recommend readable dark ink on the existing light print surface regardless of the user's screen theme.

## What held up

- **Latest print-text repairs:** complete unbroken titles, original titles, credits and existing Reader synopsis excerpts wrap within their columns. The 136-character archive-filename query stays complete and fits. Regression checks compare retained text and individual text-fragment bounds, not only element widths.
- **Numeric print repair:** both formats keep every digit of `9,007,199,254,740,991` inside the content-sized score column. The new text wrapping does not split the numeric score or overlap it.
- **Saved views:** capacity refusal at 100 preserves existing data; case-insensitive replacement works, survives reload and can be undone after reload. Delete-then-save remains available in all seven profiles.
- **Poster changes:** choosing a working image replaces a missing-image fallback immediately in details and featured content. Reset removes enlargement and keeps Browse posters; repeated transitions work without reload. Failed previews retain the last working choice, Retry recovers, and superseded/closed requests cannot overwrite the choice.
- **All five development states:** Demo data, Worst case, Empty, One and 100,000 rows pass the seven existing profiles: 320/1440/2560px, 720px reflow, dark 320px, 200% root text at 320px and RTL diagnostic at 320px. **35 combinations pass**, with no unintended horizontal page overflow.
- A separate pass clicked the actual five toggle positions against the real local data at 320, 1440 and 2560px: **15 combinations**, no uncaught browser errors or page overflow. Demo contains 34,509 films; the large state adds 65,491 sparse rows and initially renders 42 cards plus the featured film. [Results](ui-stress/working-tree-2026-11-08/live.json).
- Shared film 99,999 retains navigation/position. The delayed 6,001-film ranking refresh preserves synopsis DOM, focus and reading scroll. Changing film resets the dialog; choosing a genre closes it and filters results.
- Earlier long-year, wrapped country/source-list, readable genre-hover, visible fallback-title, future-date and singular-label regressions remain intact. Short/missing fields, mixed scripts, emoji in ordinary-length text, literal markup and the multi-day runtime retain their existing handling.
- Existing browser checks pass normal light/dark catalogue accessibility, details, no-results recovery, sharing, saved preferences, keyboard navigation/live announcements, setup/retry and 200%/400% zoom-equivalent reflow. Their screen-theme checks do not inspect the dark-preference printed titles in finding 3.

Current print-text and score measurements are retained in [print-text results](ui-stress/working-tree-2026-11-08/print-text-fixed-measurements.json) and [boundary results](ui-stress/working-tree-2026-11-08/boundary-fixed-measurements.json).

## Rendered-value and limit map

Use the [complete catalogue map](ui-stress-report.md#rendered-value-map), [saved-view/media/print extension](ui-stress-head-84a137a.md#surface-and-contract-map) and [current print-field mapping](ui-stress-head-4de2a8c.md#rendered-values-and-limits), with these explicit enforcement corrections:

| Boundary | Declared or actual limit |
| --- | --- |
| Snapshot schema strings | Username 128; titles/original titles 1,024; overview 20,000; year/language 64; director/country/genre/source-list entries 512; URL fields 2,048 |
| Python snapshot validation/export | **Declared `maxLength` is not enforced** by the recursive validator. Other type, minimum-length, pattern, URL and consistency checks still apply. The previous maps' string maxima describe the schema, not a verified producer ceiling. |
| Browser snapshot validation | Enforces those numeric ceilings using **UTF-16 code units**, causing finding 2 for non-BMP text. |
| Numeric snapshot fields | Safe-integer maxima remain enforced; runtime is positive or null. |
| Collections | Film/metadata arrays remain unbounded in the schema; screen film rendering uses batches. |
| Ranking CSV | Title remains unbounded; year is four digits or empty, stricter than snapshot year. |
| Saved views | 100 entries; names 48 UTF-16 units in the form/preference guard; replacements remain possible at capacity. |
| Query/shared state | No explicit query length or selected-value collection cap at the browser URL boundary. |
| Print text | Same film sources/limits; Reader keeps its existing excerpt of up to 260 source characters plus an ellipsis when shortened. |
| Themes/media | OS color-scheme preference supplies screen tokens; print currently fixes its surface but leaks the dark title token. |

The map covers counts, list length, dates, labels/statuses, links, poster fallbacks/loading, query state and print-derived fields through the linked source tables. No new field was introduced. Email, avatar, currency and account-permission catalog cases do not apply to this surface.

## Fresh verification and limits

| Check | Result |
| --- | --- |
| `npm test` | **27/27 passed** — [log](ui-stress/working-tree-2026-11-08/unit.log) |
| `npm run check:browser` | **Passed** — [log](ui-stress/working-tree-2026-11-08/browser.log) |
| `npm run check:stress` | **Passed**: 35 state/profile combinations, delayed ranking, every previous regression group, saved-view/poster boundaries, maximum-score print and complete-text print checks — [log](ui-stress/working-tree-2026-11-08/stress.log) |
| Real local catalogue / toggle | **15 combinations passed** |
| Real Python validation + `write_snapshot` | Wrote all three control/edge cases; producer/browser mismatches verified |
| Exported-snapshot browser probes | Six runs: ASCII control, ASCII overflow and Unicode boundary at 320 and 1440px |
| Theme print probes | Four runs: Compact/Reader × light/dark, eight titles measured per run |
| Audit source integrity | Product SHA-256 unchanged; starting and ending tracked working-tree patches identical |

The contract probes execute the real Python validator/writer and then supply its written JSON through the normal HTTP snapshot boundary. The print probes run the normal Print selection button; only native `window.print` is stubbed. No product/style/DOM mutation was used to cause a failure. The baseline pending print fixes are captured in [the starting working-tree patch](ui-stress/working-tree-2026-11-08/starting-working-tree.patch); the audit did not revert or change them.

Reproduction tools: [Python contract writer](ui-stress/working-tree-2026-11-08/contracts.py), [browser contract probe](ui-stress/working-tree-2026-11-08/contracts.mjs), [light/dark print probe](ui-stress/working-tree-2026-11-08/themes.mjs). Create `/tmp/reelrank-working-audit`; run the Python script with the repository's `.venv/bin/python` from the repository, then the browser modules with Node while the local server is running. Output stays under that temporary directory.

No check is pending. Chrome headless automation was used; root-font/reflow and touch emulation are not physical-device or browser-chrome zoom claims. Physical devices, screen readers, other engines, native print dialogs, PDF/physical pagination and large print-job performance remain untested. Dark-preference print is verified in browser print media, not physical output. The full Python unit suite was not run; actual validator/exporter probes are the producer evidence here. Existing tests passing does not cover these three additional failure paths.

The server remains running at [Worst case](http://127.0.0.1:4173/?data=worst). The unchanged bottom-center localhost-only toggle offers **Demo data / Worst case / Empty / One / 100,000 rows** and persists selection in the URL. Dark printing can be reached through Catalogue tools → Share, export & print → Print selection with a dark system preference. The producer/Unicode cases are retained as exported-data evidence rather than edits to permanent fixtures.

Say `fix all` or `fix 1, 3` and I'll apply them.
