# NEXUS — PRD (Product Requirements Document)

## 1. Problem
India's ~200M-strong craft & informal-skilled economy can't sell globally: no entity, no GST,
no export compliance, no trust signal. Middlemen capture most value; provenance is unverifiable.

## 2. Product
A status-aware **Merchant of Record**: NEXUS carries compliance (GST, TCS, export, DPDP,
safe-harbor) so a verified maker sells worldwide without paperwork. AI-operated,
founder-in-the-loop (HITL).

## 3. Users & jobs-to-be-done
- **Artisan/maker** (low-literacy, mobile-first, Hindi-first): "sell my work fairly without paperwork."
- **Buyer** (India + diaspora + global): "buy authentic, provenance-verified craft."
- **Institution/government** (ODOP cells, DICC, ONDC, exporters, hotels): "deliver schemes / source verified craft at scale."

## 4. Core requirements (status: all built & tested unless marked)
- Verified maker onboarding with **consent-before-sale** gate; voice/Indic onboarding (deploy seam: Bhashini)
- Listings with provenance (GI/cluster/maker story), prohibited-item screening + notice-and-takedown
- Order lifecycle: created→paid→in_fulfilment→shipped→delivered→settled (refund/cancel terminals)
- MoR split at gateway: 12% fee (floor 2% / ceiling 30%), **never-in-loss**, zero float, idempotent payouts
- Founder cockpit: briefing, HITL queue (6 gates), engine stop/pause, spend cap, maintain/repair, audit log
- Agents: co-founder, R&D (10 domains), sourcing/acquisition (consent-gated), data-collector (27 GI clusters), fraud, GEO, crawler, MLOps
- DPDP rights (export/erase/correct), AES-256-GCM PII encryption, bilingual EN/HI
- Plans: Karigar / Vyapari / Niryatak / Sansthan / Pravasi

## 5. Non-goals (v1)
Native mobile apps; multi-tenancy; SOC 2; training custom ML models; inventory holding.

## 6. Success metrics
Activation = **first consented maker with a live listing**; North star = maker payout volume;
Guardrails = 0 invariant violations, error rate <5%, payout accuracy 100%.

## 7. Launch gates (real-world)
Entity → lawyer/CA MoR+TCS sign-off → Razorpay + Postgres + auth + notifications →
privacy/terms + grievance officer → COMPLIANCE_CONFIRMED=true (enforced by productionGuard).

## 8. Risks
Validation debt (no pilot yet — top risk); fee vs true cost (~9–10% real gross); vendor
volatility (mitigated: swappable AI layer); founder single-point (documented ops).
