# ReelRank UI stress audit, 9 November 2026

Four audit, fix, and verification cycles from `c4e3157` with the prior uncommitted R3 fixes preserved as the baseline. The lead and independent read-only auditor used the existing localhost toggle and supplied additional cases through snapshot, imported preferences, and normal interaction boundaries. Each finding was reproduced and recorded before editing. The final suite rerun verifies the four cycles together.

## Iteration 1 · Symbol-only search

| Severity | Field and worst case | Reproduced failure | Fix |
| --- | --- | --- | --- |
| Broken | Search query `🦊` with one title containing it in the 13-film Worst case fixture | Results and live announcement reported 13 matches at 320px and 1440px. Token normalization reduced the query to an empty string. | A nonempty query with no normalized text tokens matches symbols literally. Symbol-only relevance prioritizes titles. Presentation variants of emoji are treated alike. `web/catalog.js:15`, `:47`, `:91`. |

**Verified before iteration 2.** At both widths the existing fixture reports one match, **🦊 Fox**. Unit cases cover another emoji returning no match, emoji presentation variants, a literal punctuation query, a blank query, and symbol-only relevance. [Before and after screenshots](ui-stress/four-cycles-2026-11-09/iteration-1/).

## Iteration 2 · Keyboard focus and history

| Severity | Field and worst case | Reproduced failure | Fix |
| --- | --- | --- | --- |
| Broken | Keyboard activation of a ledger detail link followed by browser Back | The ledger redraw disconnected the link. Focus moved to the document body when details closed. | Restore focus after the history render using the equivalent visible opener and fall back to the collection heading when necessary. Keep the opener identity and control type in the history entry for Forward and manual Close. `web/film-navigation.js:72`, `:112`, `web/app.js:1486`. |
| Broken | Toggle English with Enter, reducing eight results to seven | The rebuilt option lost keyboard focus to the document body at both widths. | Restore focus to the option with the same language code after rebuilding and updating visibility. `web/app.js:943`. |

**Verified before iteration 3.** Back restores the ledger detail link at 320px and 1440px. Enter toggles English on and off without losing focus. Final browser verification also exercised Back, Forward, manual Close to the original poster control, and the collection heading fallback for a directly opened link. [Before and after screenshots](ui-stress/four-cycles-2026-11-09/iteration-2/).

## Iteration 3 · Imported source filters

| Severity | Field and worst case | Reproduced failure | Fix |
| --- | --- | --- | --- |
| Broken | Imported festival view using a known Letterboxd list URL with no trailing slash | Apply showed an unavailable list and zero matches. Reload changed the URL and showed five matches at both widths. | Apply the same source URL normalization to saved views and URL restoration. Strip query and fragment, normalize the trailing slash and the www alias, and deduplicate equivalent URLs. `web/saved-views.js:148`, `web/app.js:809`, `:842`. |

**Verified before iteration 4.** At both widths, importing two aliases produces one chip and a canonical URL. Apply and reload both show five matches. Valid retired URLs still retain their removable constraint through the existing R3 regression. [Before and after screenshots](ui-stress/four-cycles-2026-11-09/iteration-3/).

## Iteration 4 · Current and native print output

| Severity | Field and worst case | Reproduced failure | Fix |
| --- | --- | --- | --- |
| Broken | Immediately print after entering `Lantern Archive 1974 Restoration`, a zero-match query | The print header showed the new query while eight rows from the previous selection remained. | Build the heading and rows from the same current controls at print time. Preserve catalogue rank via the existing rank map. `web/app.js:1607`, `web/print-programme.js:13`. |
| Broken | Native browser print before the app’s print button has ever been used | Chromium PDF contained the placeholder heading and no film rows despite eight settled results. | Build the same programme on the browser’s `beforeprint` event. `web/print-programme.js:114`. |

**Targeted verification.** At both widths the in-app print path produces the new zero-match context and zero rows before the visible count updates. Native Chromium PDF now contains all eight catalogue rows. The before/after PDF text extracts and preview screenshots are in [iteration 4 evidence](ui-stress/four-cycles-2026-11-09/iteration-4/). Existing Compact and Reader text and maximum-score regressions also run in the full stress suite.

## Decisions and limits

Symbol-only search uses literal matching without changing the ordinary word-matching strategy. History restoration prioritizes the original control type when that film remains visible. Genuine unavailable source URLs retain their zero-result filter intent. Both print paths snapshot the current selection, including during a delayed catalogue render.

The [rendered field and limit map](ui-stress-report.md#rendered-value-map) and [cross-boundary limit notes](ui-stress-four-cycles-2026-11-08.md#field-and-limit-map) still apply. This round adds no field or string limit. Search query length remains unbounded. The mixed Worst case fixture and Empty, One, and 100,000 rows states are reused. New interaction repros were run in headless Chromium at 320px and 1440px. The fixture matrix covers reflow, enlarged text, dark mode, and RTL diagnostics. Browser zoom controls, physical printers and devices, other engines, and screen readers were outside this pass.

The existing localhost-only [dev toggle](http://127.0.0.1:4173/?data=worst) remains available with **Demo data / Worst case / Empty / One / 100,000 rows**. [Durable browser regression coverage](../scripts/ui-r4-regressions.mjs) is wired into `npm run check:stress`.

## Final verification

| Check | Result |
| --- | --- |
| `npm test` | 35 passed |
| `.venv/bin/python -m pytest` | 50 passed |
| `npm run check:browser` | Passed the full browser suite, including keyboard/history, axe and reflow checks |
| `npm run check:stress` | Passed all 35 toggle/profile combinations and every accumulated regression group, including R3 and R4 |
| Actual local toggle matrix | All five states passed at 320px, 1440px and 2560px with no page overflow or uncaught errors |
| `git diff --check` | Passed |

The fixture matrix covers 320px, the 1320px capped desktop container at 1440px and 2560px, 720px reflow, dark mode at 320px, enlarged root text at 320px and RTL diagnostics at 320px. The actual local Demo contains 34,509 films. Its 100,000-row fixture remains batched.

[Final logs, local measurements and Demo/Worst case screenshots](ui-stress/four-cycles-2026-11-09/final/). All six reproduced findings are resolved, and all four cycles and the final verification are complete.
