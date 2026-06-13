# Eggo — backyard egg tracker

A fast, mobile-first web app for logging eggs from a backyard flock of 12 hens.
The #1 design goal is **speed of entry**: egg in hand → phone out → logged in
seconds, ideally with **zero keyboard**.

## Core flow (mobile-first, Log tab)

The form order is **Color → Chicken → Weight → Save** (weight last, intentionally).

1. Pick a **color**: brown, blue, or olive (radio chips, brown preselected).
2. Pick the **chicken** (optional) — toggle buttons showing only the hens that
   lay the selected color; tap again to clear; changing color resets the pick.
3. Enter **weight** (optional) — keyboard-free two-tap picker: a tens button
   (20s..70s) then an optional ones digit (50s + 2 = 52g; tens-only = round
   weight). Digits are locked/dimmed until a tens is chosen. A × clears it.
4. **Save egg** → stored locally; status pill shows "Saved [Ng]" with Undo.

After save: color is kept (clutches match), chicken + weight reset.

## Current state (what's built)

Three tabs in the app shell (`main.js`): **Log**, **Stats**, **Debug**.

- **Log** (`log-view.js`): the entry form above, plus today's egg count and a
  recent-history list (color dot, weight or "—", chicken, time). Two-tap delete
  per row ("× → Sure?"). Undo after save.
- **Stats** (`stats-view.js`): summary tiles (total / last 7 days / avg weight),
  and Chart.js charts — eggs/day (14d), cumulative total, avg weight trend,
  color doughnut, by-chicken bar. **Tap a color slice or hen bar to filter** the
  whole page; an amber "Showing: X ×" pill clears it (one filter at a time).
  Hen axis labels have an egg-color dot (custom canvas plugin `henDots`).
- **Debug** (`debug-view.js`): **dev builds only** (gated by `import.meta.env.DEV`,
  dropped from prod). Seed/clear fake data, wipe all, and a **bulk import**
  textarea (see format below).

Backend is **not wired up yet**: `APPS_SCRIPT_URL` in `config.js` is empty, so
all entries live in localStorage and are marked `synced: false`. When the URL is
set, `storage.trySync()` POSTs unsynced entries.

## Data model

Entry (localStorage key `eggo-entries`, array):
```
{ id, timestamp (ISO), weight (number|null), color ('brown'|'blue'|'olive'),
  chicken (string|null), synced (bool), seeded? (bool) }
```
- `weight` and `chicken` are both nullable; stats/avg/weight-chart skip nulls.
- `uid()` in `storage.js` is used for ids (NOT `crypto.randomUUID` — see below).
- Flock roster + each hen's egg color live in `config.js` (`CHICKENS`). The
  color drives the smart chicken picker.

## Import format (Debug tab)

Date headers then egg lines; all-or-nothing with per-line errors. Tolerant of:
abbreviated/explicit-year dates ("Jun 3", "June 1, 2026"), numbered eggs
("Egg 3 (brown)"), colorless colon form ("Egg: 42g - clive" → color inferred
from hen), "????"/"?" hen (→ blank), missing space ("-36g"), any case.
```
June 12
Egg (brown) - 46g - Goldilocks
Egg (olive) - 30g
```
Imported entries get noon + 1min/egg timestamps (notes have no times).

## Architecture

- **Frontend:** static site, Vite + vanilla JS, hosted on **GitHub Pages**
  (deploy workflow in `.github/workflows/deploy.yml`).
- **Storage:** a Google Sheet. The static site POSTs to a **Google Apps Script
  web app** (`apps-script/Code.gs`) attached to the Sheet — the Sheets API can't
  take anonymous writes and OAuth can't be embedded in a public page. Reads can
  be public-sheet or via the same script.
- Offline-friendly: entries queue locally and sync when the endpoint is reachable.

## Commands

- `npm run dev` — Vite dev server, binds to LAN (`--host`).
- `npm run build` — prod build to `dist/`.

## Development workflow

- Dev on a Windows desktop; testing on a phone over the LAN.
- On dev start, **detect the current local IPv4** (`Get-NetIPAddress`, the Wi-Fi
  adapter — not VirtualBox/Hyper-V virtuals) and give the user the exact
  `http://<ip>:5173` URL.
- **Never write the local IP (or any machine-specific detail) into a git-tracked
  file.** This repo is public. Detect fresh each session (DHCP changes it).
  Machine-specific notes go in `CLAUDE.local.md` (gitignored), as is
  `.claude/settings.local.json`.

## Verifying changes

- After any UI change (styles, layout, markup, charts), run the **ui-review**
  skill (`.claude/skills/ui-review`) before committing — screenshot-driven
  regression review across states and viewports.
- After changing user-facing behavior, verify by driving the real app in a
  headless browser — don't stop at "the build passed."
- **Test via the LAN IP URL (`http://<detected-ip>:5173`), never localhost.**
  localhost is a secure context and the LAN IP is not; localhost masks bugs that
  only appear on the phone (e.g. `crypto.randomUUID` is undefined in insecure
  contexts and silently broke saving — hence `uid()`).
- **Use the iPhone 15 Pro Safari viewport: 393×660** (NOT the 852px hardware
  height — Safari's chrome eats ~190px). The full log flow must fit above the
  fold at that size.
- **Don't eyeball text truncation** (ellipsis styling, e.g. hen buttons) —
  measure `scrollWidth` vs `clientWidth` across all data variants at 393 & 320px.
- Working recipe: `npm install puppeteer-core` in a temp dir (NOT in this repo)
  and launch system Edge headless
  (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`); listen for
  `pageerror`/console errors, exercise the flow, screenshot, clean up localStorage.
  A dev-only `window.Chart` hook (`stats-view.js`) lets tests locate chart
  elements for click simulation.

## Roadmap

Done: dev seed tools, today view + history, undo/delete, smart chicken picker,
keyboard-free weight picker, stats + charts, click-to-filter, bulk import.

Pending (later): **PWA / install-to-home-screen + offline**, then **go-live** —
create the Google Sheet + deploy `apps-script/Code.gs`, set `APPS_SCRIPT_URL`,
create the GitHub repo, enable Pages (source: GitHub Actions), test sync E2E.

Skipped: QR code on dev start, CSV export.
