# NEXUS — Pre-Production & Founder Operations

How to run NEXUS as a **pre-production, fully-functional app** — exercise the autonomous
HITL engine, correct it, and operate the whole thing as the founder from your PC.

---

## 1. Run it as a pre-production app (fully functional, safe)
Pre-production = `NODE_ENV=development`. Everything runs end-to-end — the autonomous agents,
the HITL gates, the cockpit, payouts, listings — but in **mock mode**: no real money moves,
nothing irreversible. This is exactly the mode to test and correct the engine against
real-world scenarios.

- **Start (laptop app):** double-click `start.command` (Mac) / `start.bat` (Windows), or `./start.sh`.
- Browser opens at `http://localhost:4100`. The founder cockpit is the operating console.
- It stays pre-production until you fill the PRODUCTION block in `.env` (see §4).

## 2. The autonomous HITL business engine — and how you correct it
The engine acts on its own, but **pauses for you** whenever an action crosses a line.

**The 6 HITL gates** (an action here halts and waits for founder approval):
| Gate | Fires when |
|---|---|
| `payout_large` | A payout exceeds your threshold (`HITL_FINANCE_GATE_PAISE`) |
| `price_change_large` | A price moves more than allowed |
| `fraud_score_high` | A transaction looks fraudulent |
| `supplier_contract_high` | A high-value supplier commitment |
| `gi_confidence_low` | Provenance/GI confidence is too low to claim |
| `dgtr_notification` | A trade/export filing is triggered |

**Correcting the engine (two loops, both founder-gated):**
- **Auto-correct** — the engine detects an issue, drafts a fix (`autoCorrect.plan`), and waits;
  you approve via `POST /api/auto-correct/approve` (or the cockpit). Nothing self-applies.
- **Change control** — to change rules/config, the engine `classify`s the change and checks it
  against `PROTECTED_INVARIANTS`; you approve via `POST /api/founder/change/approve`.
  A change that *threatens an invariant* (never-in-loss, consent-before-sale, child-safety,
  no-fabrication, honest-stage) is **refused** — even to you. That's the safety floor.

So the loop is: engine acts → hits a gate or finds an issue → proposes → **you correct/approve** →
it proceeds. You tune thresholds in `.env` (the `HITL_*_GATE_PAISE` values).

## 3. Operate as founder from your PC
The cockpit (Founder view) is your operating console:
- **☀ Today's briefing** — what to do today, from your 10 AI CXOs (`/api/founder/daily-briefing`).
- **Command bar, fee slider, agents, brand, Government panel.**
- **Go-Live Control** — every production requirement, with status, tap-to-track.
- Approvals for HITL gates, auto-corrections, and change requests land here for your decision.

The whole thing runs from one folder on your PC. No cloud needed to operate in pre-production.

## 4. What is needed to go from pre-production → real-world production
Set these in `.env` (or your host's env settings) — same list as the cockpit Go-Live panel:

**Accounts you must open (real-world, not just keys):**
1. A registered business entity (for Razorpay + DigiLocker + GST as Merchant of Record).
2. **Razorpay** account → `RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET`, `RAZORPAY_ROUTE_ENABLED=true`.
3. **Postgres** (Neon / Supabase / RDS) → `DATABASE_URL`, `STORE_DRIVER=postgres`, `npm i pg`.
4. **DigiLocker requester** approval for KYC (a government application process).
5. **Anthropic** API key → `ANTHROPIC_API_KEY`. (Optional now: Bhashini, Google Maps.)
6. **Lawyer + CA sign-off** on the Merchant-of-Record + TCS model.

**Then flip the switches (in this order):**
```
NODE_ENV=production
+ rotate AUTH_SECRET, FOUNDER_TOKEN, COFOUNDER_TOKEN, WEBHOOK_SECRET, JWT_SECRET
+ DATABASE_URL + STORE_DRIVER=postgres
+ PAYMENTS_PROVIDER=razorpay (+ keys)
+ COMPLIANCE_CONFIRMED=true        ← LAST, only after the lawyer signs off
```
`productionGuard` refuses to boot in production until all of these are present — so you cannot
accidentally take real money before you're legally and technically ready. That refusal is the
feature.

**Still outside the code (the real gaps):** real product photography (needs cloud storage),
and — the only one that actually matters — **one pilot cluster of real makers**.

---
*Pre-production today is genuinely useful: run it, break it, correct the engine, show it to a
partner. Production is the gated next step, and the gate is held by a lawyer's signature, not a
line of code.*
