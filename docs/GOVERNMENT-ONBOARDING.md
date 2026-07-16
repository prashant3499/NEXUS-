# NEXUS — Onboarding to Government Platforms (ONDC, ODOP, GeM, DPI)

How to plug NEXUS into India's government commerce + DPI rails. Prerequisite for almost all of
it: a **registered business entity + GST + PAN + bank** (the one gate that unlocks the rest).

## ONDC (Open Network for Digital Commerce) — the big one
ONDC is not an app; it is open protocols on the **Beckn Protocol** that let any buyer app
transact with any seller app (like UPI did for payments). Two ways in:

**Fast path — list via an existing Seller App (validate first, no build):**
1. Pick an ONDC Seller App (e.g., Mystore, Zoho Vikra, SellerApp, GoFrugal).
2. Do the free **DigiReady** self-assessment (Quality Council of India) — it fast-tracks onboarding.
3. Submit GST, PAN, bank details and your product catalogue; complete seller onboarding.
→ Your artisans' products become discoverable across all ONDC buyer apps. Fastest proof of demand.

**Strategic path — become a Seller Network Participant (NEXUS *is* the seller app):**
This is "building infrastructure," not "onboarding" — but it gives NEXUS full control and makes
NEXUS itself a node on the network. Steps (scaffolded in `ondcOnboarding.js`):
1. Own a domain (FQDN) + valid SSL (used for OCSP).
2. Sign up on the **ONDC Network Participant Portal**; complete profile; raise a whitelisting
   request for your `subscriber_id` (staging → pre-prod → prod).
3. Generate **Ed25519 signing + X25519 encryption** key pairs → `generateBecknKeys()`.
4. Host **`ondc-site-verification.html`** at your subscriber path → `siteVerificationHtml()`.
5. Implement the Beckn Seller APIs (`on_search/on_select/on_init/on_confirm/on_status`).
6. Pass **ONDC sandbox certification**; sign the **Participation Agreement**; go live.
→ Check readiness anytime: `GET /api/ondc/readiness`.

**Recommendation:** fast path now to prove demand → build the SNP integration once you have the
entity and volume. Commissions on ONDC run ~3–10%, versus 18–40% on walled-garden platforms.

## ODOP (One District One Product)
- **List:** map your artisans to their district's ODOP product (NEXUS already holds the GI/ODOP
  cluster map) and list them.
- **Partner:** approach the **state ODOP cell / DPIIT** to become a market-access / implementation
  partner (MoU). This is how ODOP sends you clusters — the "government gives you the map" play.

## GeM (Government e-Marketplace)
Register as a **seller / service provider** on gem.gov.in to sell verified craft directly to
government departments and PSUs — a large, steady institutional buyer for your B2B2C vertical.
Needs the entity, GST, and (for many categories) relevant certifications.

## DPI + language rails (API access, not "selling")
- **DigiLocker / Aadhaar e-KYC** — apply as a **requester** for artisan KYC (via API Setu / a
  KYC provider). Requires the entity + agreement.
- **e-Shram** — partner to formalise workers (with their consent); use public stats freely now.
- **API Setu** (apisetu.gov.in) — register (free) for service APIs like **GSTIN/PAN verification**
  to verify partner businesses.
- **Bhashini** — register for the 13-language translation + speech APIs (voice onboarding).

## The realistic sequence
```
1. Register the entity (+GST/PAN/bank)            ← unlocks everything
2. ONDC fast path (list via a seller app)         ← prove demand, low effort
3. ODOP / GeM registration + one state MoU        ← government distribution + credibility
4. DPI: API Setu (GSTIN/PAN), Bhashini, KYC       ← verification + language
5. ONDC Seller Network Participant integration     ← build once volume justifies it
```

## Honest notes
- Almost nothing here needs money beyond the entity + compliance; most portals are free to join.
- The **entity is the true unlock** — you can't sign an ODOP MoU, request DigiLocker, or become an
  ONDC NP without it.
- The Beckn integration is real engineering (certification, agreements) — do the fast path first;
  don't let the big integration block your first sales.
