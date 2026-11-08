# ReelRank break-ui audit — HEAD 84a137a

**Update, 8 November 2026: all four findings are fixed; verification is recorded below.** The original audit and before evidence are retained.

Fresh read-only audit on 7 November 2026, performed in GPT-6.1 Sol using the break-ui skill and catalog. The catalogue, details, filters, media, saved views, sharing and print selection were inspected. **Four additional boundary breaks were reproduced.** The earlier seven fixes still pass their regression checks. Product source, development fixtures and toggle are unchanged; this pass adds only this report and evidence.

## What broke

| # | Severity | Field | Worst-case value/state | Verified failure signature and cause | Proposed fix location |
| --- | --- | --- | --- | --- | --- |
| 1 | **Broken** | Saved-view collection and save status | 100 valid saved views, then save `Winter programme — restored films` (33 characters, below the 48-character cap) | At 320 and 1440px, the UI announces `Saved …`, but the new view is absent immediately and after reload. Storage contains 101 entries while the selector retains 100 plus its placeholder. The save path appends without checking the reader's first-100 limit. | Enforce a consistent capacity policy before announcing success in `web/saved-views.js:112`–126 and `web/local-preferences.js:19`. Recommend refusing a new name at capacity with instructions to delete a view; allow replacement of an existing name. |
| 2 | **Broken** | Selected poster / missing-media transition | A schema-valid film with `poster_url: ''`, then select a successfully decoded alternate poster | At 320 and 1440px, the preview and saved preference succeed, but the open details and cached featured film still show their fallback. Reload displays the chosen image. `updatePosterForFilm` only finds existing `img` nodes and cannot replace a fallback with an image. | Reconcile the entire poster region for fallback → image, including its control/label and featured cache, at `web/film-views.js:868`–875. Preserve the existing decode-before-save and request guards. |
| 3 | **Broken** | Reset-poster action and enlargement affordance | After choosing the poster in #2 and reloading, reset to the catalogue's empty original URL | At both widths, the image becomes a fallback but the old `Enlarge poster` button/cue survives. Clicking it opens a blank viewer: no image, no status, disabled zoom. Replacing only the inner image leaves the former image control active. | Rebuild the poster wrapper as the noninteractive missing-image state in `web/film-views.js:875`; share construction with `web/film-views.js:420`–442. Add a useful no-image state or guard at `web/film-views.js:129`–152 as a secondary defense. Keep Browse posters available. |
| 4 | **Broken** | Printed list-appearance count | Accepted schema maximum `9,007,199,254,740,991`, already in Worst case | In both Compact and Reader print CSS, the number measures 151px inside a fixed 118px score column. At a 696px printable-layout viewport it ends at x=729, 33px beyond the layout, and its final digits are clipped in the captured row. This is print-media layout evidence, not a physical-printer or PDF pagination test. | Give the complete number sufficient space, or place it on a separate row in `web/styles.css:1385`, `web/styles.css:1389`–1390; keep every digit. Reader inherits the same column. |

Evidence: [saved-view status](ui-stress/head-84a137a/preset-limit-320.png), [stale detail fallback](ui-stress/head-84a137a/poster-detail-stale-1440.png), [stale featured fallback](ui-stress/head-84a137a/poster-featured-stale-1440.png), [blank reset viewer](ui-stress/head-84a137a/reset-empty-viewer-1440.png), [Compact print clipping](ui-stress/head-84a137a/print-compact-score.png), [Reader print clipping](ui-stress/head-84a137a/print-reader-score.png). Both mobile and desktop state screenshots are retained in the evidence directory. [Measured states and geometry](ui-stress/head-84a137a/boundaries.json) record the stored URL, counts, reload outcome, hidden-image/status state and print widths.

## Decisions for you

- **Saved-view capacity:** recommend an explicit 100-view limit that refuses additional names, rather than silently losing a newly saved view or deleting an existing view. Replacement can remain available at capacity.
- **Print score:** recommend moving unusually wide scores onto their own row. A documented tighter domain maximum is another option, but must agree with both snapshot schemas and existing data.
- **Missing posters:** recommend keeping a noninteractive fallback with Browse posters. Enlargement should only be offered when an image is available.

## What held up

- All five actual toggle states passed the seven existing profiles: 320, 1440 and 2560px; 720px zoom-equivalent reflow; dark 320px; 200% root text at 320px; RTL diagnostic at 320px. **35 combinations passed.** The intentional table scroller remains separate from the page; no horizontal page overflow was detected.
- A separate pass clicked all five toggle states against the actual local catalogue without substituting snapshots, each at 320, 1440 and 2560px: **15 combinations**, no page overflow or uncaught browser errors. Demo contains 34,509 films. The 100,000 state adds 65,491 sparse generated rows and initially renders 42 cards plus the featured film. Settled 100,000-row results took about 3.3 seconds in this one run; this is not a device benchmark. [Results](ui-stress/head-84a137a/live-toggle-results.json), [Demo 320](ui-stress/head-84a137a/live-demo-320.png), [Demo 1440](ui-stress/head-84a137a/live-demo-1440.png), [Worst case 2560](ui-stress/head-84a137a/live-worst-2560.png).
- The complete screen score, long year, wrapped source-list names and countries, compact card genres with full detail text, fallback title, singular labels, safe text rendering, mixed scripts and emoji remain intact under the stress profiles. The print-specific numeric break is separate from the repaired screen score.
- Direct navigation to film 99,999 works. A delayed 6,001-film ranking refresh preserves synopsis content, keyboard focus and reading position. Changing films resets the dialog to its top; selecting a genre closes it and filters results.
- The previous alternate-poster failure/retry, successful decode, superseded request and close-during-request regressions pass. Findings #2–3 concern transitions between missing and present images that those checks did not cover.
- Existing browser checks pass light/dark axe scans, details, no-results recovery, sharing, saved preferences, keyboard navigation and live announcements, setup/retry, and 200%/400% zoom-equivalent reflow. Passing baseline checks do not cover the 101st saved view or the new missing-poster transition probes.

## Surface and contract map

The [complete catalogue rendered-value map](ui-stress-report.md#rendered-value-map) remains applicable. Rechecked limits: username 128; titles/original titles 1,024; synopsis 20,000; year/language 64; director/country/genre/source-list entries 512; URL fields 2,048; counts/runtime up to the JavaScript safe-integer maximum. Film and metadata-array lengths are unbounded. Full-ranking CSV Title remains unbounded and its year requires four digits or empty, whereas snapshot year permits 64 characters.

This pass extends that map to the boundary flows above:

| Rendered value | Source / boundary | Type / limit | Optional? |
| --- | --- | --- | --- |
| Saved-view name and save/delete/undo status | `#preset-name`, preferences, import | String ≤48 in form and preference validator | Empty rejected on save |
| Saved-view options and export/import counts | `preferences.presets` | Reader/import retain 100; normal save has no capacity check (finding #1) | Yes |
| Captured search, filter, sort and layout labels | Preset state and URL; `capturePresetState()` | Fixed enums; query and facet collections unbounded; metadata limits as above | Defaults when absent |
| Selected poster, Reset poster state and status | `preferences.posterChoices`, current/original film URL | String with allowed TMDB image URL shape; no explicit preference URL length cap; snapshot URL ≤2,048 | Empty original supported |
| Gallery preview, image failure/retry and saving feedback | Gallery HTTP records, image decode, local storage write | Conditional fixed copy plus film title/year and gallery language | Gallery and original image optional |
| Enlarged poster title, caption and zoom label | Current film and image state | Film limits above; fixed zoom labels | Image may be unavailable |
| Print title, edition, selection summary and chapter heading | Current username/date, filter/search state, grouping | Snapshot limits above; selection query unbounded | Conditional selection labels |
| Print film number/title/credits/runtime/score/synopsis | Matching film array in `web/print-programme.js` | Same film limits above; full matching array is printed, rather than only visible batch | Missing metadata omitted |

Unbounded fields remain contract observations, not additional visual failures without reproduced breakage. No account, email, currency, avatar or localized-label catalog cases apply to this app's current surface.

## Validation and limits

| Check | Result |
| --- | --- |
| `npm test` | **27/27 passed** |
| `npm run check:stress` | **Passed**, all 35 combinations, delayed ranking/navigation and all seven previous-fix regressions |
| `npm run check:browser` | **Passed**, including axe, keyboard/focus, setup and reflow checks |
| Actual local data, five toggle states × three widths | **Passed**, 15 combinations |
| Additional collection/media state probes | Findings #1–3 reproduced at 320 and 1440px |
| Print media, Compact and Reader | Finding #4 reproduced at 696px printable-layout width |
| Product source SHA-256 comparison | **Unchanged** |

The additional cases enter through normal HTTP snapshot/gallery boundaries and local preference storage. The one-film poster snapshot passes `validateSnapshot`. A deterministic, successfully decoded SVG response supplies the alternate image; no DOM/CSS edits manufacture these failures. For print, only native `window.print` was stubbed so the normal Print selection handler could prepare its markup. A [reproduction probe](ui-stress/head-84a137a/boundary-probe.mjs) is retained; create `/tmp/reelrank-head-84a137a` and run it from the repository with the server running. It writes screenshots and measurements to that temporary directory.

Chrome headless automation was used. Physical devices, other browser engines, a screen reader, browser-chrome zoom, actual print dialogs, PDF output and physical pagination were not operated. RTL is the existing diagnostic, not a claim of full localization support. Remote poster/CDN availability was not a live-service audit. Additional boundary probes were tested in light mode at the widths stated; the base toggle matrix also covers dark/large-text/RTL. No browser probe is pending. The sandboxed browser rerun could not launch Chromium; rerunning the existing suite with the required execution permission completed successfully.

The local server remains running at [Worst case](http://127.0.0.1:4173/?data=worst). The unchanged bottom-center localhost-only toggle has **Demo data / Worst case / Empty / One / 100,000 rows**; selection persists in the URL. Finding #4 is accessible from Worst case → Catalogue tools → Share, export & print → Print selection. Findings #1–3 require the documented stored-data/API boundary scenarios, rather than extra permanent toggle positions.

## Fixes applied — 8 November 2026

| Finding | Applied fix | Current implementation |
| --- | --- | --- |
| 1 | Refuse new names at 100 views with an actionable message and focus on the name field; case-insensitive replacement still works. Preserve existing views, allow delete-then-save and persistent Undo. A shared constant keeps read/import/save limits consistent. | `web/saved-views.js:112`, `web/local-preferences.js:1`, `web/local-preferences.js:21`, `web/local-preferences.js:82` |
| 2 | Reconcile the whole media region when a poster changes. The open detail and cached featured link display a successful replacement immediately, including fallback → image. Retain featured rank/watched badges, responsive attributes and image error fallback. Update details only for the affected film. | `web/film-views.js:409`, `web/film-views.js:729`, `web/film-views.js:872` |
| 3 | Reuse the detail poster constructor on reset, replacing the image button with a noninteractive fallback and removing its Enlarge cue. Browse posters remains available and works through repeated select/reset cycles without reloading. | `web/film-views.js:409`, `web/film-views.js:882` |
| 4 | Let the print score track grow to its content width instead of fixing it at 118px. Compact and Reader preserve the complete number inside the printable layout. | `web/styles.css:1385` |

New regression coverage in `scripts/ui-boundary-regressions.mjs:6`, called from `scripts/ui-stress-scan.mjs:171`, checks all seven existing layout/environment profiles. It tests rejected-save preservation, case-insensitive replacement at capacity, persistence/reload Undo, delete-then-save, immediate poster visibility in details and featured content, reset without enlargement, Browse after reset, repeated transitions and preserved rank chips. Both print formats exercise the exact schema maximum through the normal Print selection button with only the native print dialog stubbed.

After evidence: [capacity message](ui-stress/head-84a137a/fixed/boundary-capacity-fixed.png), [immediate poster choice](ui-stress/head-84a137a/fixed/boundary-poster-choice-fixed.png), [reset fallback and Browse](ui-stress/head-84a137a/fixed/boundary-poster-reset-fixed.png), [Compact full number](ui-stress/head-84a137a/fixed/boundary-print-compact-fixed.png), [Reader full number](ui-stress/head-84a137a/fixed/boundary-print-reader-fixed.png), [measured results](ui-stress/head-84a137a/fixed/boundary-fixed-measurements.json).

Validation: **27/27 unit tests pass**; the full existing browser/axe/keyboard/setup/sharing/reflow suite passes. The standalone new boundary regressions pass all seven profiles and both print formats. The actual local catalogue passes all five toggle states at 320, 1440 and 2560px (15 combinations), with no horizontal page overflow or uncaught browser errors. **The complete integrated `npm run check:stress` passes**: all 35 toggle/profile combinations, delayed-ranking content/focus/scroll checks, all seven previous-fix regressions, the new boundary scenarios in all seven profiles, and both print formats. `git diff --check` and syntax checks pass. No verification process remains pending.

The browser regression harness checks native details-panel open state before clicking, including panels restored open by Chrome after reload. The final integrated run completed successfully.

The development fixture/toggle are preserved. No commit was created. Physical devices, other engines, screen readers, actual print dialogs and physical/PDF pagination remain outside this verification. The local server remains at [Worst case](http://127.0.0.1:4173/?data=worst), with **Demo data / Worst case / Empty / One / 100,000 rows**.

