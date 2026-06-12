# 🥚 Eggo

A fast, mobile-first egg tracker for a backyard flock. Log each egg's weight,
color (brown / blue / olive), and optionally which chicken laid it — in seconds.

- **Frontend:** static site (Vite, vanilla JS) hosted on GitHub Pages
- **Storage:** a Google Sheet, written via a Google Apps Script web app
- **Offline-friendly:** entries queue in localStorage and flush when the
  endpoint is reachable

## Development

```sh
npm install
npm run dev    # serves on the LAN (--host) for phone testing
npm run build  # production build to dist/
```

## Setup

1. Create a Google Sheet with the columns: `timestamp, weight, color, chicken`
2. In the Sheet: Extensions → Apps Script, paste in `apps-script/Code.gs`
3. Deploy → New deployment → Web app, execute as **Me**, access:
   **Anyone** — copy the web app URL
4. Put that URL in `src/config.js` (`APPS_SCRIPT_URL`)
5. Fill in your chickens' names in `src/config.js` (`CHICKENS`)

Pushing to `main` deploys to GitHub Pages via the workflow in
`.github/workflows/deploy.yml` (set Pages source to "GitHub Actions" in repo
settings).
