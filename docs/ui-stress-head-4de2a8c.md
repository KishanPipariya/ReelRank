# ReelRank break-ui audit — HEAD 4de2a8c

**Update: both print findings below are fixed; the verification section records the applied changes.** The original audit and before evidence remain intact.

Fresh read-only audit on 8 November 2026 in GPT-6.1 Sol, using the break-ui skill and its catalog. **The four previous findings are fixed and their regressions pass. Two additional print-text breaks remain.** Product code, fixtures and the localhost toggle were not changed. Only this report and its evidence were added; no commit was created.

## What broke

| # | Severity | Field | Worst-case value / state | Verified failure signature | Proposed fix and location |
| --- | --- | --- | --- | --- | --- |
| 1 | **Broken** | Printed film title, original title, credit and synopsis excerpt | Schema-maximum unbroken title/original title (1,024 characters), director (512); a 20,000-character unbroken synopsis whose printed Reader excerpt is 260 source characters plus an ellipsis | At a 696px printable-layout width, title/credit text runs through the score column and past the page edge in both print formats. Compact title details have **6,805px** of content inside **513px**; Reader title details have **10,055px** inside **513px**. Original-title/credit rows also spill (**4,635/5,296px**). The Reader synopsis excerpt has **1,565px** of content inside **590px**, clipping its tail. The same 1,024-character title wraps correctly in screen details (**349/349px**). Print fields lack emergency wrapping. | Wrap unbroken text and keep text containers bounded, e.g. `min-width: 0; overflow-wrap: anywhere` on print details and synopsis. Review `web/styles.css:1387`, `web/styles.css:1388`, `web/styles.css:1401`, `web/styles.css:1402`, `web/styles.css:1404`. Preserve the repaired score column and complete digits. |
| 2 | **Broken** | Printed selection/search context | A plausible 136-character archive filename pasted into search: `InternationalCinemaPreservationAndRestorationProgramme2026OriginalLanguageRestoredUncutVersionWithEnglishSubtitlesAndCommentaryTrack.mov` | The query matches an archive reference in the fixture's synopsis and returns one film. In both Compact and Reader, the selection summary has **979px** of content inside **696px**. The rightmost query text disappears beyond the printable area, so the printed selection cannot be identified in full. Search input/URL state has no explicit length limit; print context does not wrap an unbroken value. | Allow the context to wrap unbroken tokens at `web/styles.css:1378`. Keep the full query readable rather than silently truncating it or adding a print-only input limit. |

These are print-media layout observations, not physical-printer or PDF pagination claims. The schema-limit strings deliberately exercise accepted maximum values; they are not presented as typical film names. The 136-character search is a plausible pasted archive filename, rather than arbitrary repeated text in an unbounded field.

Evidence: [Compact title overlaps score](ui-stress/head-4de2a8c/print-title-compact.png), [Reader original-title/credit overflow](ui-stress/head-4de2a8c/print-credit-reader.png), [Reader synopsis overflow](ui-stress/head-4de2a8c/print-synopsis-reader.png), [Compact search context](ui-stress/head-4de2a8c/print-query-compact.png), [Reader search context](ui-stress/head-4de2a8c/print-query-reader.png), [measurements](ui-stress/head-4de2a8c/extra-results.json), [schema-valid supplemental snapshot](ui-stress/head-4de2a8c/extra-snapshot.json).

## Decisions for you

- **Print record text:** recommend wrapping complete titles, original titles and credits; allow the existing synopsis excerpt to wrap. Identification should remain possible on paper, where there is no detail disclosure or tooltip.
- **Print selection context:** recommend wrapping the full search/filter values. Preserve the current search contract and the complete numeric score.
- **Very tall printed entries:** page fragmentation may need a separate decision if maximum-length wrapped content exceeds a sheet. That was not tested here and is not an additional verified finding.

## What held up

- All five toggle states pass at **320, 1440 and 2560px**, **720px zoom-equivalent reflow**, **dark 320px**, **200% root text at 320px**, and the **RTL diagnostic at 320px**: **35 combinations**. The catalogue's actual maximum container width remains 1,320px; cards are tested inside that layout. Table overflow remains in its intentional scroller.
- An additional pass clicked all five actual toggle positions against the real local catalogue, without substituting snapshots, at 320, 1440 and 2560px: **15 combinations**, no page overflow or uncaught browser errors. Demo contains 34,509 films; 100,000 rows combines them with 65,491 sparse generated rows. Its initial render remains 42 cards plus a featured film. [Actual-state results](ui-stress/head-4de2a8c/live.json), [Demo 2560](ui-stress/head-4de2a8c/live-demo-2560.png), [Worst case 320](ui-stress/head-4de2a8c/live-worst-320.png).
- **Saved-view capacity:** a 101st name is explicitly refused without changing existing data. Case-insensitive replacement at 100 works, survives reload and can be undone after reload. Delete-then-save also works, across all seven profiles.
- **Poster transitions:** successful selection immediately replaces a fallback in the open details and cached featured film. Reset removes enlargement/cue and retains Browse posters; repeated select/reset works without reload. Featured rank chips remain intact. All seven profiles pass.
- **Printed maximum score:** both formats keep `9,007,199,254,740,991` complete inside the printable layout. The prior score fix holds; the new failures concern separate text fields.
- All earlier regressions pass: readable long-genre hover, visible fallback title, fresh-film scroll reset, full countries and source-list names, future timestamp description, singular download/load-more labels, long year and complete screen score.
- Direct linking to film 99,999 keeps navigation and position. Delayed 6,001-film ranking refresh preserves synopsis DOM, focus and reading scroll. Selecting a genre closes the dialog and applies its filter.
- Alternate-poster failure retains the last working choice, Retry recovers, and superseded/closed requests cannot overwrite the choice. Missing media use a fallback.
- Existing browser checks pass light/dark axe scans, details, no-results recovery, saved preferences, sharing, keyboard/navigation/live announcements, setup/retry and 200%/400% zoom-equivalent reflow. Worst-case mixed scripts, emoji, short/missing metadata and literal markup retain their existing handling.

Current repaired-flow measurements and screenshots: [results](ui-stress/head-4de2a8c/boundary-fixed-measurements.json), [capacity status](ui-stress/head-4de2a8c/boundary-capacity-fixed.png), [immediate poster](ui-stress/head-4de2a8c/boundary-poster-choice-fixed.png), [reset](ui-stress/head-4de2a8c/boundary-poster-reset-fixed.png), [complete print score](ui-stress/head-4de2a8c/boundary-print-compact-fixed.png).

## Rendered values and limits

The [complete catalogue field map](ui-stress-report.md#rendered-value-map) and [saved-view/media/print extension](ui-stress-head-84a137a.md#surface-and-contract-map) remain applicable, with this updated capacity behavior: new saved-view names are limited to **100**, replacement remains allowed, and read/import share the same capacity constant. The supplement's old statement that ordinary Save has no capacity guard is historical and fixed in this HEAD.

Rechecked contracts: username 128; film/original title 1,024; synopsis 20,000; year/language 64; director/country/genre/source-list entries 512; snapshot URL fields 2,048; safe-integer counts/runtime. Film and metadata-array lengths remain unbounded. Full-ranking CSV Title remains unbounded and CSV year is empty or four digits, stricter than snapshot year. Saved-view names are capped at 48 characters. Query/selected-value collections and derived shared URLs remain unbounded at the browser URL boundary. Gallery label strings and preference poster URLs have no explicit character cap beyond their validation shape.

Print uses the same film fields through `web/print-programme.js`: title at line 70, credits built at lines 74–86, score at lines 88–93, and Reader synopsis excerpt at lines 95–104. The excerpt takes up to **260 source characters**, followed by an ellipsis when shortened, even though its source overview allows 20,000. Search context comes from current state/input at lines 23–36. No source contract or rendered field was changed during this audit.

## Validation and limits

| Check | Fresh result |
| --- | --- |
| `npm test` | **27/27 passed** — [log](ui-stress/head-4de2a8c/unit.log) |
| `npm run check:browser` | **Passed** — [log](ui-stress/head-4de2a8c/browser.log) |
| `npm run check:stress` | **Passed**, all 35 combinations, delayed-ranking checks, every previous regression group, new capacity/poster cases in seven profiles and both print score formats — [log](ui-stress/head-4de2a8c/stress.log) |
| Actual local data, five toggles × three widths | **15 combinations passed** |
| Supplemental print text probe | **Two remaining failure groups above**, reproduced in both formats at 696px |
| Product source SHA-256 comparison | **Unchanged** |

The supplemental snapshot passes `validateSnapshot` and is supplied through the same normal snapshot HTTP boundary. Data is spread across three records to distinguish title, credits and synopsis failures. The existing Print selection button builds the real output; only native `window.print` is stubbed. No DOM or CSS modification manufactures a failure. [Reproduction probe](ui-stress/head-4de2a8c/extra-probe.mjs): create `/tmp/reelrank-head-4de2a8c`, then run this module from the repository with the server running. It writes measurements/screenshots there.

All checks are complete; no browser probe is pending. Chrome headless automation was used. Browser-chrome zoom, physical devices, screen readers, other browser engines, live remote-CDN availability, native print dialogs, PDF/physical pagination and very large print-job performance were not tested. Root-text/reflow and touch emulation are not physical-device claims. RTL remains the project's diagnostic rather than full localization support. Supplemental print probes used light print media at 696px; the catalogue and repaired interaction flows also passed dark, enlarged-text and RTL profiles.

The existing server remains running at [Worst case](http://127.0.0.1:4173/?data=worst). The unchanged bottom-center localhost-only toggle retains **Demo data / Worst case / Empty / One / 100,000 rows**, with selection persisted in the URL. The new text probes are retained as HTTP-boundary audit evidence rather than changes to the permanent fixtures.

## Fixes applied — 8 November 2026

| Finding | Applied change | Current location |
| --- | --- | --- |
| 1 | Print text inherits `overflow-wrap: anywhere`; detail and synopsis grid children can shrink within their tracks. Full unbroken titles, original titles, credits and the existing synopsis excerpt wrap instead of spilling. No rendered characters are removed. | `web/styles.css:1374`–1375 |
| 2 | The complete selection/search context inherits the same print wrapping, including the 136-character archive filename. | `web/styles.css:1374`, `web/styles.css:1379` |
| Numeric invariant | Score text explicitly retains normal wrapping, and the repaired content-sized score track is unchanged. | `web/styles.css:1386`, `web/styles.css:1390` |

Added `tests/fixtures/print-boundaries.json`, retaining the validated three-record boundary dataset independently of the audit documentation. New browser regressions in `scripts/ui-print-regressions.mjs:8` run through the normal Print selection button in Compact and Reader, check every title character and the complete original title/director strings, preserve the existing synopsis-excerpt text, and measure each rendered text fragment against its actual column. The complete archive filename remains in selection context and every line fits the printable area. `scripts/ui-stress-scan.mjs:173` runs these checks after all previous regression groups.

After evidence: [Compact full title](ui-stress/head-4de2a8c/fixed/print-text-title-compact-fixed.png), [Reader title](ui-stress/head-4de2a8c/fixed/print-text-title-reader-fixed.png), [Reader original title and credits](ui-stress/head-4de2a8c/fixed/print-text-credit-reader-fixed.png), [complete existing synopsis excerpt](ui-stress/head-4de2a8c/fixed/print-text-synopsis-fixed.png), [Compact query](ui-stress/head-4de2a8c/fixed/print-text-query-compact-fixed.png), [Reader query](ui-stress/head-4de2a8c/fixed/print-text-query-reader-fixed.png), [text-fragment measurements](ui-stress/head-4de2a8c/fixed/print-text-fixed-measurements.json).

The targeted new print checks pass in both formats at a 696px printable-layout width, with full text preserved and no score overlap. Query context now measures **696px content inside 696px**, versus 979px before. **27/27 unit tests pass**, and the full browser/axe/keyboard/setup/sharing/reflow suite passes. All five actual local toggle states pass at 320, 1440 and 2560px (15 combinations), without page overflow or uncaught browser errors. **The complete integrated `npm run check:stress` passes** all 35 toggle/profile combinations, delayed-ranking content/focus/scroll checks, every previous regression group, saved-view and poster transitions across all seven profiles, both maximum-score print checks and the new complete-text checks in both formats. Syntax checks and `git diff --check` pass. No check remains pending.

The development fixtures and localhost-only toggle remain unchanged. No commit was created. Browser print CSS was checked in light print media; native print dialogs, PDF/physical pagination, physical devices, other engines, screen readers and very large print jobs remain outside verification. The existing synopsis excerpt policy is unchanged. The server remains at [Worst case](http://127.0.0.1:4173/?data=worst), with **Demo data / Worst case / Empty / One / 100,000 rows**.

