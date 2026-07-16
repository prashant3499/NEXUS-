# NEXUS — What Could Fail This Business Engine (failure-mode analysis)

Thinking logically about every way the engine could fail, and whether it's protected.
✅ protected · 🔶 partial · ⬜ open risk. Grouped by: can it lose money, breach trust/security,
or stop the business.

## Access separation (this session's fix)
| Failure | Status | Protection |
|---|---|---|
| Customer sees/【changes】founder data (e.g., spend cap) | ✅ | Backend: founder endpoints now `requireAuth({role:'founder'})` → 401 to customers; public endpoints stay open. Website: cockpit behind a founder passcode. Verified: founder 401, public 200, tests 3,992/0. |
| Seller sees another seller's data | ✅ | ownership checks (`requireAuth({sellerId})`) |
| Auth bypass / weak login | 🔶 | tokens + roles today; add real IdP + **MFA** + brute-force lockout at deploy |
| Secret leak → key abuse/theft | ✅ | secrets env-only, never client/prompt; `productionGuard` blocks default secrets |

## Can it lose money?
| Failure | Status | Protection |
|---|---|---|
| Pay a maker more than collected | ✅ | never-in-loss (`slicer`) |
| Double charge / double payout | ✅ | `idempotency` guard |
| Runaway AI/API spend | ✅ | founder-set cap (live) + monthly hard cap |
| Fraud / fake orders / collusion | ✅ | `fraudDetection` + HITL fraud gate |
| Chargebacks / FX losses | 🔶 | refund logic ✅; chargeback policy + FX handling at payment integration |

## Can it breach trust / safety?
| Failure | Status | Protection |
|---|---|---|
| Selling without a maker's consent | ✅ | `sellerConsent.canSell` gate |
| Fake/fabricated products, reviews, photos | ✅ | no-fabrication invariant + content-policy screening |
| Prohibited/illegal listing goes live | ✅ | screening → HITL hold + notice-and-takedown |
| PII breach | ✅ | AES-256-GCM encryption, minimization, DPDP rights |
| Harm to a minor | ✅ | child-safety invariant + `minorGuardian` |

## Can it stop / run away?
| Failure | Status | Protection |
|---|---|---|
| Autonomous engine acts wrongly | ✅ | HITL gates on money/contracts; **Stop/Pause**; change-control refuses invariant-threatening changes even from the founder |
| Bug in a module | ✅/🔶 | 3,992 tests / 0 fail; fail-safe design (faults → pause/hold); add monitoring/alerts |
| Downtime (single process, no HA) | 🔶 | add health monitoring + failover/replicas at deploy |
| Data loss | 🔶 | mock store now; managed Postgres + backups at go-live |
| LLM provider outage/instability (e.g., Krutrim) | ✅ | swappable AI layer + local fallback (no hard dependency) |

## The failures that actually threaten the business (structural)
| Risk | Status | Note |
|---|---|---|
| **No pilot / no customers** | ⬜ | the real risk — validation, not code. One pilot answers it. |
| Fee below true cost | 🔶 | real gross ~9–10%; hold pricing discipline |
| Legal exposure (MoR/TCS unsigned) | ✅/🔶 | `productionGuard` blocks live money until `COMPLIANCE_CONFIRMED=true` |
| Founder is the single point of failure | 🔶 | the honest human risk; document, and bring help post-pilot |

## The logic in one paragraph
The engine is built so that **money faults fail safe** (never-in-loss + idempotency + HITL +
founder spend cap), **trust faults are blocked at the boundary** (consent, no-fabrication,
content policy, child-safety — inviolable even by founder command), and **access faults are
gated** (founder auth + cockpit passcode). The residual technical risks are all deploy-time
(MFA, monitoring, HA, backups, WAF, chargebacks/FX) — integrations, not missing logic. The one
failure no amount of code prevents is **never running a pilot**: an unvalidated business is the
biggest failure mode of all. Everything is ready for that test; the guardrails will hold while
real use teaches you the rest.
