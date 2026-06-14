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

- **Log** (`log-view.js`): the entry form above, plus today's egg count (one
  colored egg per egg in its real color, capped at 8; past the cap the first slot
  becomes a "many eggs" cluster glyph of the same width, so the line doesn't
  shift) and a recent-history list (color dot, weight or "—", chicken, time).
  Two-tap delete per row ("× → Sure?"). Undo after save.

The header logo is three eggs — brown/blue/olive — and the today-count eggs both
reuse the color-selector's `.swatch` egg shape (via `egg-icon.js`), so there's a
single egg shape across the whole page. Change `.swatch`'s border-radius and all
three follow.
- **Stats** (`stats-view.js`): summary tiles (total / last 7 days / avg weight),
  and Chart.js charts — eggs/day (14d), cumulative total, avg weight trend,
  color doughnut, by-chicken bar. **Tap a color slice or hen bar to filter** the
  whole page; an amber "Showing: X ×" pill clears it (one filter at a time).
  Hen axis labels have an egg-color dot (custom canvas plugin `henDots`).
- **Debug** (`debug-view.js`): **dev builds only** (gated by `import.meta.env.DEV`,
  dropped from prod). Tiles (entries / unsynced / pending-del / backend count /
  seeded / last-pull); a **Backend toggle** (a switch — flips to the throwaway
  debug Sheet, clears local, reloads); always-on **Sync** (Pull, Push), **Import**,
  **Wipe local**. A **Debug tools** section — Seed, **+5000 rows to backend**
  (bulk stress test, backend-only), Clear local, Phantom row, Drop 1 on backend,
  Mark unsynced, Clear backend, Clear ALL (local + backend) — is shown **only in
  debug mode**
  so test-data/destructive ops can't hit production. Seeding pushes to the (debug)
  backend in one batch. When debug mode is on, a **DEBUG badge** shows by the logo
  (in `main.js`, persists across tabs), plus a **live sync-duration meter** (↑ push
  / ↓ pull with a ticking timer) driven by `eggo:sync` events from `sync.js` —
  visible on every screen so you can time sync events. Debug mode only.

Backend sync is **live and two-way** (`src/sync.js`). The flow is local-first and
quiet (see Architecture → Sync below): saving writes localStorage and returns
instantly; pushing/pulling happen in the background. A small dot beside the title
shows sync state (idle = invisible, amber = syncing, gray = offline); a bottom
toast announces when a pull changed data ("Loaded N eggs from the cloud").

## Data model

Entry (localStorage key `eggo-entries`, array):
```
{ id, timestamp (ISO), weight (number|null), color ('brown'|'blue'|'olive'),
  chicken (string|null), synced (bool), seeded? (bool) }
```
- `weight` and `chicken` are both nullable; stats/avg/weight-chart skip nulls.
- `uid()` in `storage.js` is used for ids (NOT `crypto.randomUUID` — see below).
  The `id` is the cross-device identity key and is persisted to the Sheet.
- `synced: false` = a local add not yet on the backend. `seeded` is just a marker
  (for the Debug tile count); seeded entries sync like any other. Seeding is only
  available in debug-backend mode, so fake data only ever lands on the debug Sheet.
- `attempted: true` = this entry has been sent (or re-marked unsynced), so a
  re-push must **upsert** (idempotent), not append. Absent on brand-new saves,
  which take the O(1) append fast path. See Sync below.
- More localStorage keys: `eggo-pending-deletes` (ids of synced entries deleted
  locally, awaiting a backend delete — a tombstone queue), `eggo-last-pull` (ISO
  time of the last successful pull), and `eggo-debug-backend` (`'true'` routes
  sync to `DEBUG_APPS_SCRIPT_URL`; only ever set via the dev Debug tab).
- **Sheet schema** (row 1 = header): `[id, timestamp, weight, color, chicken]`.
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
  (deploy workflow in `.github/workflows/deploy.yml`). Vite `base: '/eggo/'`
  (the Pages sub-path; required absolute for the PWA service-worker scope).
- **PWA** (`vite-plugin-pwa`, configured in `vite.config.js`): installable +
  offline. Manifest (name/icons/standalone/cream theme) + a Workbox service
  worker that precaches the app shell with `registerType: 'autoUpdate'` (new
  deploys take over on next load). Icons + `apple-touch-icon` live in `public/`
  (generated from the egg shape). **SW needs a secure context** — it does NOT
  register on the plain-HTTP LAN dev URL; test PWA via `npm run preview`
  (localhost) or the live HTTPS site. Offline *sync* was already handled by the
  localStorage queue; the SW just makes the shell load offline.
- **Storage:** a Google Sheet. The static site POSTs to a **Google Apps Script
  web app** (`apps-script/Code.js`) attached to the Sheet — the Sheets API can't
  take anonymous writes and OAuth can't be embedded in a public page. Reads can
  be public-sheet or via the same script. The script handles `doGet` (all rows as
  objects), `doPost` `append` (new rows, no id-scan — O(1) regardless of sheet
  size), `batch` upsert-by-id (idempotent — for resends/retries), single
  upsert-by-id, `{action:'delete', id}`, and `{action:'clear'}`.
- Offline-friendly: entries queue locally and sync when the endpoint is reachable.

### Sync (`src/sync.js`)

Local-first and quiet. `storage.js` is the local primitive layer; `sync.js` owns
the network and the merge.

- **Save is instant:** `saveEgg`/`deleteEgg` write localStorage and fire
  `flush()` without awaiting — the Save button never blocks on the network.
- **`flush()`** pushes every `synced:false` entry — brand-new ones via the O(1)
  `append` path, anything `attempted` (a retry or debug re-sync) via idempotent
  upsert — then drains the `pending-deletes` tombstones; serialized so overlapping
  triggers can't double-run. It marks entries `attempted` (and persists) *before*
  the network call, so a lost response can't cause a duplicate append on retry.
  Flag updates after the network merge by **id** into the *current* stored entries
  (`setFlags`), never a stale whole-array write — otherwise a save landing during
  a flush's await would be clobbered and lost (the rapid-add race). **`pull()`**
  GETs all rows, runs the pure **`reconcile()`**, persists,
  then flushes. Triggers: app load, `online`, and `visibilitychange`.
- **`reconcile(local, remote, pendingDeletes)`** is the pure, unit-tested core.
  **Backend is the shared source of truth:** a previously-synced entry missing
  from the backend was deleted elsewhere → dropped locally (deletes propagate).
  Never-synced local entries are always kept + pushed; `seeded` entries pass
  through untouched. Entries are treated as immutable (no edit feature), so an id
  in both sides is identical — no field-level conflict resolution.

### Managing the Apps Script (clasp)

The bound script is managed with **clasp** (devDependency), so its source lives
in `apps-script/Code.js` and can be deployed from the CLI — no manual paste.

- `apps-script/.clasp.json` (gitignored — has the script ID) points clasp at the
  project; auth lives in `~/.clasprc.json` (one-time `npx clasp login`).
- Workflow, run from `apps-script/`: edit `Code.js` → `npx clasp push -f` →
  `npx clasp deploy -i <deploymentId> -d "<desc>"`.
- **Always redeploy into the existing deployment ID** (the one embedded in
  `APPS_SCRIPT_URL` — list with `npx clasp list-deployments`, it's the `eggo`
  one, not `@HEAD`). A bare `clasp deploy` mints a **new** URL and breaks the app.
- `appsscript.json` is the pulled manifest (`ANYONE_ANONYMOUS` web app); don't
  hand-edit unless changing deployment settings.

**Two backends.** Production (the real Sheet, `APPS_SCRIPT_URL`) and a throwaway
**debug** Sheet (`DEBUG_APPS_SCRIPT_URL`) used by e2e tests + the Debug-tab
toggle. Both run the *same* `apps-script/Code.js`: `apps-script-debug/.clasp.json`
(gitignored) points a second script id at `rootDir: ../apps-script`, so to ship
to debug: `cd apps-script-debug && npx clasp push -f && npx clasp deploy -i <id>`.
A brand-new script's web app returns "access denied" until its owner authorizes
it once in the editor and publishes it with "Anyone" access (clasp can't grant
the anonymous-execution consent).

## Commands

- `npm run dev` — Vite dev server, binds to LAN (`--host`).
- `npm run build` — prod build to `dist/`.
- `npm test` — pure unit tests (Node's built-in `node:test`, zero deps), mainly
  `reconcile()` (`test/unit/`). Fast, no network.
- `npm run test:e2e` — sync round-trip against the **debug** backend (`test/e2e/`,
  via `DEBUG_APPS_SCRIPT_URL` + the debug-backend flag). Destructive to the debug
  Sheet only — production is never touched.

## Development workflow

- Dev on a Windows desktop; testing on a phone over the LAN.
- On dev start, **detect the current local IPv4** (`Get-NetIPAddress`, the Wi-Fi
  adapter — not VirtualBox/Hyper-V virtuals) and give the user the exact
  `http://<ip>:5173/eggo/` URL (note the `/eggo/` sub-path — vite `base`).
- **Never write the local IP (or any machine-specific detail) into a git-tracked
  file.** This repo is public. Detect fresh each session (DHCP changes it).
  Machine-specific notes go in `CLAUDE.local.md` (gitignored), as is
  `.claude/settings.local.json`.

## Verifying changes

- **Pushing to `main` auto-deploys to the live public site** (`deploy.yml`). Gate
  it: `npm test` (+ `npm run test:e2e` for sync changes) and the ui-review skill
  before pushing. Commit/push only when the user asks.
- After any UI change (styles, layout, markup, charts), run the **ui-review**
  skill (`.claude/skills/ui-review`) before committing — screenshot-driven
  regression review across states and viewports.
- After changing user-facing behavior, verify by driving the real app in a
  headless browser — don't stop at "the build passed."
- **Test via the LAN IP URL (`http://<detected-ip>:5173/eggo/`), never localhost.**
  localhost is a secure context and the LAN IP is not; localhost masks bugs that
  only appear on the phone (e.g. `crypto.randomUUID` is undefined in insecure
  contexts and silently broke saving — hence `uid()`). Exception: **PWA/service
  worker** needs a secure context, so it can't be tested on the LAN IP — use
  `npm run preview` (localhost) or the live HTTPS site for that.
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
keyboard-free weight picker, stats + charts, click-to-filter, bulk import (Debug
tab + a Log-tab import panel). Backend live + clasp-managed from `apps-script/`.
**Two-way background sync** done: instant local save (O(1) append fast path),
load-from-backend on new devices, id-keyed reconcile with deletes propagating
(backend = shared truth), sync indicator + toast, **pull-to-refresh**, debug
divergence tools, unit + live-Sheet e2e tests. **Shipped:** public repo
`davidtorosyan/eggo`, deployed to GitHub Pages via `deploy.yml` — live at
https://www.davidtorosyan.com/eggo/ (custom domain; vite `base: '/eggo/'`).
**PWA done:** installable (manifest + icons) + offline (Workbox SW) via
`vite-plugin-pwa`.
**Push notifications done:** logging an egg on one device notifies the others
(OneSignal). See the shipped section below.

### Cross-device push notifications (SHIPPED 2026-06-14)

Logging an egg on one device pushes the other devices ("🥚 A new … egg was
logged"). Built on **OneSignal** (managed push). How it works:

- **Client** (`src/push.js`): loads the OneSignal page SDK (reusing our SW), an
  opt-in flow (`enableNotifications` — prompts, subscribes, tags the device
  `device=<deviceId>`), and `notifyNewEgg(entry)` — a best-effort
  `{action:'notify'}` POST fired **only from the live-save path** in `log-view.js`
  (never imports/backlog/undo/sync). The opt-in UI is a section at the bottom of
  the Log view; the **Enable** button shows on desktop/Android, while iOS shows an
  "add to home screen first" hint (`needsInstall`).
- **Service worker** (`src/sw.js`): `vite-plugin-pwa` runs in **`injectManifest`**
  mode building a **classic/iife** SW (`injectManifest.rollupFormat: 'iife'`, so
  `importScripts` works) that pulls in OneSignal's worker for push/display +
  Workbox precaching — one SW, one scope.
- **Backend** (`apps-script/Code.js` `notify_`): on `action:'notify'`, posts to
  the OneSignal REST API, **targeting by the `device != sender` tag filter alone**
  (not a segment — see gotcha) so it reaches all subscribers and excludes the
  logging device. Gated on the `ONESIGNAL_API_KEY` + `ONESIGNAL_APP_ID` **Script
  Properties** (prod only → the debug backend's `doPost` is a silent no-op).
- **Secrets:** the OneSignal **App ID** is public (`config.js`). The **REST API
  key** lives only in the prod Apps Script's Script Properties, never committed.

**Two gotchas that bit during setup** (avoid re-discovering):
- OneSignal's `"Subscribed Users"` segment resolves **empty** here (newer
  subscription model), and mixing `included_segments` with `filters` fails the
  whole send — hence filter-only targeting.
- The web app needs the **`script.external_request`** OAuth scope for
  `UrlFetchApp`. `authorize()` touches `UrlFetchApp` so a single Run ▸ authorize
  grants it; a fresh script must Allow the "connect to an external service" prompt.

Debugging tip: POST to the prod `/exec` with **Node `fetch`** (curl mishandles
Apps Script's 302 POST redirect). `sent:1` = fired; `sent:0` = gate failed
(missing props or `UrlFetchApp` threw). A dev-only "Send test push" lives on the
Debug tab.

#### Original plan / alternatives considered (kept for reference)

Goal: when an egg is logged on one device, **notify the other devices** ("a new
egg was logged"). Leaning toward **OneSignal** (managed push).

- **Why a service is needed:** the Sheet + Apps Script backend can't *send* Web
  Push itself — VAPID needs ES256/ECDSA signing + RFC 8291 payload encryption,
  which Apps Script's crypto utilities don't support. So a sender is required.
- **Chosen direction — OneSignal (Path A):** it handles VAPID/encryption/iOS
  delivery; triggering a send is just an authenticated HTTPS POST, which Apps
  Script *can* do. Flow: `doPost` (already sees every new row) → `UrlFetchApp`
  POST to OneSignal's REST API → OneSignal pushes the other devices. (Alt
  considered — Path B: a self-hosted Cloudflare Worker holding VAPID keys; no
  third party, more to build.)
- **Secrets (this repo is public!):** OneSignal **REST API key** lives in Apps
  Script **Script Properties**, never committed. The OneSignal **App ID** is
  public (client-side, fine). No secrets in the repo.
- **Moving parts to build:**
  - An opt-in **"Enable notifications"** control — iOS requires a *user tap* to
    prompt, and push only works on the **installed** PWA.
  - A **`push` + `notificationclick` handler in the service worker** → switch
    `vite-plugin-pwa` from `generateSW` to **`injectManifest`** (write our own SW:
    keep `precacheAndRoute(self.__WB_MANIFEST)`, add the handlers, import
    OneSignal's worker via `importScripts`). Watch for SW scope conflicts.
  - **Trigger scoping / edge cases:** notify only on *real-time* adds. A device
    coming online with a backlog of unsynced eggs (or a bulk import) would else
    fire "50 eggs added" — ignore backlog/imports, debounce, and exclude the
    sender. Wire on **prod only** (the debug backend's `doPost` must not notify).
  - Subscriptions are managed by OneSignal (no Sheet tab needed).
- **iOS caveats:** installed PWA + iOS 16.4+ (user's iPhone is fine); delivery is
  best-effort (can be delayed/coalesced; Apple may drop subscriptions).
- Worth weighing the effort vs payoff for a ~2-device household before building.

### Known considerations / follow-ups (none blocking)

- **Public anonymous-write exposure:** `config.js` ships the live `/exec` URLs and
  `doPost` accepts anonymous `append`/`delete`/`clear` — anyone with the URL could
  write to or wipe the prod Sheet. Fine for a backyard tracker; if it matters, add
  a **shared-secret token** the client sends and the script checks (token in
  Script Properties + a build-time client env, kept out of committed source).
- **`deploy.yml` runs Node-20 actions**, which GitHub is deprecating (forces Node
  24 from 2026-06-16). Bump `actions/*` versions when convenient.
- **Dedicated test Sheet + second deployment** so `test:e2e` stops clobbering real
  data once real eggs accumulate (today it targets the throwaway debug Sheet).
- Deferred: a shared **`test/browser/` launcher** so ui-review + DOM checks reuse
  one puppeteer harness instead of ad-hoc temp-dir scripts ("maybe later").

Skipped: QR code on dev start, CSV export.
