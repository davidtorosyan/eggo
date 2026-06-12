# Eggo — backyard egg tracker

A fast, mobile-first web app for logging eggs from a backyard flock of 12 chickens
(just started laying). The #1 design goal is **speed of entry**: egg in hand → phone
out → logged in seconds.

## Core flow (mobile-first)

1. Open the site on a phone
2. Enter the egg's **weight** — as frictionless as possible (numeric-keypad-friendly
   input; typical egg range is ~40–70g)
3. Pick a **color**: brown, blue, or olive
4. *(Optional, nice-to-have)* pick which **chicken** laid it
5. Hit enter/save → record is stored

## Requirements

- Polished, genuinely nice-looking UI — not a utilitarian form
- Data must be reviewable later: history, graphs, stats
- Speed of entry trumps everything else in the UX

## Architecture

- **Frontend:** static site hosted on **GitHub Pages**, built with Node
  (build step, e.g. Vite)
- **Storage:** a Google Sheet
- **Writes:** the static site POSTs to a **Google Apps Script web app** attached to
  the Sheet (the Sheets API can't accept anonymous writes from a static site, and
  OAuth credentials can't be embedded in a public page — Apps Script is the
  standard serverless workaround: free, no hosting, ~20 lines)
- **Reads:** public sheet reads (no auth) or served by the same Apps Script

## Development workflow

- Development happens on a Windows desktop, but testing happens on a phone over
  the local network.
- When starting the dev server, bind it to the LAN (e.g. Vite `--host`), then
  **detect the machine's current local IPv4 address** (e.g. via `ipconfig`) and
  tell the user the exact `http://<ip>:<port>` URL to open on their phone.
- **Never write the local IP address (or any machine-specific detail) into any
  file tracked by git.** This repo is published publicly to GitHub. Detect the IP
  fresh each session instead of recording it — it can change anyway (DHCP).
- If any machine-specific notes ever do need to persist, put them in
  `CLAUDE.local.md`, which must be gitignored.

## Verifying changes

- After any UI change (styles, layout, markup, charts), run the **ui-review**
  skill (`.claude/skills/ui-review`) before committing — screenshot-driven
  regression review across states and viewports.

- After changing user-facing behavior, verify by driving the real app in a
  headless browser — don't stop at "the build passed."
- **Test via the LAN IP URL (`http://<detected-ip>:5173`), never localhost.**
  localhost is a secure context and the LAN IP is not, so localhost masks
  bugs that only appear on the phone (e.g. `crypto.randomUUID` being
  undefined silently broke saving). Match the phone's environment: plain
  HTTP, non-localhost origin, phone-sized viewport.
- Working recipe: `npm install puppeteer-core` in a temp dir (NOT in this
  project) and launch system Edge headless
  (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`); listen
  for `pageerror`/console errors, exercise the flow end to end, screenshot,
  and clean up any test entries written to localStorage.
