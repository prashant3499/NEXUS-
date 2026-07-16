# START HERE — NEXUS

**The trust & compliance engine for India's craft economy.**
This document is all you need. Everything is built, tested, and packaged. Follow it in order.

---

## What you have
A complete, working platform: a status-aware **Merchant of Record** that lets undocumented
artisans trade globally — verified, compliant, paid fast — across handicraft, textiles,
jewellery, gems, naturals, experiences/tourism, with Exim and B2B2C built in. It is
**AI-operated, founder-in-the-loop**, with 10 AI CXOs and hard safety invariants.

- 105 backend modules · 102 test suites · ~3,930 tests · **0 real failures**
- Bilingual (English + Hindi) throughout · built on India's DPI · zero npm dependencies

---

## Pick your path

### A. Just look at it (0 setup)
Open `website/nexus-app.html` in any browser. The full site: landing with the audience
chooser, all verticals, shop, the shops/showrooms page, and the founder cockpit (with the
AI assistant, daily briefing, Go-Live panel, and the engine Stop/Pause control).

### B. Operate it as a desktop app (recommended)
The real founder console — its own window, app icon, bundled Node (nothing else to install).
```bash
cd desktop
npm install      # one time (needs Node only to BUILD)
npm run dist     # builds the installer for your OS → desktop/dist/
```
- Windows → run `NEXUS Setup …exe` → **desktop icon appears**.
- macOS → open the `.dmg`, drag NEXUS to Applications.
- Linux → `chmod +x` the `.AppImage` and double-click.

Launch it → it boots the engine in safe mock mode and opens your **cockpit**. Stop or restart
the engine anytime from the **Engine menu**. (Quick run without building: `npm start`.)

### C. Deploy it free on the web (~2 min)
Drag the `deploy/` folder onto **Netlify Drop** (app.netlify.com/drop), Cloudflare Pages, or
Vercel → live public URL. Backend on Render/Fly/Railway (configs included). Full steps:
`docs/DEPLOY-TODAY.md`.

---

## Operate it (your daily 15–30 min)
Open the cockpit and:
1. Read **☀ Today's Briefing** — your top priority + do-today list from the 10 AI CXOs.
2. Clear the **HITL approval queue** — large payouts, price changes, fraud flags, etc.
3. Approve **auto-corrections / change requests**.
4. **Ask the AI co-founder** anything, or instruct it (it's a conversation now).
5. Do the human "[you]" tasks (makers, cooperative, lawyer).
6. Use **Pause/Stop** to halt the engine whenever you want.

Full version: `docs/OPERATING-MANUAL.md`.

---

## Go live for real money (when you're ready)
Set these as environment variables (laptop: `backend/.env`; host: its settings panel). Same
list as the cockpit's **Go-Live Control** panel:
```
PAYMENTS_PROVIDER=razorpay   RAZORPAY_KEY_ID=…  RAZORPAY_KEY_SECRET=…  RAZORPAY_WEBHOOK_SECRET=…
STORE_DRIVER=postgres        DATABASE_URL=postgres://…        (then: npm i pg)
ANTHROPIC_API_KEY=…          (turns the demo assistant into a full LLM co-founder)
AUTH_SECRET=…  FOUNDER_TOKEN=…  WEBHOOK_SECRET=…   (rotate from dev defaults)
NODE_ENV=production
COMPLIANCE_CONFIRMED=true     ← LAST, only after a lawyer + CA sign off
```
`productionGuard` refuses to boot for real money until these are set — by design.
Details: `docs/PRE-PRODUCTION-AND-OPS.md` and `backend/DATA-LAYER.md`.

### What it costs
- **Pilot/demo:** ~₹500–2,500/month (free hosting + a little LLM). Razorpay is per-transaction (2%+GST), ₹0 upfront.
- **One-time to take real money:** ~₹40,000 lean → ~₹1–2 lakh proper (company + lawyer + CA).
- Spend on the lawyer; starve everything else with free tiers.

---

## What is DONE vs what is YOURS
**Done (in this bundle):** the entire platform — engine, money model (never-in-loss), 10 AI
CXOs, daily briefing, HITL gates + auto-correct, consent-gated sourcing, government/DPI seams,
security, the website, the cockpit with the assistant + Stop/Pause, the desktop app, three
decks, and all docs. Verified and green.

**Yours (no code can do these):**
1. A registered business entity.
2. A Razorpay account + a Postgres database.
3. A DigiLocker/KYC requester approval.
4. **A lawyer + CA sign-off** on the Merchant-of-Record + TCS model.
5. **One pilot cluster of real makers** — the single step that turns this into a business.

That's the whole truth. The software is complete. The company begins with your first pilot.

---

## Where everything is
```
README.md                  overview + folder map
START-HERE.md              this file
website/nexus-app.html     the site + cockpit (open in a browser)
deploy/                    drag-to-deploy bundle (+ host configs)
desktop/                   the installable desktop app (build with npm run dist)
backend/                   the full SaaS (node server.js → localhost:4100)
presentations/             Founder (12) · Investor (8) · Join-Us (10) decks, EN+HI notes
docs/                      operating manual, deploy-today, pre-production/ops, investor plan
```

Open the cockpit, read tomorrow's briefing, and go get one pilot cluster. That's the next move — and it's yours.
