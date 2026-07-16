# NEXUS — Government Open-Data Launch Toolkit

Build a **real launch database** from open government data that needs **no authorization and no
money** — so you can deploy, test every integration, and walk into partnership meetings with a
working, verified-cluster pipeline already running. Verified sources, with honest access flags.

The engine knows these too: `GET /api/government/open-data`.

---

## Use now — no authorization, no payment (the launch backbone)
| Source | What you get | How NEXUS uses it | Access |
|---|---|---|---|
| **data.gov.in** (data.gov.in) | Open datasets (CSV/JSON) incl. the All-India **Pincode Directory**, MSME & handloom data | Cluster/district stats; pincode→geo (fills the logistics gap) | Free download; free API key; commercial use allowed |
| **GI Registry** (search.ipindia.gov.in/GIRPublic) | Public list of **600+ GI products** + their registered producers + origin region | The provenance backbone and the core prospect map (craft → cluster → producers) | Public, no auth |
| **myScheme** (myscheme.gov.in) | Central + state schemes with eligibility rules | Match each artisan to schemes they qualify for | Public browse |
| **ODOP** (odop.gov.in) | District → signature-product mapping | Target sourcing by district; align with state ODOP cells | Public browse |

These four alone let you map every craft cluster in India, attach real GI provenance, geo-locate
by pincode, and tell each maker which government schemes they can claim — **before you spend a
rupee or incorporate.**

## Free, but needs a (free) registration / key
- **data.gov.in API** — free key from your account for live API pulls (downloads need no key).
- **API Setu** (apisetu.gov.in) — register free to use non-personal **service APIs** like
  **GSTIN / PAN verification** (verify a partner *business*, no personal data or consent needed).

## Needs a partnership / consent (later, with the entity)
- **e-Shram** — public dashboards are open; the worker registry is personal data → only with the
  worker's consent or a formal partnership. Use aggregate stats for planning now.
- **ONDC** — a distribution channel; onboard as a network participant to list makers.
- **DigiLocker / Aadhaar e-KYC** — requester approval required (this is the KYC gate, not a
  free dataset).

## What you must NOT do
Don't scrape private contact data or buy "leads" lists. Public registries + aggregate stats +
consent is the only DPDP-safe foundation — and it's the one that builds real trust.

---

## The launch-database build sequence (no money)
```
1. Pull the GI Registry list        → craft → cluster → registered producers     [no auth]
2. Pull data.gov.in pincode + stats → geo-locate clusters, size the market       [free key]
3. Cross-map ODOP districts         → priority sourcing districts                 [no auth]
4. Attach myScheme eligibility      → each cluster's claimable schemes            [no auth]
5. Load into the prospect DB        → /api/founder/seed-prospects (consent-gated) [no money]
6. Test the whole engine in mock mode on this real cluster map                    [no money]
   ── then, with the entity ──
7. API Setu (GSTIN/PAN) to verify partners · e-Shram/DigiLocker for KYC · ONDC to distribute
```

## Honest notes
- "GI producers" are organisations/clusters, not individuals' phone numbers — treat the list as a
  *cluster map* to approach via the cooperative/board, not a cold-call list.
- data.gov.in datasets vary in freshness; always read each dataset's "updated" date.
- API Setu service APIs are free to use but require registration and publisher approval.

**Bottom line:** four open, no-authorization sources (GI Registry, data.gov.in, ODOP, myScheme)
are enough to build a real, India-wide launch database and test everything — today, with no money
and no incorporation. That working pipeline is your strongest asset in the first government and
cooperative meetings.
