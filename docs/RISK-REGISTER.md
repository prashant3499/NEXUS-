# NEXUS — Money-Loss, Rate-Limit & Security Risk Register

Every factor that can lose money or breach security, with honest status.
✅ protected in code · 🔶 partial (deploy/policy work) · ⬜ gap to close.

## A. Money-loss — structural (business model)
| Risk | Status | Protection / action |
|---|---|---|
| Paying a maker more than collected | ✅ | `slicer` never-in-loss: payout ≤ collected; fee floor 2% / ceiling 30% (tested) |
| Holding funds (float/escrow risk) | ✅ | zero-float — payment split at the gateway; NEXUS never holds the money |
| Fee below true cost (Razorpay 2%+GST, LLM, payouts) | 🔶 | real gross ~9–10% not 12% — hold pricing discipline; model per order |
| Refunds / returns | ✅ | `returns.js` (windows, `computeRefund`) + `payments.js`/`razorpayProvider.js` refund |
| Chargeback liability (who bears it) | 🔶 | refund logic exists; set a chargeback *policy* + Razorpay dispute flow |
| FX / currency on international sales | 🔶 | handle conversion + settlement currency at payment integration |
| Subscription churn / unpaid dues | 🔶 | tiers modeled; add dunning/retries at billing integration |

## B. Money-loss — operational
| Risk | Status | Protection |
|---|---|---|
| Wrong/large payout | ✅ | HITL `payout_large` gate — human approval above threshold |
| Fraud / collusion / fake orders | ✅ | `fraudDetection` (7 modules) + `fraud_score` HITL gate |
| Large price change error | ✅ | HITL `price_change_large` gate |
| Vendor cost overrun (LLM/ads) | ✅ | LLM `API_MONTHLY_CAP_PAISE` (₹30k default) + ad-budget hard caps + agent `budgetCap` |
| Manual/agent error | ✅ | HITL gates + change-control refuses invariant-threatening changes |
| Reconciliation drift | 🔶 | payments/returns modules; run real reconciliation at go-live |
| Downtime → lost sales | 🔶 | add uptime monitoring + alerts at deploy |
| DPDP breach penalty (up to ₹250 cr) | ✅/🔶 | encryption + consent + data rights in code; + security ops at deploy |

## C. Money-loss — functional (code)
| Risk | Status | Protection |
|---|---|---|
| Double charge / double payout | ✅ | **NEW `idempotency.js`** — one op per key; duplicates blocked (7 tests) |
| Fee/split rounding error | ✅ | `slicer` paisa-level math, tested (profit-guard 54/0) |
| Negative / overflow amounts | ✅ | `sanitize.sanitizeNumber` clamps; validation across 27 modules |
| Race conditions (concurrent writes) | 🔶 | single-process now; use DB transactions on Postgres at deploy |

## D. Rate limiting — the kinds, and what's in place
| Kind | Status | Where |
|---|---|---|
| API request rate limit (per-IP, HTTP 429) | ✅ | `server.js` `RATE_LIMIT` (on in prod; per `x-forwarded` IP) |
| LLM / AI monthly spend cap | ✅ | `API_MONTHLY_CAP_PAISE` (₹30,000 default) |
| Ad/campaign budget hard cap | ✅ | `adGeneration` hardCap + guarded spend |
| HITL financial gates (spend limits) | ✅ | `hitl.js` payout/price/fraud thresholds |
| Auth brute-force / login-attempt lockout | ⬜ | add lockout + backoff when the real IdP is wired |
| Webhook replay / rate | 🔶 | HMAC signature verified (`auth.js`); add a replay/nonce window |
| Per-endpoint / burst tiers | 🔶 | one global limiter now; tier by endpoint at scale |

## E. Security & cybersecurity — loss vectors
| Threat | Status | Protection |
|---|---|---|
| Forged payment webhook (fake "paid") | ✅ | HMAC signature verification + `WEBHOOK_SECRET` |
| Secret leak → key abuse / fund theft | ✅ | secrets env-only, never client/prompt; `productionGuard` blocks default secrets; + secrets manager at deploy |
| Injection (SQL/HTML/command) | ✅ | `sanitize` + validation; parameterised store access on Postgres |
| PII breach | ✅ | AES-256-GCM at rest (`dataCrypto`), minimization, DPDP rights |
| Auth bypass → unauthorized action | 🔶 | tokens + `agentAuthority` now; add real IdP + **MFA** + brute-force lockout |
| Supply-chain compromise | ✅ | **zero npm dependencies** — no third-party code to exploit |
| DDoS → downtime + cost | 🔶 | app rate limit ✅; add WAF/DDoS (Cloudflare) at host |
| Data exfiltration | ✅ | encryption + authz + no bulk export path |
| Prohibited/illegal listings → legal loss | ✅ | `contentPolicy` screening + notice-and-takedown |

## Top items to close before real money (prioritised)
```
P0  Idempotency on live charge/payout (module ready → wire into Razorpay calls)
P0  Real IdP + MFA + login lockout; secrets manager; WAF/DDoS at host
P0  Reconciliation job (payments vs payouts) + chargeback policy
P1  FX/currency handling; monitoring + alerts; webhook replay window; per-endpoint rate tiers
```

## Honest bottom line
The **business-logic money guards are strong and tested** — never-in-loss, HITL gates, cost caps,
fraud, refunds, and now idempotency. The **residual money/security risk is concentrated at the
live edges** (auth/MFA, WAF/DDoS, reconciliation, FX, chargebacks) — standard integration + policy
work, not missing core logic. And the HITL design means that when something *does* go wrong, it
tends to **pause or hold rather than pay out** — the fail-safe posture is your best protection
against loss while the edges get hardened.
