# Expense Tracker

A lightweight, dependency-free expense tracking web app. Your data is stored in your browser (`localStorage`); nothing is sent to a server.

## Features

- Add, edit and delete expenses (amount, description, date, category, optional note), with undo on delete
- Monthly summary with an optional per-month budget and progress bar
- Spending breakdown by category and a 6-month trend chart (click a bar to jump to that month)
- Filter by month and category, plus free-text search
- Export to CSV and import from CSV
- Responsive layout with light and dark mode

## Run it

ES modules need to be served over HTTP (opening `index.html` directly from disk won't work):

```sh
npm start          # serves on http://localhost:8000
```

Or use any static file server, or host the folder on GitHub Pages.

## Tests

```sh
npm test
```

The core logic (amount parsing, validation, filtering, totals, CSV import/export) lives in `src/lib.js` and is covered by `test/lib.test.js`.

## Project layout

```
index.html        # markup
src/app.js        # UI wiring, rendering, persistence
src/lib.js        # pure logic (tested)
src/styles.css    # styles
test/lib.test.js  # unit tests (node:test)
```
