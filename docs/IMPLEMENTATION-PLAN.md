# NEXUS — Implementation Plan (90 days, validation-first)

Principle: the engine is code-complete and verified (4,057 tests / 0 fail). The plan spends
effort on **proof and the live spine**, not new features. Feature freeze holds except P0.

## Phase 0 — Ship the demo (Week 1) — ₹0
- Fix Render start command → `node backend/server.js`; verify `/health`.
- Netlify Drop the `deploy/` folder → public site URL.
- Push repo with `.github/workflows/ci.yml` → CI live on every push; enable Render auto-deploy.
- Watch `/api/feedback?view=summary` + `/api/founder/monitoring`.

## Phase 1 — Legal + accounts (Weeks 1–3, parallel)
- Register entity (LLP/Pvt Ltd) + GST + PAN + bank.  ← unlocks everything
- Brief lawyer/CA: MoR + TCS model, privacy policy, terms, grievance officer.
- Open: Razorpay, Neon/Supabase Postgres, Clerk (OTP), Gupshup/Twilio (WhatsApp), Resend, Sentry.
- Quick trademark search: "NEXUS" classes 35/42.

## Phase 2 — P0 live spine (Weeks 3–6, the only build work)
Order: auth (OTP) → Postgres (schema in BACKEND-SCHEMA.md; migrate repository) → Razorpay live
(wire idempotency into charge/payout; webhook HMAC; reconciliation job) → WhatsApp/email
notifications (order, payout, OTP). Each lands behind existing seams; CI must stay green.
Then: rotate all secrets, set ENCRYPTION_KEY, publish privacy/terms, Cloudflare in front,
set COMPLIANCE_CONFIRMED=true only after lawyer signs → productionGuard opens.

## Phase 3 — One pilot cluster (Weeks 4–10, overlaps)
- Door: Rajasthan **Integrated Cluster Development Scheme** — GM DICC (Jaipur or Dausa, CFC
  districts). Offer: NEXUS as the scheme's funded e-commerce/market-development partner.
- Onboard 5–10 consented makers (SPV path), REAL PHOTOGRAPHY of makers + work.
- First real listings → first real sales → first payouts (HITL gates ON, small limits).
- Weekly loop: feedback + monitoring + orders → fix top issue → redeploy.

## Phase 4 — Read results, then decide (Weeks 10–13)
- Metrics: consented makers, live listings, first-sale rate, payout volume, NPS.
- If activation works → second cluster + ONDC fast-path listing + investor conversations
  (traction deck exists). If not → fix the funnel, not the feature list.

## Deferred until after traction (explicitly)
More verticals/agents, native apps, multi-tenancy, SOC 2, WebGL site, API marketplace.

## Owner map
Founder: entity, lawyer, DICC meeting, photography, accounts. AI co-founder (me): P0 wiring,
migrations, tests, docs, monitoring triage, weekly ops loop.
