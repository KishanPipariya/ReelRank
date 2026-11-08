# ReelRank — four sequential break-ui audit/fix cycles

Started 8 November 2026 in GPT-6.1 Sol. Baseline: working tree based on `4de2a8c`, including earlier uncommitted print-text fixes. User authorized exactly four sequential cycles and fixes without additional confirmation. Findings are sent to the parent reviewer before edits. The independent auditor works read-only. No commits are created; the dev-only fixtures/toggle stay available.

## Iteration 1 — snapshot text boundaries and print theme

### Audit, reported before editing

| Severity | Finding | Evidence / original location |
| --- | --- | --- |
| Broken | Python accepts/exports a 20,001-character overview although the browser rejects it and cannot load the catalogue. The validator omitted `maxLength`. | Prior working-tree audit: exported snapshots and 320/1440px setup screens. `src/reelrank/snapshot.py:194`, writer gate `:470`. |
| Broken | Exactly 20,000 code points with one 🎬 become 20,001 UTF-16 units; browser rejects the valid character-boundary synopsis. | Prior Python/browser parity probe, ASCII control loads. `web/snapshot.js:30`–31. |
| Broken | Ordinary print titles under dark system preference have 1.15:1 contrast in both formats. | Prior light/dark print screenshots and colors. `web/styles.css:1388`. |

### Fixes

Python now enforces declared maximum string lengths before writing output. Browser validation counts Unicode code points consistently with Python. Printed film titles use the stable dark print color while preserving screen dark mode and print-score geometry. Python tests cover scalar and string-array limits, Unicode boundaries and preservation of existing output on validation failure; JavaScript tests cover matching boundaries. `scripts/ui-cross-boundary-regressions.mjs` verifies real page loading/rejection at 320/1440px plus both print formats under light/dark preferences.

### Verification

**Complete before iteration 2 began:** JavaScript unit tests 28/28; Python suite 37/37; full browser suite passed; full stress suite passed all 35 state/profile combinations and all previous/new regression groups, including Unicode boundaries and four print-theme/format cases. Evidence and logs: `docs/ui-stress/four-cycles/iteration-1/`.

## Iteration 2 — public source provenance and timestamp parity

### Audit, reported before editing

The independent auditor reported both cases, then the driver reproduced them after iteration 1 passed. **Broken:** public conversion of the existing minimal legacy fixture produced empty `source_lists`/`list_ids`; CSV lost the favorites URL (`src/reelrank/snapshot.py:430`–442). **Broken:** Python accepted offset-without-colon and ISO-week dates that the browser rejected; browser accepted 30 February normalized to 2 March while Python rejected (`src/reelrank/snapshot.py:52`, `web/snapshot.js:89`). Pre-fix conversion output is preserved in iteration 2 evidence.

### Fixes

Public conversion now compacts legacy `lists` into the same source table/IDs as modern input and removes the redundant legacy representation. Both validators now require the same calendar date, T-separated hours/minutes/seconds, optional 1–6 fractional digits, and explicit Z or ±HH:mm timezone. Invalid calendar dates and clock/offset components are rejected. This deliberately narrows producer acceptance to the consistently supported representation; generator timestamps already use it. Fourteen shared valid/invalid vectors exercise leap dates, timezone crossings and malformed dates. Python conversion tests and browser provenance/search/download checks cover the retained source URL.

### Verification

**Complete before iteration 3 began:** JavaScript 30/30; Python 39/39; full browser suite and full stress suite passed, including all previous groups plus source provenance/search, invalid-calendar rejection and print checks. Evidence/logs: `docs/ui-stress/four-cycles/iteration-2/`.

## Iteration 3 — accurate TMDB attribution

### Audit, reported before editing

Independent-auditor finding reproduced after iteration 2 passed: **Broken**, a legacy film with no TMDB ID/status converts from zero matches to one, because missing status is not equal to `unavailable` (`src/reelrank/snapshot.py:453`). A browser probe confirmed TMDB attribution visible despite no ID; pre-fix data, screenshot and measured visibility are retained.

### Fixes

The public edition counts supported integer TMDB IDs among its featured films. A known ID still counts when details are unavailable or ID-only; missing ID/status cannot imply enrichment. Parameterized Python cases cover missing/partial/status variants and featured-subset counting. The producer-generated legacy fixture now has zero matches. Browser checks verify absent metadata hides attribution and a real supported ID shows it at 320 and 1440px.

### Verification

**Complete before iteration 4 began:** JavaScript 30/30; Python 50/50; full browser and full stress suites passed all previous groups plus hidden/visible attribution checks at both widths. Evidence/logs: `docs/ui-stress/four-cycles/iteration-3/`.

## Iteration 4 — saved-view import and Unicode excerpts

### Audit, reported before editing

After iteration 3 passed, three independent-auditor cases were browser-verified before edits:

| Severity | Finding | Original location |
| --- | --- | --- |
| Broken | Importing one new name into 100 saved views reports success and silently removes the oldest. Reproduced at 320/1440px; Undo exists but the replacement is not disclosed. | `web/saved-views.js:187` |
| Ugly | A visible matching-search heading for `The Chronicles of the Last Voyage 🎬 Restoration Notes` ends with a lone high surrogate plus ellipsis, rather than the emoji. | `web/app.js:1572` |
| Ugly | A CJK Reader synopsis whose emoji crosses UTF-16 position 260 prints the same invalid surrogate at its excerpt boundary. | `web/print-programme.js:101` |

The query was included in a film synopsis to verify an actually visible result heading, rather than only hidden no-result DOM. Before screenshots and string well-formedness results are retained.

### Fixes

Import checks the complete merged unique-name count before saving and refuses overflow without changing any existing view. Case-insensitive replacements remain possible at capacity and retain Undo. File input resets in `finally`, allowing the same file to be selected after making room. Browser tests cover these cases across all seven stress profiles.

`web/display-text.js` provides a shared grapheme-safe prefix. Query headings keep their existing compact-label policy using whole graphemes; Reader excerpts preserve full emoji/ZWJ sequences/combining marks rather than slicing a surrogate. Existing ASCII and word-boundary behavior is retained. Unit tests include 🎬, 👩🏽‍💻, accented combining text and flags; browser regressions assert well-formed and correct visible heading/Reader text at 320/1440px and a 696px print layout.

### Verification

**Iteration 4 complete:** JavaScript 31/31; Python 50/50; targeted Unicode browser, full browser and full stress suites passed. The seven-profile import/replacement/Undo cases and visible heading/Reader Unicode cases pass alongside every previous regression group. Evidence/logs: `docs/ui-stress/four-cycles/iteration-4/`. **Exactly four audit/fix cycles have completed.** A separate final verification run follows; no fifth audit/fix cycle will be started.


## Final state — exactly four cycles completed

All **nine reported findings** from these four cycles are fixed. The independently supplied findings were reproduced and reported before their edits. No fifth audit/fix cycle was performed. After iteration 4 verification, a **separate final full test/browser/stress run** also passed.

| Verification | Iteration 1 | Iteration 2 | Iteration 3 | Iteration 4 | Separate final run |
| --- | --- | --- | --- | --- | --- |
| JavaScript unit suite | 28 passed | 30 passed | 30 passed | 31 passed | **31 passed** |
| Python unit suite | 37 passed | 39 passed | 50 passed | 50 passed | **50 passed** |
| Full browser/axe/keyboard/setup/sharing suite | Passed | Passed | Passed | Passed | **Passed** |
| Full stress suite, 35 state/profile combinations + all accumulated regressions | Passed | Passed | Passed | Passed | **Passed** |

Final real-data verification additionally clicked **Demo data / Worst case / Empty / One / 100,000 rows** at **320, 1440 and 2560px**: **15 combinations**, no horizontal page overflow or uncaught browser errors. The full stress matrix uses 320/1440/2560px, 720px reflow, dark 320px, 200% root text at 320px and RTL diagnostic at 320px. Existing browser checks also cover 400% zoom-equivalent reflow at 360px. Prints are checked in both Compact and Reader at a 696px printable-layout width; all light/dark print titles now measure **16.98:1 contrast**. `git diff --check` and changed JavaScript syntax checks pass. No check is pending.

### Current fix locations and durable regressions

| Behavior | Implementation |
| --- | --- |
| Producer text limits, Unicode parity | `src/reelrank/snapshot.py:198`, `web/snapshot.js:31`; scalar/array boundary and writer-preservation tests in `tests/test_reelrank.py`, `tests/web.test.js` |
| Calendar/zone contract parity | `src/reelrank/snapshot.py:53`, `web/snapshot.js:70`; shared `tests/fixtures/timestamp-cases.json` |
| Legacy list provenance | `src/reelrank/snapshot.py:436`; producer test, `tests/fixtures/public-legacy-snapshot.json`, browser source/search and CSV checks |
| Accurate featured TMDB matches | `src/reelrank/snapshot.py:453`; optional/status/ID/featured-limit tests and browser attribution visibility |
| Import capacity without implicit deletion | `web/saved-views.js:187`, file-input reset `:201`; seven-profile replacement/refusal/retry/Undo checks in `scripts/ui-boundary-regressions.mjs` |
| Whole-grapheme display prefixes | `web/display-text.js:3`, `web/app.js:1573`, `web/print-programme.js:101`; unit joined-emoji/combining/flag checks and `scripts/ui-unicode-regressions.mjs:4` |
| Theme-independent print titles | `web/styles.css:1388`; four print-theme/format contrast cases in `scripts/ui-cross-boundary-regressions.mjs:4` |

`scripts/ui-stress-scan.mjs:173`–177 runs every old and new regression group. The original development fixtures and localhost gate remain intact. Earlier pending print wrapping/score fixes and their tests were preserved.

### Decisions applied

Over-limit producer data is rejected before overwriting an existing catalogue; it is not silently clipped. Snapshot character limits count Unicode code points in both languages, while visual excerpts preserve whole graphemes. Edition timestamps use one explicit calendar/time/zone representation; impossible dates are rejected. A supported TMDB ID, including an ID-only match, controls attribution rather than a missing metadata-status field. Imports refuse capacity overflow atomically and permit named replacements. Print ink is independent of screen theme.

### What held up

Earlier long-title/year/country/source-list, numeric, genre-hover, missing-poster, async poster retry/race, empty/singular, shared film 99,999, delayed-ranking focus/scroll and re-open-scroll checks all still pass. Both print formats preserve complete numeric scores and wrapped identifying text. The 100,000-row state remains batched rather than rendering every card.

### Field and limit map

The [complete original surface map](ui-stress-report.md#rendered-value-map) and [tools/print extension](ui-stress-head-84a137a.md#surface-and-contract-map) describe the rendered fields. Updated enforcement: producer and browser now both apply the declared snapshot string ceilings by Unicode code point (title/original title 1,024; synopsis 20,000; username 128; year/language 64; metadata/source strings 512; URL fields 2,048), with safe-integer numeric bounds. Saved-view names retain the form/preference limit of 48 UTF-16 units and the collection limit of 100. Query headings compact long values by whole grapheme; Reader excerpts cap at 260 graphemes with the existing word-boundary preference. Full query/source text remains available. CSV titles, film/metadata arrays and URL-state query/facet collections remain unbounded observations, not newly reproduced failures.

### Evidence, server and limitations

Per-iteration logs and before/after evidence live under [iteration 1](ui-stress/four-cycles/iteration-1/), [iteration 2](ui-stress/four-cycles/iteration-2/), [iteration 3](ui-stress/four-cycles/iteration-3/) and [iteration 4](ui-stress/four-cycles/iteration-4/). Separate final logs, actual-data state results and screenshots are in [final verification](ui-stress/four-cycles/final/). Useful final images: [dark-preference print](ui-stress/four-cycles/final/print-compact-dark-verified.png), [whole-emoji search heading](ui-stress/four-cycles/final/unicode-query-320-verified.png), [whole-emoji Reader excerpt](ui-stress/four-cycles/final/unicode-reader-verified.png).

No reproduced finding from these four cycles remains unresolved. This is not an exhaustive guarantee for unbounded inputs. Chrome headless automation was used; physical devices, screen readers, other browser engines, browser-chrome zoom, native print dialogs, PDF/physical pagination and very large print-job performance were not operated. Root-font/reflow and touch emulation are not physical-device claims. RTL remains the existing diagnostic, not a localization guarantee. Remote-CDN availability was not audited.

No commit was created. The local server remains running at [Worst case](http://127.0.0.1:4173/?data=worst). The unchanged bottom-center localhost-only toggle retains **Demo data / Worst case / Empty / One / 100,000 rows** and URL persistence.
