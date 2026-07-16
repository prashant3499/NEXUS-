# NEXUS — Data & Partner Intake (no payment needed)

**Short answer: yes.** You can source target makers and partners, pull in data, and fully
test the platform **before any payment flows** — and before you incorporate. Money only
enters at a real *transaction*. Sourcing, onboarding-prep, and testing need no money rail.

This is exactly what the platform is built for: a **consent-gated sourcing funnel** where data
comes in first and nothing is ever sold until the maker explicitly agrees.

---

## What you CAN take now (lawful, no payment)
1. **Public government datasets & APIs** — the backbone, all free:
   - **e-Shram** (unorganised-worker registry), **Udyam/MSME** registry, **GI Registry**
     (geographical-indication holders), **ODOP** (One District One Product) lists,
     **Handloom/Handicraft census**, and open APIs on **data.gov.in**.
   - These identify *clusters* and *crafts*, not private secrets — ideal for a prospect map.
2. **Partner-shared member lists, under an MoU** — no payment, just written authorization:
   - Cooperatives, **handicraft boards**, **development commissioners**, **export councils**,
     **NGOs/SHGs**, **tourism boards** (the 9 `PARTNER_KIND`s already modelled). A cooperative
     can share its artisans with you under a data-sharing agreement.
3. **ONDC network** discovery, your **own outreach**, melas, referrals.

## What you must NOT do
- Scrape private personal data, buy grey-market "leads" databases, or contact people with no
  lawful basis. That breaks the **DPDP Act 2023** and India's IT rules — and your own
  no-fabrication / consent invariants.

## The legal frame (DPDP Act 2023) — plain version
You may *hold* prospect data if you record a **lawful basis** (a public source, a partner's
authorization, or the person's consent), keep a **purpose** (onboarding to NEXUS), **minimise**
what you store, secure it, and publish a **privacy notice**. You may *contact* a prospect to
offer onboarding. You may **not sell on their behalf** until they grant explicit consent — which
the platform enforces in code.

## How the platform already supports this
| Need | Module | What it does |
|---|---|---|
| Catalogue of data inputs + readiness | `dataSources.js` | 24 inputs by source/status; flags the *only* blockers as payments + KYC |
| Auto-source prospects by craft/cluster | `autoSource.js` | builds candidate makers + product templates |
| Plan sourcing per vertical & partner | `customerSourcing.js` | sourcing/partner plans, prospect generation |
| Prospect & partner database + funnel | `prospectDb.js` | ingest → contacted → engaged → onboarded; 9 partner kinds |
| Lead scoring & outreach | `sourcing.js` | scores, status flow, bilingual outreach templates |
| **The consent gate** | `sellerConsent.js` | `canSell` returns NO until the 5 consents are granted |

Proven behaviour: an auto-sourced prospect is **blocked from selling** until they grant terms,
selling-authorization, content-license, data-processing and payout-authorization. Source widely;
transact for no one who hasn't said yes.

## The real-world intake sequence
```
1. Source from public data + partner MoUs   → prospect enters DB (stage: sourced)   [no payment]
2. Record lawful basis (public / partner / consent)                                  [no payment]
3. Contact with a DPDP-compliant notice; explain the offer                           [no payment]
4. Maker agrees → capture the 5 consents (canSell flips to YES)                      [no payment]
5. Onboard: profile, KYC*, bank/payout setup                                         [no payment]
6. List products and TEST the full flow in mock mode                                 [no payment]
   ── everything above needs zero money ──
7. Go live: connect Razorpay + flip production → the first real sale moves money     [payment]
```
\*KYC verification and payouts are the two things that need real accounts before *live* money —
but you can test the entire pipeline in mock mode without them.

## What you still need (one-time, mostly free)
- A **registered entity** (to sign partner MoUs and be the data fiduciary).
- A **published privacy notice** + a named person handling data requests (DPDP).
- **Partner MoUs / data-sharing agreements** (template via your lawyer — cheap).
- None of these require a payment gateway. The gateway is only for step 7.

---
**Bottom line:** build the prospect database and the partner network now, test the whole engine
in mock mode, and keep money out of it until a real maker, who has said yes, makes a real sale.
That is the safe, lawful, expert way to do this in the real world — and the platform already
enforces it.
