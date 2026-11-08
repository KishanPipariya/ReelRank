# ReelRank — second round of exactly four audit/fix cycles

Baseline: committed HEAD `749ce58`, clean working tree at kickoff. Performed in GPT-6.1 Sol on 8 November 2026 using break-ui, with independent read-only auditing. Each fresh cycle reports its findings to the parent reviewer before edits, then fixes and verifies them before the next cycle. No commits; existing development fixtures/toggle retained.

## Cycle 1 — media/dialog focus

**Audit (before edits): Broken.** An original poster loading slowly fails after its enlargement dialog opens. The image error removes the opener. Closing enlargement leaves `document.activeElement=BODY` while film details remains modal, at 320 and 1440px. Source: `web/film-views.js:129`, close handling near `:257`. Before data/screenshots: iteration-1 evidence.

**Fix:** retain the enlargement opener; restore it when connected, or move focus to Browse posters/detail Close inside the still-open film dialog. Preserve reading scroll. New durable tests cover both removed-opener recovery and normal successful-image return.

**Verified before cycle 2:** JavaScript 31/31, Python 50/50, full browser suite and full stress suite (35 state/profile combinations plus all previous/new regressions) pass.

## Cycle 2 — language filter context

**Audit (before edits): Ugly.** At 320/1440px, `?language=es` displays “1 films” under Current selection and announces only “Showing 1 of 1 matching film.” The selected language is omitted. Confirmed independently and by the driver. Original locations: `web/app.js:1549`–1581 and `:1966`.

**Fix:** original-language heading with readable known/unknown names; include language in live result context; use a singular fallback count. No selected filter was silently discarded.

**Verified before cycle 3:** JavaScript 31/31, Python 50/50, accumulated targeted media + language/unknown-language/singular-heading browser regressions pass at 320/1440px. Full accumulated suite will repeat after cycle 4. Evidence: `docs/ui-stress/four-cycles-r2/iteration-2/`.

## Cycle 3 — saved-view identity and active constraints

**Audit (before edits): three Broken findings.** A saved view referencing a retired list gives zero matches/count 1 but no visible removable active chip (`filter-controls.js` selected/active-source loops). A stale Contact selection after another tab deletes an earlier view applies or deletes Later/Roma because actions use shifting numeric storage indexes (`saved-views.js` render/apply/delete). Both were independently found and driver-confirmed at 320/1440px. During targeted verification, a related first-click failure was reproduced and reported before its edit: reduced-motion pointer-down collapses inline Catalogue tools before the outside chip's click, moving it; the first click closes tools without removing the constraint and only the second works (`app.js` outside-close handler).

**Fixes:** unavailable source URLs get explicit, fully identifiable removable labels in chips/context/print. Actions and rerendered selection resolve the displayed name, matching the existing case-insensitive view-name replacement policy, rather than storage position. If that view was deleted elsewhere, actions show an unavailable message and refresh the selector. Inline tools close after the target click rather than moving controls at pointer-down.

**Verified before cycle 4:** JavaScript 31/31, Python 50/50; accumulated targeted browser tests pass removed/normal poster opener, language labels, single-click retired-source recovery, cross-tab Apply/Delete and already-removed-view guard at 320/1440px. Evidence: `docs/ui-stress/four-cycles-r2/iteration-3/`.

## Cycle 4 — ranking/metadata identity

**Audit (before edits): Broken.** Two plausible `Home` films from 2019 have distinct Letterboxd URLs. Snapshot metadata enriches only the first, but CSV expansion falls back by title/year for the second and copies the first-only synopsis, director and TMDB ID. Direct links to Film 2 of 2 displayed the incorrect metadata at 320/1440px. Independently found and driver-reproduced; source `web/ranking-csv.js:110`–127.

**Fix:** URL identity takes priority, with www/trailing-slash aliases normalized for lookup. Title/year fallback is reserved for URI-less detailed records and only when the key is unique in both detail and ranking data. Different valid URLs never share metadata solely through title/year. Row public URLs remain intact. Unit cases cover distinct films, aliases, unique legacy fallback and ambiguous repeated rows. Browser sidecar/deep-link tests verify sparse second film and intact first-film metadata.

**Verified:** JavaScript 32/32, Python 50/50; accumulated r2 targeted browser checks pass all four surfaces. **Exactly four fresh audit/fix cycles are complete.** Final full suites and actual-local matrix follow; no fifth cycle will start.


## Final result — exactly four fresh cycles completed

**Six fresh finding groups were fixed. No verified residual remains from these cycles.** The final full run completed after cycle 4; there was no fifth audit/fix cycle. Findings from the independent read-only auditor were reproduced and reported before the corresponding edits.

| Verification | Cycle 1 | Cycle 2 | Cycle 3 | Cycle 4 | Final full run |
| --- | --- | --- | --- | --- | --- |
| JavaScript unit tests | 31 passed | 31 passed | 31 passed | 32 passed | **32 passed** |
| Python unit tests | 50 passed | 50 passed | 50 passed | 50 passed | **50 passed** |
| Accumulated targeted r2 browser checks | Passed in full stress | Passed | Passed | Passed | **Passed in full stress** |
| Full browser/axe/keyboard/setup/sharing suite | Passed | Deferred to final | Deferred to final | Deferred to final | **Passed** |
| Full stress matrix + every prior regression group | Passed | Deferred to final | Deferred to final | Deferred to final | **Passed** |

The final stress matrix passes all five data states at **320, 1440 and 2560px; 720px reflow; dark 320px; 200% root text at 320px; RTL diagnostic at 320px**: **35 combinations**, with all earlier regression groups and the new r2 cases. Existing browser checks also pass 400% zoom-equivalent reflow at 360px. A separate real-local-data pass clicked every actual toggle state at 320/1440/2560px: **15 combinations**, no horizontal page overflow or uncaught browser errors. Demo retains 34,509 films and the large state retains 100,000; initial card rendering remains batched.

### Current implementation and coverage

| Fixed behavior | Current files / locations |
| --- | --- |
| Poster opener recovery after asynchronous image failure, and normal Escape return | `web/film-views.js:75`, `:135`, `:265`–272 |
| Language-only context, unknown-language label, singular fallback, live announcement | `web/app.js:1563`, `:1582`, `:1968` |
| Visible/removable retired sources, including context/print labels | `web/source-list-label.js:1`, `web/filter-controls.js:45`, `:73`, `web/app.js:1556`, `web/print-programme.js:29` |
| Cross-tab Apply/Delete by displayed name, selection preservation, already-deleted guard | `web/saved-views.js:80`–95, `:144`–161 |
| Inline tools no longer move an outside control before its click | `web/app.js:2410` |
| Ranking metadata isolated by URL; only unique URI-less legacy fallback | `web/ranking-csv.js:83`–121; unit test in `tests/web.test.js` |

New durable browser coverage lives in `scripts/ui-r2-regressions.mjs:5`, called from `scripts/ui-stress-scan.mjs`. It exercises failed/working poster focus, known/unknown language context and count=1 fallback, retired source removal on the first click with reduced motion, real shared-storage two-tab Apply/Delete/deleted-view cases, and actual ranking-sidecar/deep-link metadata identity. New targeted cases run at 320/1440px, the latter containing the actual 1,320px capped desktop layout. The independent normal-motion removal check and the explicit reduced-motion pointer-order before/after case are retained. Supplemental cases were not separately repeated in every theme/text/RTL setting; the full fixture matrix covers those environments.

### Decisions applied

Restore focus to the original control when it survives, otherwise a relevant control in the open film dialog. Keep unavailable saved-view source constraints visible and individually removable rather than silently changing the saved view. Treat view names as the existing case-insensitive identity key for actions, rather than unstable array positions. Close inline disclosures after the outside target activates. Prefer missing metadata over attaching another film's metadata when identifiers or legacy keys are ambiguous. Preserve unambiguous URI-less legacy matching and canonical www/trailing-slash aliases for metadata lookup.

### What held up

All prior snapshot text/Unicode/timestamp parity, legacy provenance, TMDB attribution, capacity/import/Undo, full-grapheme excerpts, dark print contrast, wrapped print fields, complete numeric scores, async poster failure/retry/race, empty/singular, long metadata, shared film 99,999 and delayed-ranking focus/scroll checks remain green. Both print formats pass existing content and contrast checks. The live catalogue's five states and localhost-only toggle remain intact.

### Fields, limits and remaining scope

The [original rendered-field map](ui-stress-report.md#rendered-value-map) and [first four-cycle enforcement corrections](ui-stress-four-cycles-2026-11-08.md#field-and-limit-map) remain applicable. This round adds no new user data fields or limits. Snapshot string ceilings still count Unicode code points; visual excerpts preserve graphemes. Saved-view names remain limited to 48 UTF-16 units and 100 entries. Valid source labels/URLs follow the existing contracts; stale preference source values remain plain text and removable. Ranking CSV Title remains unbounded, Year is empty/four digits, and rows require valid Letterboxd URLs; metadata title/year fallback is now explicitly unique and URI-less. Metadata arrays, query state and CSV titles remain unbounded observations, not exhaustive-test guarantees.

Existing URL-state normalization on reload is preserved; this round fixes the visible applied saved-view state and actions. Real-time cross-tab mirroring is not added: actions resolve the selected identity against fresh storage, and refresh their selector, while independent edits remain subject to the existing local-storage/Undo rules.

### Evidence and limits

Before/after data, screenshots and logs are under [cycle 1](ui-stress/four-cycles-r2/iteration-1/), [cycle 2](ui-stress/four-cycles-r2/iteration-2/), [cycle 3](ui-stress/four-cycles-r2/iteration-3/), [cycle 4](ui-stress/four-cycles-r2/iteration-4/) and [final verification](ui-stress/four-cycles-r2/final/). Useful final views: [retired-source chip](ui-stress/four-cycles-r2/final/source-chip-after.png), [Contact applied after another tab's deletion](ui-stress/four-cycles-r2/final/r2-cross-tab-identity.png), [second Home with correct sparse metadata](ui-stress/four-cycles-r2/final/r2-ranking-identity.png). Final measured checks are in [r2 results](ui-stress/four-cycles-r2/final/r2-measurements.json).

`git diff --check` and changed JavaScript syntax checks pass. No check is pending and no commit was created. Chrome headless automation was used. Physical devices, screen readers, other engines, browser-chrome zoom, native print dialogs, PDF/physical pagination and remote-CDN availability were not audited. Root-font/reflow/RTL diagnostics are not physical-device or complete-localization claims. No reproduced issue from these four cycles remains unresolved; unbounded inputs are not exhaustively covered.

The original server remains running at [Worst case](http://127.0.0.1:4173/?data=worst). The unchanged bottom-center localhost-only toggle retains **Demo data / Worst case / Empty / One / 100,000 rows** with URL persistence.
