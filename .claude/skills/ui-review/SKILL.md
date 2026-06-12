---
name: ui-review
description: Screenshot-driven UI regression review for Eggo. Invoke after ANY change to styles, layout, view markup, or charts — before committing — to catch visual regressions. Captures the app in headless Edge across states and viewports, then reviews against the polish checklist.
---

# Eggo UI review

Capture the running app in a headless browser, look at the screenshots, and
review them against the checklist. The verdict is based on what the pixels
show, not what the CSS says.

## Setup

1. Dev server must be running (`npm run dev`, binds to the LAN).
2. Detect the machine's current local IPv4 (`Get-NetIPAddress`, the Wi-Fi or
   Ethernet adapter — not VirtualBox/Hyper-V virtual ones). Always test via
   `http://<lan-ip>:5173`, **never localhost** (secure-context differences
   mask phone-only bugs; see CLAUDE.md).
3. Driver: `npm install puppeteer-core` in a temp dir **outside this repo**
   (e.g. `$env:TEMP\eggo-verify`), launching system Edge:
   `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
   `headless: 'new'`. Attach `pageerror` and console-error listeners; any
   error is an automatic finding.

## States to capture

Wipe localStorage first so runs are deterministic. Capture at **390×844**
(primary phone) unless noted:

1. Log view, empty (no data)
2. Debug tab after seeding (`#d-seed` button)
3. Log view with history + a just-saved entry (status/undo pill visible)
4. Log view with an armed delete ("Sure?" state) and a selected weight
5. Stats view, `fullPage: true`
6. Log view at **320×640** (small phone)
7. Log view at **1280×800** (desktop)

Clean up: `localStorage.clear()` before closing the browser.

## Checklist

Read every screenshot with the Read tool and check:

- **No horizontal overflow at any viewport** — nothing cut off at 320px;
  no sideways scroll. (Regression watch: the header/tabs row.)
- **Placeholders can't be mistaken for values** (the big weight field).
- **No layout shift from state changes** — armed delete, status pill
  appearing, tab switches.
- **Touch targets ≥ ~44px** for destructive or frequent controls.
- **Charts**: time ranges labeled (· last 14 days / · all time), axes
  readable, nothing clipped at phone width.
- **Contrast**: soft-ink text on cream still legible in screenshots.
- **Visual consistency**: radius, spacing rhythm, the warm palette
  (cream/brown/amber) — new UI should look like it belongs.
- Zero `pageerror` / console errors during the run.

## Report

Short verdict (PASS / issues found) + per-screenshot notes, prioritized:
real bugs → polish → nits. Send the most informative screenshots to the
user with SendUserFile. Fix real bugs before committing the UI change;
list nits for the user to decide.
