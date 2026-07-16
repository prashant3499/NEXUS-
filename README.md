# NEXUS — Final Bundle  (v3.0.0)

> **New here? Open `START-HERE.md` first** — it is the single guide that answers everything (run, operate, deploy, go live).

**The trust & compliance engine for India's craft economy.**
A status-aware Merchant-of-Record platform that lets undocumented artisans trade globally —
verified, compliant, paid fast — across handicraft, textiles, jewellery, gems, naturals,
experiences/tourism, with Exim and B2B2C built in. AI-operated, founder-in-the-loop.

This bundle is the complete project as of this date. Save it; it is self-contained.

---

## What's in here

```
nexus-final/
├── README.md                ← you are here
├── website/
│   ├── nexus-app.html        ← THE website (single self-contained file, all verticals, EN+HI)
│   └── nexus-design-directions.html  ← the 3 design directions (Atelier/Bazaar/Bharat)
├── deploy/                   ← ready-to-drag deploy bundle (index.html + host configs + guides)
├── backend/                  ← the full SaaS (Node, zero dependencies)
│   ├── server.js             ← entry point  (node server.js → http://localhost:4100)
│   ├── src/                  ← 104 modules (engine, MoR, agents, 10 AI CXOs, government, security)
│   ├── public/index.html     ← the live SPA (founder cockpit incl. daily briefing)
│   ├── test*.js              ← 102 test suites (~3,930 tests, 0 real failures)
│   ├── Dockerfile, render.yaml, fly.toml, Procfile  ← deploy configs
│   └── DATA-LAYER.md         ← relational/vector/cloud-storage state & go-live switch
├── presentations/
│   ├── NEXUS-Founder-Deck.pptx   ← 12 slides, full story, EN+HI speaker notes
│   ├── NEXUS-Investor-Deck.pptx  ← 8 slides, tight investor cut, EN+HI notes
│   └── NEXUS-Join-Us-Deck.pptx   ← 10 slides, warm customer/partner "join us", EN+HI notes
├── docs/
│   ├── NEXUS-Investor-Plan.md
│   ├── DEPLOY-TODAY.md       ← step-by-step: deploy to every channel today
│   ├── DEPLOY.md / DEPLOY-FREE.md
│   └── DATA-LAYER.md
└── build-scripts/            ← python-pptx generators for the three decks
```

## Run the website (instant)
Open `website/nexus-app.html` in any browser. No server needed.

## Run the desktop app (single-click, own window, app icon)
The real founder operating app lives in `desktop/`. Build it once on your laptop:
```bash
cd desktop && npm install && npm run dist
```
→ produces an installer in `desktop/dist/` (Windows .exe creates a desktop icon automatically;
macOS .dmg; Linux .AppImage). The built app bundles Node — nothing else to install — boots the
engine in mock-safe mode and opens the cockpit in its own window. Details: `desktop/BUILD.md`.
No-build path: run `desktop/make-icon-{linux.sh,windows.bat,mac.command}` to drop a desktop icon now.

## Run the backend (2 commands)
```bash
cd backend
node server.js            # http://localhost:4100  (safe mock mode)
```
Health: `curl localhost:4100/health` → `{"status":"ok"}`.
Daily founder briefing: `curl localhost:4100/api/founder/daily-briefing`.

## Run the tests
```bash
cd backend && npm test          # ~3,930 tests across 102 suites
```
(Note: `test-api-routes.js` can flake on a port collision in the full batch; it passes 170/0 run alone.)

## Deploy (free, ~2 min for the site)
- Website: drag `deploy/` onto Netlify Drop / Cloudflare Pages / Vercel / GitHub Pages.
- Backend: Render (`render.yaml`) / Fly.io (`fly.toml`) / Railway (`Procfile`).
- Full runbook: `docs/DEPLOY-TODAY.md`.

## Honest stage (read this)
Everything here is **built and tested**. What is deliberately **not** live, and why the platform
refuses to take real money until they exist:
1. A real payment / payout rail
2. Real KYC (DigiLocker / UIDAI)
3. A lawyer + CA sign-off on the Merchant-of-Record + TCS model
4. Cloud object storage + real product photos (currently emoji placeholders)
5. Postgres for production (adapter ready; needs `pg` + `DATABASE_URL`)
6. A first pilot with real makers — the true gap

The `productionGuard` enforces #1–#3 and #5 in code: it will not boot in production until
`NODE_ENV=production` + rotated secrets + `DATABASE_URL` + `PAYMENTS_PROVIDER=razorpay` +
`COMPLIANCE_CONFIRMED=true`. Deploy the demo freely today; production is the gated next step.

## Hard invariants (cannot be overridden, even by the founder)
Never-in-loss · consent-before-sale · child-safety · no-fabrication · honest-stage.

---
*Built as a solo-founder, AI-operated platform. The engine is real; the business begins with one pilot.*
