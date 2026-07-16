# NEXUS — Deployment Guide

This is the honest, complete path from the built engine to a live business.
The software is built and tested (155 tests). Going live has **code steps**
(done / scaffolded here) and **non-code gates** (credentials + legal sign-off)
that no amount of code can substitute for.

---

## 1. Run it right now (pilot / demo — works today)

```bash
node demo.js          # full lifecycle, one command
npm test              # 155 tests across 7 suites
node server.js        # API + UI at http://localhost:4100
```

Defaults: mock payments (no real money), file persistence, demo role-switch.
Safe to show anyone. Nothing real moves.

## 2. Containerise (works today)

```bash
docker build -t nexus .
docker run -p 4100:4100 -v nexus-data:/app/data nexus
# or:
docker compose up --build
```

Health: `GET /health` · Readiness: `GET /ready` (reports what's missing for prod).

## 3. The seams for going live (scaffolded — flip via env, no code changes)

| Concern | Pilot default | Production | How to flip |
|---------|--------------|------------|-------------|
| Payments | `mock` | Razorpay Route | `PAYMENTS_PROVIDER=razorpay` + keys; `npm i razorpay` |
| Persistence | file JSON | PostgreSQL | `STORE_DRIVER=postgres` + `DATABASE_URL`; `npm i pg` |
| Auth | demo switch | JWT login | `AUTH_MODE=jwt` + `JWT_SECRET` |

Copy `.env.example` → `.env` and fill. `GET /ready` will turn green only when
the production config is complete; in `NODE_ENV=production` it returns **503**
until then, so a deploy fails loud rather than silently running in mock mode.

The Razorpay adapter (`src/razorpayProvider.js`) already implements the exact
gateway interface — it drops in at one seam. The Route split is what keeps the
platform out of the money path ("never holds float").

## 4. The non-code gates — these block real money, not code

`GET /ready` lists these. They are **mandatory** before processing a real rupee:

1. **Razorpay Route account** approved, with KYC-verified linked accounts per merchant.
2. **CA sign-off** on the Merchant-of-Record float and working-capital flow.
3. **Payments-lawyer sign-off** on the MoR seller-of-record structure + FEMA export chain.
4. **IRP (e-invoicing) + Bhashini** API credentials provisioned.
5. **DPDP-compliant** privacy policy + consent flow reviewed.

No code here can substitute for these. They are the real launch gate.

## 5. The single most valuable next step (still not code)

Before scaling anything: **message 50 Jaipur gem exporters.** If 5 will pay a
mock ₹7,999 by day 14, build forward. If 0, re-interview before more engineering.
This one data point matters more than every file in this repo.

---

## What's proven vs. what's pending

**Proven (tested, runs):** status-aware legal engine, zero-drift transaction
slicer, UPI/card payment logic with gateway-split + held-float, six-agent
pipeline, founder-in-the-loop that holds money until approval, vertical registry,
cost engine, persistence, HTTP API, three role-separated UI surfaces, container.

**Pending (needs credentials / legal / scale):** live payment rails, real DB,
real auth, and the five non-code gates above.

The engine is correct. Going live is configuration plus professional sign-off.
