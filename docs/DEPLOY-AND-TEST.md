# NEXUS — Deploy, Test with Everyone, then Make it Launch-Ready

Two modes. **Test mode** (do it now, free, no money, safe mock) lets all your stakeholders try
it. **Launch mode** (later) flips on real money. Test first, gather feedback, then modify.

## Step 1 — Deploy for testing NOW (free, ~15 min, no money)
**Website (the part testers see):**
- Drag the `deploy/` folder onto **Netlify Drop** (app.netlify.com/drop) → instant public URL.
  (Cloudflare Pages or Vercel work the same; `netlify.toml`/`vercel.json` are included.)

**Backend (the engine + APIs):**
- Push `nexus-unified/` to GitHub → **Render** → "New Web Service" → it reads `render.yaml`
  (build: none; start: `node server.js`; free tier). You get a public API URL.
- Health check: open `/health` → should return `{"status":"ok"}`.
- It boots in **development (safe mock)** mode — no real payments, no real data. Perfect for UAT.

**Founder console (optional):** run the **desktop app** locally (`cd desktop && npm install &&
npm start`) for the full cockpit, or just open `/#founder` on the deployed site.

## Step 2 — Let everyone related test it (UAT scripts)
Give each person their path and the built-in feedback link
(`/api/feedback?role=…&area=…&rating=1-5&message=…`, summary at `/api/feedback?view=summary`).

**Artisan** — tap "I'm an artisan" → open **Creative Studio**, pick a craft, get ideas → view the
maker demo (describe a product, see the payout split). *Pass:* ideas appear; payout math is clear.

**Buyer** — tap "I'm a buyer" → browse the shop → open a product → check the **provenance** and the
**"Visit where it's made"** map links → add to cart → **checkout** (demo confirmation). *Pass:*
flow completes, order confirmation shows the maker payout.

**Institution/partner** — tap "I'm an institution" → the shops/partner page → the USP list. *Pass:*
the sourcing/scheme-delivery value is clear.

**Founder** — cockpit → **Today's briefing** → ask the **AI co-founder** questions → **Pause/Stop**
the engine → review the **Go-Live** panel. *Pass:* briefing loads, assistant answers, engine
stop/pause works.

**Everyone** — switch **EN/हिंदी** on every screen; test on a phone. Submit feedback via the link.

## Step 3 — Read the feedback, fix, repeat
- `GET /api/feedback?view=summary` → counts by role/area + average rating.
- Prioritise anything rated ≤2; fix; redeploy (drag the folder / push to Render again).
- Iterate until the core flows feel obvious to real artisans and buyers.

## Step 4 — Modify to launch-ready (from mock → live money)
This is where real-world setup (not code) comes in. In order:
1. **Entity + lawyer/CA** sign-off on MoR + TCS.
2. **Accounts:** Razorpay (payments+payouts), managed Postgres (Neon/Supabase), an auth provider
   (Clerk/OTP), notifications (Gupshup/Twilio + Resend).
3. **Set production env** (host settings; template in `.env.example`):
```
NODE_ENV=production
PAYMENTS_PROVIDER=razorpay  RAZORPAY_KEY_ID=…  RAZORPAY_KEY_SECRET=…  RAZORPAY_WEBHOOK_SECRET=…
STORE_DRIVER=postgres  DATABASE_URL=postgres://…        (then: npm i pg)
AUTH_SECRET=…  FOUNDER_TOKEN=…  WEBHOOK_SECRET=…         (rotate from dev defaults)
ENCRYPTION_KEY=…            (32-byte hex/base64, for PII at rest)
ANTHROPIC_API_KEY=…  or  AI_PROVIDER=krutrim AI_API_KEY=…
COMPLIANCE_CONFIRMED=true   ← LAST, only after the lawyer signs
```
4. **Publish** privacy policy + terms + grievance-officer contact (IT Rules / DPDP).
5. **Turn on** monitoring/alerts (Sentry + Better Stack) and analytics (PostHog/Plausible).

`productionGuard` will **refuse to boot for real money** until NODE_ENV=production, secrets are
rotated, PAYMENTS_PROVIDER=razorpay, DATABASE_URL is set, and COMPLIANCE_CONFIRMED=true — so you
cannot go live unsafely by accident.

## The honest sequence
```
Today:     deploy test mode (free) → UAT with real artisans/buyers → collect feedback → fix
Then:      entity + lawyer → wire P0 (auth, Postgres, Razorpay, notifications) → set env
Go-live:   flip productionGuard → one pilot cluster, real sales, HITL gates on → monitor
```
You can do **everything up to "entity + lawyer" today, with no money** — deploy, test with everyone,
and fix what they find. That real feedback is worth more than any further feature.
