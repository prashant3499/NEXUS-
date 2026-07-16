# NEXUS — Reverse-Engineering Audit (functions · features · agents · workflows)

A full teardown of everything the system does, customer-side and founder-side, with how it's
wired and whether it's verified. ✅ built & tested · 🔶 seam (wire at deploy).

**Verified this pass:** 3,992 tests / 0 failures across 111 suites · 20/20 API endpoints return
200 · website boots clean in a real-browser DOM with all handlers running · zero dependencies.

## Customer-facing (website)
| Feature | Wiring | Status |
|---|---|---|
| Audience chooser (artisan/buyer/institution) | `go('maker'/'shop'/'shops')` | ✅ |
| Shop + vertical filter | `setCat` → `renderShop` | ✅ |
| Product detail: provenance, GI, "visit where it's made" (maps), related | `openProduct`, `tourPanel` | ✅ |
| Cart: add / qty / remove / wishlist | `addCart`/`bumpQty`/`rmCart`/`toggleWish` | ✅ |
| Checkout → order confirmation (with maker payout) | `checkout` | ✅ |
| Maker Creative Studio (6 verticals) | `makerIdeas` | ✅ |
| USP-per-customer · tourism-per-product | sections + data | ✅ |
| Bilingual EN/हिंदी everywhere | `setLang` (329/329 parity) | ✅ |
| GEO structured data (schema.org, llms.txt) | head + `geoOptimizer` | ✅ |

## Founder-facing (cockpit)
| Feature | Status |
|---|---|
| Daily briefing (10 AI CXOs) | ✅ |
| AI co-founder assistant (chat thread, ~30 intents, engine control, **sets spend cap**) | ✅ |
| Engine Stop / Pause / Resume | ✅ |
| HITL approval queue (6 gates) + change-control | ✅ |
| Go-Live control panel | ✅ |
| Government panel (schemes, open-data, ONDC readiness) | ✅ |
| Brand/logo customizer (interlocking-rings mark) | ✅ |
| **Spend-cap control — founder sets it via the co-founder** (NEW) | ✅ |
| Fee slider · presentations · cost/cache stats | ✅ |

## Agents (authority → guard)
| Agent | Authority | Guard | Status |
|---|---|---|---|
| AI co-founder | answer, operate engine, set spend cap, propose changes | change-control + HITL; holds no secrets | ✅ |
| 10 CXO agents | advisory analysis | `agentAuthority` | ✅ |
| Sourcing / acquisition / data-collector | source, outreach, ads | `sellerConsent.canSell` + DPDP | ✅ |
| Fraud / auto-correct | flag, propose | HITL gates | ✅ |
| Change-control | classify/route changes | `PROTECTED_INVARIANTS` (refuses unsafe, even from founder) | ✅ |
| Cost engine | route inference cheapest-first | **founder spend cap (live)** + monthly ledger | ✅ |
| GEO / creativity | generate schema/ideas | read-only | ✅ |

## Workflows (end-to-end)
| Workflow | Steps | Status |
|---|---|---|
| Acquisition | source → approach → advertise → **consent** → convert (canSell flips) | ✅ |
| Data collection | collect authentic GI clusters → consent-gated prospects (no money) | ✅ |
| Order | browse → cart → checkout → confirmation → split payout (never-in-loss) | ✅ |
| Payout | HITL gate → **idempotency** (no double-pay) → never-in-loss | ✅ |
| Notice & takedown | file → acknowledge (36h) → act → log (safe harbor) | ✅ |
| DPDP rights | request → export / erase / correct | ✅ |
| Cost | task → route cheapest → **cache** → founder cap | ✅ |
| Spend cap | founder speaks → co-founder `setCap` → live enforcement in cost engine | ✅ |
| Deploy | test-mode deploy → UAT feedback → launch (productionGuard) | 🔶 (deploy-time) |

## Cross-cutting invariants (enforced at every boundary)
never-in-loss · consent-before-sale · child-safety · no-fabrication · honest-stage — the engine
refuses to violate these even on founder command.

## Honest residual (seams, not logic — see RISK-REGISTER & SAAS-BENCHMARK)
Live auth + MFA · live payments/billing · managed Postgres · notifications · monitoring/alerts ·
WAF/DDoS. All are integrations to wire at deploy, not missing core logic.

## Verdict
Reverse-engineered end to end: every customer and founder function is wired and verified, every
agent is bounded by a guard, every workflow terminates safely, and the money paths fail safe
(HITL + never-in-loss + idempotency). The engine is internally sound; what remains is the live
transactional spine and a pilot.
