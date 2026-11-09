# ReelRank — third round of exactly four audit/fix cycles

Baseline: clean committed HEAD `c4e3157`. Performed 8 November 2026 in GPT-6.1 Sol with an independent read-only auditor, using break-ui. Each cycle reports new reproduced findings before its edits and completes targeted verification before the next begins. No commits; dev fixtures/toggle preserved.

## Cycle 1 — progressive metadata controls

**Audit before edits:** Broken keyboard focus: director expansion detaches/re-appends its focused More button, leaving BODY focused in details and ledger. Ugly singular copy: 11 directors leave “Show 1 more directors” after a batch; 10 countries leave “Show 1 more countries”; a three-director table row also says “1 more directors.” Reproduced at320/1440 using real credit/country names and schema-valid arrays. Original locations: app.js directorCreditFor/country toggles, film-views.js ledger director expansion.

**Fixes:** insert new credit nodes before the connected More control so focus survives expansion and collapse. Choose director/country nouns by the number being revealed. All metadata remains available.

**Verified before cycle 2:** JavaScript32, Python50 and targeted browser checks pass keyboard expand/collapse, retained focus, full counts and one-item labels in both widths. Evidence/logs: `docs/ui-stress/four-cycles-r3/iteration-1/`.

## Cycle 2 — stable filter intent across reload/history

**Audit before edits: Broken.** Source, genre, director, country, decade and runtime constraints from a valid previous-edition preset give zero results, then reload removes the URL constraint and shows all eight films. Unavailable language is already cleared during rendering after Apply. Driver checked all seven facets; independent auditor found the source case. Availability pruning in app.js builders, language counts and restoreUrlState caused silent widening.

**Fix:** preserve syntactically valid user constraints independently of current metadata availability. Existing visible/removable chips explain zero matches. Malformed source URLs, blank facets and invalid decade syntax remain rejected/normalized. Missing runtime metadata does not clear a selected duration range.

**Verified before cycle 3:** JavaScript33/Python50; accumulated targeted browser tests pass all seven facets at320/1440 through Apply → reload → clear → Back, with URL/result/chip parity and malformed-source rejection. Evidence/logs: `docs/ui-stress/four-cycles-r3/iteration-2/`.

## Cycle 3 — URL-less record permalink identity

**Audit before edits: Broken.** Two schema-valid Home(2019) records without external IDs share `?film=Home-2019`. Clicking the second shows its second-only synopsis at Film2of2; reload opens Film1of2 with the first synopsis/director. Driver reproduced at320/1440; independent auditor supplied the case. Film-navigation fallback and manual share fallback in app.js used the same non-unique title/year key.

**Fix:** catalogue-local content-derived keys with occurrence suffixes for identical records. The same identity is used for UI, copied links, reload lookup and navigation refresh. Canonical external IDs retain priority. Old title/year aliases resolve only when unambiguous, preventing a silent first-match substitution.

**Verified before cycle 4:** JavaScript34/Python50; accumulated browser regressions pass second-record UI/copy/reload, duplicate identical occurrence position and all earlier r3 checks at320/1440. Unit checks cover deterministic reload identity, unique legacy aliases, ambiguous aliases and external ID priority. Local identities are edition/content dependent; canonical external identifiers remain preferable across metadata revisions. Evidence: `docs/ui-stress/four-cycles-r3/iteration-3/`.

## Cycle 4 — original poster versus user preference during async expansion

**Audit before edits: Broken.** With a saved alternate poster and a valid ranking sidecar, Reset clears preferences and announces original restored but still displays the alternate. Confirmed at320/1440, with details opened both before and after sidecar completion. Initial snapshot film objects were mutated by preferences, then chosen URLs were recaptured as originals in expanded records. A pre-load-open dialog also kept old record closures.

**Fix:** UI film records are shallow clones before preferences are applied; source snapshot/ranking records retain catalogue originals. Poster actions resolve the current canonical record and update both current and retained-dialog references, preserving the synopsis DOM and reading state.

**Verified:** JavaScript34/Python50, accumulated targeted browser checks pass all four timing/width cases: reset returns original, preference is cleared, enlargement previews original, reload keeps original, and early-open synopsis DOM remains intact. **Exactly four fresh cycles are complete.** Final full JS/Python/browser/stress and actual-local matrix follow; no fifth audit/fix cycle will start. Evidence: `docs/ui-stress/four-cycles-r3/iteration-4/`.


## Final result — exactly four fresh cycles completed

All reproduced findings from these four cycles are fixed. Independent-auditor findings were reproduced and reported before edits. A final full verification run completed after cycle4; **no fifth audit/fix cycle** was performed. No commit was created.

| Verification | Cycle1 | Cycle2 | Cycle3 | Cycle4 | Final |
| --- | --- | --- | --- | --- | --- |
| JavaScript unit suite |32 passed|33 passed|34 passed|34 passed|**34 passed**|
| Python unit suite |50 passed|50 passed|50 passed|50 passed|**50 passed**|
| Accumulated targeted r3 browser checks |Passed|Passed|Passed|Passed|**Passed in full stress**|
| Full browser/axe/keyboard/setup/sharing suite |Final run|Final run|Final run|Final run|**Passed**|
| Full stress35 + every previous/current regression group |Final run|Final run|Final run|Final run|**Passed**|

Final fixture coverage: all five dev states at **320,1440,2560px;720px reflow;dark320px;200% root text320px;RTL diagnostic320px**, 35 combinations. Existing browser checks also pass 400% zoom-equivalent reflow at360px. A separate pass clicked the **actual local** five toggle states at320/1440/2560px: **15 combinations**, no page overflow or uncaught errors. Demo contains34,509 films;100,000 rows remains batched at42 cards plus featured initially. Both print formats and all prior print text/contrast/score checks remain green. No test is pending.

### Current fix locations and durable coverage

| Behavior | Implementation |
| --- | --- |
| Connected progressive director controls, singular country/director labels |`web/app.js:1121`–1177 and `:1275`; ledger `web/film-views.js:658`–695|
| Valid stale facets persist across rebuild, reload and history; malformed source paths/blank fields ignored |`web/app.js:515`, `:809`, source URL normalization; `web/url-state.js`; seven-facet browser cases and URL-state unit test|
| Distinct local record keys, stable occurrence suffixes, unique legacy lookup and shared-link consistency |`web/film-navigation.js:4`–49; initialization registration and share identity in `web/app.js`; navigation refresh in `web/film-views.js`|
| Immutable source poster originals and current-record actions through asynchronous ranking |`web/app.js:1395`–1419 and `:2010`–2011|

`scripts/ui-r3-regressions.mjs:5`, invoked from `scripts/ui-stress-scan.mjs:181`, provides durable browser coverage for each new finding. It checks metadata counts/focus/keyboard collapse, seven unavailable facets at two widths through Apply/reload/clear/Back, malformed source URL rejection, distinct and identical local records through copied-link/reload, and four poster reset timing/width cases including original preview, persisted reload and retained synopsis DOM. Targeted new cases use320/1440px; the latter contains the actual capped1320px desktop container. Supplemental new cases were not each separately repeated in every theme/text/RTL profile; the full fixture matrix covers those environments.

### Decisions applied

Keep progressive controls connected rather than recovering focus after needless detachment. Retain valid filter intent as explicit zero-result constraints, with removable chips, instead of silently widening results based on incomplete metadata. Reject malformed syntax, not unavailable catalogue values. Prefer canonical external IDs; for records without them, use local content-derived keys with occurrence disambiguation. Resolve old title/year aliases only when unique. Keep source data separate from user preferences, and resolve actions against current records while preserving retained dialog reading content.

### What held up and current field limits

All previous Unicode/code-point/grapheme boundaries, strict calendar timestamp parity, source provenance, TMDB attribution, named-view capacity/import/Undo, cross-tab identity, poster decode/retry/races/focus, language context, sparse ranking identity, full print text/score/contrast, empty/singular states, long metadata, film99,999 links and delayed-ranking reading/focus checks still pass.

The [original complete rendered-field map](ui-stress-report.md#rendered-value-map) and [first four-cycle enforcement map](ui-stress-four-cycles-2026-11-08.md#field-and-limit-map) remain applicable. Snapshot strings retain their code-point ceilings: title/original title1024, synopsis20000, username128, year/language64, metadata/source-string entries512 and URL fields2048; numeric fields retain safe-integer bounds. Saved-view names remain48 UTF-16 units and collections100. This round adds no new user field or string cap. Metadata arrays, ranking CSV titles and query state remain unbounded observations, not exhaustive-coverage claims. Facet validity is now based on syntax/contract rather than membership in the currently loaded metadata.

Local fallback links are tied to catalogue identity content and occurrence order for identical records. They are not a permanent cross-edition replacement for external IDs: changes to title/year/original title/directors/synopsis may invalidate them. Ambiguous old title/year keys are not used to choose an arbitrary first record. Source snapshots/ranking records now remain unchanged by in-browser poster preferences.

### Evidence, server and limits

Per-cycle before/after screenshots, data and logs: [cycle1](ui-stress/four-cycles-r3/iteration-1/), [cycle2](ui-stress/four-cycles-r3/iteration-2/), [cycle3](ui-stress/four-cycles-r3/iteration-3/), [cycle4](ui-stress/four-cycles-r3/iteration-4/). Final results/logs: [final verification](ui-stress/four-cycles-r3/final/). Useful after evidence: [metadata controls](ui-stress/four-cycles-r3/final/r3-metadata-controls.png), [persisted source chip](ui-stress/four-cycles-r3/final/r3-persisted-source.png), [second local Home record](ui-stress/four-cycles-r3/final/r3-local-film-link.png), [original poster restored after early-open sidecar](ui-stress/four-cycles-r3/final/r3-poster-reset.png), [measurements](ui-stress/four-cycles-r3/final/r3-measurements.json).

`git diff --check` and changed JavaScript syntax checks pass. **No reproduced issue from these four cycles remains unresolved.** Chrome headless automation was used. Physical devices, screen readers, other engines, browser-chrome zoom, native print dialogs, PDF/physical pagination, remote-CDN availability and exhaustive unbounded-input performance were not tested. Reflow/root text and RTL diagnostics are not physical-device or localization guarantees.

The existing server remains running at [Worst case](http://127.0.0.1:4173/?data=worst), with the unchanged bottom-center localhost-only **Demo data / Worst case / Empty / One /100,000 rows** toggle and URL persistence. No commits; no pending test process.
