# ReelRank UI safety checks, 9 November 2026

Baseline `e3ae1e0`. Three focused audit, fix, and verification cycles extended the [invariant matrix](ui-invariant-loop-2026-11-09.md#coverage-matrix) and reused the [field and limit map](ui-stress-report.md#rendered-value-map). The independent read-only audit reproduced adjacent cases with valid fixture data and normal keyboard, browser history, and import actions. Each cycle recorded its failures before the corresponding fixes and passed its targeted tests before work moved on.

| Cycle | Severity | Scenario | Reproduced failure | Fix |
| --- | --- | --- | --- | --- |
| 1 | Broken | Two URL-less 2016 editions, Arrival and Arrival: Festival Cut, share TMDB ID `329865`. | Both links used `329865-2016`; the dialog stayed closed when either ambiguous link reloaded. | Use the existing local disambiguation when the TMDB and year fallback is shared. Unique legacy links retain their identity. [Film identifiers](../web/film-navigation.js#L21) |
| 1 | Ugly | Open ledger provenance from the appearance count with Enter and press browser Back. | The rebuilt ledger focused the generic details link instead of the source count opener. | Key non-link film openers by film identity so the same control can be found after a rebuild. [Opener lookup](../web/app.js#L1487) |
| 2 | Broken | Import a saved view with `sort: relevance` and a whitespace-only query, or clear a relevance search with Escape. | The disabled relevance option stayed selected and the live result announcement claimed relevance sorting for an empty query. | Normalize relevance to rank when the query is blank in saved views and URL state. Route Escape through the existing clear-query action. [State normalization](../web/url-state.js#L6), [search reset](../web/app.js#L2502) |
| 2 | Broken | Press Enter on Science Fiction inside Arrival details with RTL and doubled text. | Closing the dialog replaced intentional result-heading focus with the ledger opener. At 320px the opener was at y=1698 in a 740px viewport. | Keep focus on the results heading when a filter action has already placed it there. [Close handling](../web/film-navigation.js#L159) |
| 3 | Broken | Five genres or eight genres in film details with dark mode, RTL, doubled text, and touch enabled. | Five genres shrank to two and could not be restored. Eight genres stepped from six to eight, two, then four. | Track the collapsed baseline separately from expanded visibility, using six for details and two for featured films. [Genre disclosure](../web/film-views.js#L6) |
| 3 | Broken | Zoom a valid TMDB poster, then use Fit to screen. | Returning from `/original/` requested `/t/p/500/`, which returned 404 and left the zoom active. | Select the `w500` size and replace either a width or an original size segment while retaining the canonical selected URL. [Poster variant](../web/film-views.js#L79) |

## What held up

- At 320px and 1440px, Back and Forward followed by Close restore the ledger source-count opener. The two same-ID editions produce distinct links and reload to their own titles.
- Blank relevance queries use rank through direct URLs, saved imports, and Escape after a relevance search. Nonblank search and relevance remain covered by the existing round-trip checks. The filter action from a dialog leaves focus on the visible heading and retains the genre in the URL.
- In dark mode with RTL, doubled text, reduced motion, and touch emulation, five detail genres need no disclosure. Eight stay available through a 6 → 8 → 6 → 8 keyboard and touch sequence. Posters fit after actual-size zoom from either `w500` or `original` without saving a preference.
- Native and in-app print selection and partial scope stayed covered by the existing invariant and stress suites. Those checks include printing before a search settles and while only eight of nine ranked films are available.

The [development toggle](http://127.0.0.1:4173/?data=worst) provides Demo data, Worst case, Empty, One, and 100,000 rows. Run `npm run check:safety` for the three new scenarios at both widths. Pass a cycle number after `--` for a targeted run. [Browser screenshots](ui-stress/safety-loops-2026-11-09/) include the before and after states. Verification used Chromium and axe. Screen readers, physical devices and printers, other engines, and PDF pagination fidelity remain outside this pass.

## Verification results

| Command | Result |
| --- | --- |
| `npm run check:safety` | All three cycles at both widths, 6 combinations |
| `npm test` | 38 passed |
| `.venv/bin/python -m pytest -q` | 54 passed |
| `npm run check:browser` | Passed browser, keyboard, reflow and axe checks |
| `npm run check:stress` | Passed all 35 fixture profiles and accumulated regression groups |
| `npm run check:invariants` | Passed 12 existing composed profiles |
| `npm run check:invariants -- --local` | Passed all five toggle states at 320px, 1440px and 2560px, 15 combinations |
| `git diff --check` | Passed |
