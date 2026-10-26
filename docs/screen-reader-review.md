# Manual screen-reader review

The browser accessibility scan catches many structural issues, but it cannot confirm how a real screen reader presents the site. Run this short check when changing catalogue controls, film dialogs, or result announcements.

## VoiceOver (Safari) or NVDA (Firefox/Chrome)

1. Open the site with the screen reader enabled. Move by headings and confirm the page has one main heading, a named catalogue section, and a footer.
2. Move to the search field, enter a title or director, and confirm the field name and hint are announced. Confirm result-count updates are announced once and describe the active query or filters.
3. Use the filter buttons and disclosure controls with the keyboard. Confirm pressed/expanded state is announced, the selected filters are understandable, and “Clear search & reset view” is reachable.
4. Open a film’s details. Confirm the dialog title is announced, its close button is reachable, and closing returns focus to the film that opened it. Check previous/next film navigation and the Letterboxd link.
5. Switch to Ledger view. Navigate the table by row and column and confirm the caption and column headers provide context. On a narrow viewport, verify the table can be scrolled horizontally without losing keyboard access.
6. Open and close the poster viewer. Confirm the poster choice buttons announce language/current selection and the image has useful alternative text.
7. Open a stale edition if available and confirm the freshness notice is announced after the catalogue loads.

Record the browser, screen reader, date, and any failures in the pull request. Automated axe and keyboard checks remain useful, but passing them does not count as this manual review.
