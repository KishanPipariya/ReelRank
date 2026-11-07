# ReelRank: fresh break-ui audit — 7 November 2026

**Update: all seven findings below are now fixed and verified.** The original audit and before evidence remain below for comparison.

## Fixes applied and verified

| Finding | Applied change | Current implementation |
| --- | --- | --- |
| 1 | Long genre hover now keeps a readable foreground on its transparent background. Measured contrast improved to **5.78:1 light** and **7.55:1 dark**. | `web/styles.css:890` |
| 2 | Poster replacements must decode before they are shown and saved. A failure retains the working preview and stored choice, explains the failure, and offers Retry. Failed thumbnails show a text fallback. Superseded requests and requests completed after closing the viewer cannot save. Reopening uses the current poster choice. | `web/film-views.js:82`, `web/film-views.js:129`, `web/film-views.js:207`; `web/index.html:434`; `web/styles.css:863` |
| 3 | Opening a new film resets the dialog to the beginning. Source-list focus remains explicit, and background ranking refresh still preserves reading position. | `web/film-views.js:327` |
| 4 | Fallback titles cannot shrink away; secondary cover metadata is clamped to two lines. Compact detail covers have smaller internal spacing. The 320px title now measures **35px high**, versus 0px in the audit. Full metadata remains in film details and the secondary cover tooltip. | `web/styles.css:720`, `web/styles.css:722`; `web/film-components.js:111` |
| 5 | Both download branches and the final load-more batch use a singular noun when the count is one. | `web/app.js:1961`, `web/app.js:2040`, `web/app.js:2044` |
| 6 | Full country names wrap in the details context. | `web/styles.css:880` |
| 7 | Future edition dates have an explicit future-timestamp description. Present, past, and invalid timestamps retain their existing behavior. The formatter is shared with deterministic unit tests. | `web/edition-freshness.js:3`; `web/app.js:2092` |

Verification completed:

- `npm test`: **27/27 passed**, including new future/present/past/invalid timestamp checks.
- `npm run check:browser`: **passed**, including normal light/dark axe, keyboard/focus, sharing, preferences, setup/retry, and narrow/200%/400% reflow scenarios. Poster persistence checks now await image-load confirmation.
- `npm run check:stress`: **passed**. All five toggle states passed across seven profiles (**35 combinations**), alongside the existing shared-film and delayed-ranking checks.
- The stress scan now invokes `scripts/ui-stress-regressions.mjs`: fallback-title visibility, new-film scroll reset, country wrapping, future-date descriptions, and singular download wording pass across all seven profiles. Hover contrast passes in both themes. The last single-film batch and full-ranking singleton download also pass.
- Gallery checks prove that a failed replacement leaves the working choice intact, Retry can recover, late responses cannot replace a newer selection, and closing a viewer prevents an in-flight selection from saving.
- All five actual local-catalogue states passed at 320, 1440, and 2560px (**15 additional combinations**), with no uncaught browser errors or horizontal page overflow.
- `git diff --check`: clean. No verification remains pending.

After evidence: [readable hover](ui-stress/retest-hover-light-fixed.png), [dark hover](ui-stress/retest-hover-dark-fixed.png), [retained poster with Retry](ui-stress/retest-poster-error-fixed.png), [new film starts at the beginning](ui-stress/retest-reopen-fixed.png), [visible fallback title](ui-stress/retest-fallback-fixed.png), [full country name](ui-stress/retest-country-fixed.png), [regression measurements](ui-stress/retest-fixed-measurements.json), [actual-catalogue results](ui-stress/retest-live-after-fixes.json).

The development fixtures and localhost-only toggle are retained. No snapshot limits changed. Chrome automation was used; physical devices, other browser engines, native browser zoom controls, and a screen reader remain untested.

## Original read-only audit

The findings and code locations below describe the pre-fix revision.

Performed in GPT-6.1 Sol after the previous fixes. This was a read-only product audit: the development fixtures and toggle were reused, extra values entered through HTTP snapshot/gallery stubs, and no product code was changed. Source hashes for all `web/*.js`, CSS, HTML, and the snapshot schema were unchanged before and after the pass.

## What broke

These numbers identify the **fresh audit findings**, separate from the original six. The ordinary regression scenarios pass; the failures below occur in additional states those checks do not assert.

| # | Severity | Field / state | Worst-case value | What happens | Proposed fix location |
| --- | --- | --- | --- | --- | --- |
| 1 | **Broken** | Long genre, hovered and unselected | The existing 512-character schema-boundary genre | Hover text becomes cream on the light surface and near-black on the dark surface, making it effectively unreadable. Measured contrast is **1.03:1** in light and **1.04:1** in dark mode. The generic hover rule changes the foreground, while the long-label rule keeps its background transparent. | Pair hover foreground/background colors, or explicitly retain a readable foreground for this plain-text variant. `web/styles.css:786`, `web/styles.css:883`. |
| 2 | **Broken** | Alternate-poster load failure | Gallery record `/reelrank-audit-failed-poster.jpg`, with its image request failing | The preview and thumbnails show broken images. Selecting the failed image still writes its URL to `posterChoices[421017]` and announces **“Poster choice saved on this device.”** There is no image-load error status or recovery for the preview. | Load/decode successfully before persisting; retain the previous choice on failure; mark failed options unavailable and show a useful error/fallback. `web/film-views.js:150`, `web/film-views.js:158`, `web/film-views.js:168`. |
| 3 | **Ugly** | Opening a different film after scrolling | Read the 20,000-character synopsis in the existing Long Journey fixture, scroll to its end, close it, then open Harakiri | The new film inherits the old dialog's scroll position. At 320px, the old position was 18,214px; the new film opened at scrollTop **1,101px**, with its title at **−490px** above the viewport. It begins mid-synopsis and source links. | Reset dialog scroll for a newly opened film, while preserving the existing background-refresh behavior and explicit source-list focus option. `web/film-views.js:252`. |
| 4 | **Ugly** | Missing-poster fallback metadata | Existing schema-boundary row: 512-character director plus long year | Secondary metadata consumes the fallback's fixed poster area and collapses its title to **0px height**. In the 320px details view, the fallback is 228px tall but the metadata alone is 864px tall; only a clipped wall of credit text remains. Also reproduced in desktop details and 720px cards. The separate film heading is still readable. | Clamp secondary cover metadata, stop it from taking the title's space, and retain full credits in the adjacent details. `web/film-components.js:108`, `web/styles.css:716`, `web/styles.css:721`. |
| 5 | **Ugly** | Singular secondary button labels | One film; one film remaining after a 40-row page | The summary and scope are now correct, but buttons still say **“Download displayed 1 films (CSV)”** and **“Show 1 more films · 1 left.”** The full-ranking download branch has the same plural template. | Apply count-aware nouns to these remaining labels. `web/app.js:1978`, `web/app.js:2056`, `web/app.js:2060`. |
| 6 | **Ugly** | Full country name in film details | `United Kingdom of Great Britain and Northern Ireland` | At 320px, the 293px label is clipped inside a 246px control. It has no native title or detail-local full-name reveal. Applying the country filter exposes the full name in a chip, but reading the value requires changing the catalogue view. | Let the primary country wrap in the details context; compact card metadata can keep its own treatment. `web/styles.css:739`, `web/styles.css:876`; button creation at `web/app.js:1278`. |
| 7 | **Fragile** | Future edition timestamp | A valid ISO timestamp three days ahead: 10 November 2026 during this audit | The visible date is correct, but its native-title string says **“Updated just now”**. Future elapsed time is clamped to zero, concealing the timestamp discrepancy. The stale notice correctly remains hidden. | Describe a future timestamp explicitly, or handle a documented clock-skew tolerance before formatting relative time. `web/app.js:872`. |

Evidence: [hover, light](ui-stress/retest-genre-hover-light.png), [hover, dark](ui-stress/retest-genre-hover-dark.png), [failed poster saved](ui-stress/retest-gallery-failure.png), [new film opens below its title](ui-stress/retest-reopen-scroll.png), [fallback title disappears](ui-stress/retest-fallback-title.png), [download wording](ui-stress/retest-singular-download.png), [one remaining film](ui-stress/retest-singular-more.png), [country clipping](ui-stress/retest-country.png).

Exact geometry, colors, persisted poster URL, date strings, and live-catalogue results are retained in [measurements](ui-stress/retest-measurements.json). The future-date tooltip was checked through its actual DOM `title` value; a native browser tooltip popup was not captured.

## Decisions for you

- **Long genre hover:** recommend keeping the plain-text treatment and giving it an explicit readable hover color in each theme.
- **Failed posters:** recommend preserving the last working choice until a replacement loads successfully, with a failed-preview message and an available Retry action.
- **Fallback cover:** recommend clamping secondary credits to two lines and keeping the film title visible. Complete credits already have a dedicated place in film details.
- **Country names:** recommend wrapping their full values in details, where identifying metadata should be readable without applying a filter.

## What held up

- All five actual data-toggle states work across the seven existing stress profiles: 320, 1440 and 2560px; 720px reflow; dark 320px; 200% root text at 320px; and the RTL diagnostic at 320px. **35 state/layout combinations passed.**
- A separate pass used the actual local catalogue without substituting snapshots. Demo, Worst case, Empty, One and 100,000 rows were each inspected at 320, 1440 and 2560px: **15 additional combinations**. The real demo contains 34,509 films; the large fixture combines those with 65,491 generated sparse rows. No horizontal page overflow or uncaught browser errors occurred.
- The large catalogue remains paginated: 42 cards plus the featured film initially. The actual 100,000-row state reached settled results in about 3.7 seconds in one local run; this is not a device performance guarantee.
- A direct link to film 99,999 retains usable Previous/Next navigation and the complete formatted position. A delayed 6,001-film ranking refresh preserves synopsis content, scroll position, and keyboard focus. Selecting a genre closes the dialog and applies the filter.
- The repaired long-year row, complete numeric score, wrapped source-list names, compact card genre label, primary singular summary, empty recovery, and unknown optional metadata remain intact.
- An additional **1,024-character original title** and a **64-character private-use language tag** fit the detail dialog at every audited profile. The code `fr-Latn-FR-x-archive-restore-print-english-subtitle-edition-2026` wraps without horizontal overflow.
- CJK, Arabic, Vietnamese diacritics, emoji, literal markup, zero counts, and the 5,220-minute multi-day runtime continue to render safely.
- Epoch and timezone-crossing edition dates render as absolute dates and expose the older-edition notice appropriately. `2025-12-31T23:30:00-08:00` displays as 1 January 2026 in the browser's local timezone.
- The complete existing browser suite passes: normal light/dark accessibility, keyboard and focus behavior, sharing, saved preferences, setup/retry, and 200%/400% zoom-equivalent reflow. Its success does not cover the unselected long-genre hover in finding 1.

## Fresh verification results

| Check | Result |
| --- | --- |
| `npm test` | **25/25 passed** |
| `npm run check:browser` | **Passed** |
| `npm run check:stress` | **Passed**, all 35 combinations plus delayed-ranking/navigation assertions |
| Actual local snapshot, all five toggles at three widths | **Passed**, 15 combinations |
| Additional field/error/state probes | Seven remaining findings above; measurements and screenshots saved |
| Product source hash comparison | **Unchanged** |

The shared snapshot limits remain the same: titles/original titles 1,024; synopsis 20,000; year and language 64; director/country/genre/source-list strings 512; URL fields 2,048; safe-integer numeric bounds. Film and metadata-array lengths are unbounded. The original field map remains in [the first report](ui-stress-report.md#rendered-value-map). One qualification from source inspection: the full-ranking CSV reader has no character cap for its Title field, and its year rule is stricter than the snapshot's. The original-title/language/country extension was validated by the shared snapshot validator before entering the normal fetch boundary; its [fixture](ui-stress/retest-extended-snapshot.json) is preserved.

No probe remains unresolved. Chrome automation was used; browser chrome zoom, physical devices, other browser engines, and a screen reader were not operated. RTL is the project's existing diagnostic, not a claim of complete localized RTL support. Extra gallery failures and timestamp cases used HTTP stubs rather than changing checked-in catalogue files.

The existing server is left running at [http://127.0.0.1:4173/?data=worst](http://127.0.0.1:4173/?data=worst). The bottom-center, localhost-only toggle retains **Demo data / Worst case / Empty / One / 100,000 rows**. The common fixture reproduces findings 1, 3 and 4; One exposes the download label in finding 5. Only the report and evidence were added in this audit.

All seven findings have been fixed; the retained fixtures and expanded stress checks cover them for future changes.
