# NEXUS Unified Core

EcoVenture and NEXUS, reconciled into ONE tested engine. After correcting NEXUS's
fatal "pure-intermediary-only" flaw, both converged on the same truth: a
**status-aware** platform. This is that platform's proven core. Zero dependencies.

```bash
node test.js           # 27 tests — full lifecycle, all pass
node test-selector.js  # 32 tests — 15 legal edge cases, all pass
```

## The five reconciled modules

| Module | What it does | Origin |
|--------|-------------|--------|
| `selector.js` | Assigns the right legal model per customer — MoR for the undocumented, SaaS for the registered, agent for tourism, umbrella for cooperatives. 15 edge cases. | EcoVenture (best) |
| `slicer.js` | Divides every transaction in integer paise — zero rounding drift across 10,000 txns. TCS, TDS, GST correct. | EcoVenture (best) |
| `hitl.js` | Routes risk to humans, immutable audit, learns from overrides, two-person sign-off. | EcoVenture (best) |
| `costEngine.js` | **Phase-aware** spend guard (carve-out at cold start, then 2% ceiling) + cheapest-first inference router (Bhashini → GPU → capped API) + self-proposing optimisations. | NEXUS (best idea, refined) |
| `tourism.js` | Risk-stratified booking with hard KYC link (HIGH risk ⇒ tier ≥ 2) + operator-bound insurance (platform never fronts premium). | NEXUS (fixes F1, F9) |

`platform.js` wires all five into one onboard → list → order → book lifecycle.

## What was discarded (and why)
- NEXUS "pure-intermediary-only" — structurally excluded undocumented artisans. Fatal.
- Blockchain anchor — cost + DPDP erasure conflict, no benefit over a signed append-only log.
- Duplicate selector v1 — superseded by the 15-edge-case version.

## The reconciled truth
One platform. Status-aware. It serves the illiterate village weaver (Merchant of
Record, zero liability) AND the ₹2Cr registered exporter (SaaS, keeps own identity)
AND the cooperative (umbrella) AND the tourism operator (agent) — each with the
correct legal structure, decided automatically at onboarding. Verified, not claimed.

## Now runnable as an application

The proven core is now operable, not just a library:

```bash
node demo.js     # one-command end-to-end scenario
node server.js   # HTTP API on :4100, file-persisted
npm test         # 59 tests (27 lifecycle + 32 edge cases)
```

- `server.js` — HTTP API (Node built-in `http`, zero deps) exposing onboard → list → order → book.
- `src/store.js` — atomic file persistence; data survives restarts (verified). Swap for PostgreSQL in production; interface is identical.
- `demo.js` — runs the full status-aware lifecycle and prints what happened.

### Verified working
- Undocumented artisan → Merchant of Record, zero liability, paid on export
- Registered exporter → SaaS, keeps own seller-of-record status
- T0 guest blocked from high-risk adventure, allowed for cultural (hard KYC link)
- Cold-start spend allowed from carve-out (not frozen by 2%-of-₹0)
- All state persisted to disk and re-read after a server restart

## Payments — UPI + Card (v1.2)

Real payment capture with **Razorpay Route split-settlement**, so the platform
never holds float — funds split at the gateway directly to linked accounts.

```bash
node test-payments.js   # 20 payment tests — all pass
```

- `src/payments.js` — gateway abstraction. UPI (VPA/QR/intent) + card (tokenized, PCI-safe).
  State machine: created → authorized → captured → split → settled. Idempotency keys prevent
  double-charge. HMAC-SHA256 webhook verification. Mock provider for tests; Razorpay/Cashfree
  adapters plug in at the same interface.
- `processOrder(productId, { paymentMethod: 'upi'|'card', authPayload })` runs the full cycle.
- Server: `POST /orders` with a `paymentMethod`, `GET /payment-methods` lists support.

### Verified
- UPI: VPA-authorized, captured, Route-split, settled — artisan receives their net directly
- Card: tokenized only (raw PAN rejected — PCI scope stays at gateway)
- Split always sums exactly to the captured amount (gateway rejects mismatches)
- Idempotency: replaying a charge returns the same payment, never double-charges
- State machine blocks invalid transitions (e.g. settle-before-capture)
- Webhook signatures verified (forged signatures rejected)
- `float_held_by_platform: false` by construction — the split happens at the gateway

Total test count: **79** (27 lifecycle + 32 edge cases + 20 payments).

## The interface — a usable product (v1.3)

`public/index.html` — a single self-contained web app (zero build, zero deps).
It runs standalone with an in-browser engine that mirrors the backend exactly,
and automatically upgrades to the live API when `server.js` is running.

```bash
node server.js        # serves the UI at http://localhost:4100 + API at /api
# or just open public/index.html directly — it works in demo mode
```

Five views, accessibility-minded, phone-friendly, warm craft aesthetic:
- **Home** — the thesis
- **Sell** — onboard a seller (tap their situation → see the assigned legal model + their zero liability), then list a product
- **Checkout** — take a UPI or card order, watch the live gateway split bar
- **Tourism** — risk-stratified booking; high-risk blocked below KYC tier 2
- **Founder** — live console: models in use, cost phase, recent orders

The UI's in-browser engine was verified headlessly to produce the same model
assignments and the same penny-exact slice as the tested backend.

## Full stack, one folder
```
public/index.html   the usable UI (standalone or live)
server.js           serves UI + JSON API, file-persisted
src/                the proven engine (7 modules)
test*.js            79 tests, all passing
demo.js             one-command lifecycle demo
```

## Agents + verticals wired live (v1.5)

The 6-agent pipeline and 5 verticals are no longer isolated modules — they run
inside the live platform, server, and UI.

```bash
node test-wiring.js   # 15 tests proving agents + verticals execute in the platform
```

- **Listing** runs through the Sourcing + Commerce agents and validates against the
  chosen vertical's attribute schema; missing fields route to review automatically.
- **Ordering** runs the Finance → Compliance → Logistics agents, each emitting its
  autonomy tier; the order's `agent_trace` shows exactly what ran auto vs. needed a human.
- **Compliance** always escalates government submissions (e.g. exports) to a human.
- New endpoints: `GET /verticals`, `GET /pipeline`.
- The UI's Sell view has a vertical picker; Checkout shows the live agent trace
  (🤖 auto vs 🙋 human) beside the payment split.

**Test total: 115** (27 lifecycle + 32 selector + 20 payments + 21 engine + 15 wiring).
