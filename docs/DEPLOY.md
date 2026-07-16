# NEXUS — Deploy & Test Guide

The website is a **single self-contained file** (`index.html`). No build step, no server, no
database, no API keys, no browser storage. It runs anywhere that can serve a static file.

## Test locally (right now)
- Just open `index.html` in any browser, **or**
- Serve it: `python3 -m http.server 8080` then visit `http://localhost:8080`

## Deploy live in ~2 minutes (pick one)
All of these take a single file or folder — drag-and-drop the `deploy/` folder:
- **Netlify Drop** — netlify.com/drop → drag the `deploy` folder → live URL instantly
- **Vercel** — `vercel deploy` in the `deploy` folder
- **Cloudflare Pages** — connect a repo or upload the folder
- **GitHub Pages** — push `index.html` to a repo, enable Pages
- **Any static host / S3 / Nginx** — copy `index.html` to the web root

No environment variables are needed for the website itself.

## Modify
Everything lives in `index.html`:
- **Products / makers / reviews / categories / plans** → the data blocks near the top of `<script>` (`PRODUCTS`, `MAKERS`, `COLLECTIONS`, `CATS`, `PLANS`)
- **All copy (English + Hindi)** → the `STR` dictionary (`en` / `hi`) — keep both in parity
- **Look & feel** → the single `<style>` block (design tokens at `:root`)
- **Pricing / fee** → `CFG` (taxes) and the founder cockpit fee slider; plan prices in `PLANS`

## The full SaaS backend (separate, for later)
The real platform (`../nexus-unified/`) has `Dockerfile` + `docker-compose.yml`:
- **Test locally:** `cd nexus-unified && docker compose up` (or `node server.js`)
- **Not production-ready yet — by design.** `productionGuard` refuses a production boot until there is a real `DATABASE_URL`, a strong `ENCRYPTION_KEY`, `COMPLIANCE_CONFIRMED=true`, and real (non-mock) payment credentials. That is the never-ship-unsafe guardrail, not a bug.

## Honest note
This static site is ready to host for **testing and demos** today. Going to *production* as a
real business still needs the three things no amount of code provides: a payment/KYC rail,
a lawyer's sign-off on the Merchant-of-Record + TCS model, and a pilot. The website is ready;
the business steps are the gate.
