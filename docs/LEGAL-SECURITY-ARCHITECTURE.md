# NEXUS — Legal, Policy & Security Architecture

Covers marketplace policy, India intermediary/DPDP compliance, IP, encryption, corporate &
digital security, and a reverse-engineered loophole audit of every agent. Status: ✅ built ·
🔶 partial (deploy/legal) · ⬜ to-do.

## 1. Prohibited items policy ✅
`contentPolicy.js` screens every listing against 7 category groups mapped to Indian law:
wildlife/protected species (Wildlife Protection Act 1972), antiquities >100 yrs (Antiquities &
Art Treasures Act 1972), restricted natural materials (EXIM/forest), weapons (Arms Act),
counterfeit/IP-infringing (Trade Marks/Copyright), false-GI claims (GI Act 1999), controlled/
hazardous. A flagged listing is **held for human review (HITL), never auto-published.**
Endpoints: `/api/policy/prohibited`, `/api/policy/screen`.

## 2. Notice & takedown + intermediary safe harbor ✅
`contentPolicy.fileNotice/actOnNotice` implements the IT Act s.79 + IT Rules 2021 flow:
a notice is logged with a **36-hour acknowledge window** and **15-day resolution window**;
every action (acknowledge/takedown/reject/reinstate) is timestamped and logged, preserving
safe-harbor protection. Endpoint: `/api/policy/notice`. Deploy-time: appoint a **Grievance
Officer** and publish contact (IT Rules requirement) 🔶.

## 3. DPDP Act 2023 + data minimization ✅
- **Data-principal rights:** `dataRights.js` + `/api/privacy/request` — access, portability,
  erasure ("right to be forgotten", keeps anonymised tax rows), correction. (13 tests)
- **Data minimization:** `sanitize.sanitizeObject` whitelists fields; only necessary PII is
  captured; `dataCrypto.PII` marks the sensitive set.
- **Consent:** `sellerConsent.canSell` gates selling on explicit consent.
- Deploy-time: publish a **privacy notice**, name a **Data Protection contact** 🔶.

## 4. Data encryption ✅
`dataCrypto.js` — AES-256-GCM authenticated encryption for PII at rest; key from
`ENCRYPTION_KEY` (never hardcoded); tamper is detected (GCM auth tag). In transit: HTTPS at the
host 🔶. `isSecure()` lets `productionGuard` refuse to launch on the dev fallback key.

## 5. Intellectual-property protection 🔶
- Counterfeit + false-GI screening (✅, above).
- Provenance/GI verification is the positive side of IP (✅ in the product model).
- Deploy: a **DMCA/IP takedown** intake (reuses `fileNotice` type `ip_infringement`), and a
  trademark for "NEXUS" (legal).

## 6. Developer NDA (template)
> **Mutual Non-Disclosure Agreement (summary template — have a lawyer finalise).**
> The Receiving Party shall keep confidential all non-public information (code, data, models,
> business plans, artisan/partner data) disclosed by NEXUS; use it solely to perform agreed
> work; not reverse-engineer, copy, or share it; return or destroy it on termination; and treat
> all personal data per the DPDP Act. Obligations survive 3 years post-termination; IP created
> for NEXUS vests in NEXUS. Governing law: India.

## 7. Corporate-structure & access security 🔶
- Least-privilege: `agentAuthority.js` bounds what each agent may do; `FOUNDER_TOKEN` /
  `COFOUNDER_TOKEN` gate human/agent control.
- Deploy: 2FA on all founder accounts, a secrets manager (not `.env` in prod), separate
  prod/dev credentials, signed commits, and a break-glass procedure.

## 8. Architecture & digital security ✅/🔶
- **Zero npm dependencies** → essentially no third-party supply-chain attack surface (✅).
- Security headers (CSP, X-Frame, nosniff, Referrer), configurable rate limiting, input
  validation (27 modules) + `sanitize.js` (✅).
- `productionGuard` refuses to boot with default secrets (✅).
- Deploy: HTTPS/WAF, DDoS protection, log retention, monitoring/alerting (🔶).

---

## 9. Reverse-engineered loophole audit — every agent
Method: for each agent, list its authority, its guard, and the loophole closed.

| Agent | Authority | Guard | Loophole → closed |
|---|---|---|---|
| **AI co-founder** (assistant) | answer, operate engine (pause/stop/resume), *propose* changes | `changeControl` + HITL | Prompt-injection to bypass safety → invariants enforced at the code boundary, **not by the model**; assistant holds **no secrets** (keys are server-side, never in context); privileged actions need HITL approval |
| **10 CXO agents** (executiveTeam) | advisory analysis only | `agentAuthority` bounds scope | Autonomous overreach → cannot execute money/contract actions; those route to HITL gates |
| **Creativity agents** (creativeStudio) | generate ideas only | no execution path | None material — advisory output, founder chooses |
| **Sourcing / acquisition / data-collector** | source prospects, outreach, ads | `sellerConsent.canSell` + DPDP lawful basis | Contacting/selling without consent → **canSell = false until 5 consents**; no bulk private-data ingest (public sources only) |
| **Fraud / auto-correct** | flag, propose corrections | HITL fraud + payout gates | Auto-acting on false positive → human approval required above thresholds |
| **GEO agent** (geoOptimizer) | emit structured data | read-only generation | Data leakage via schema → only public listing fields emitted |
| **Change-control** | classify & route changes | `PROTECTED_INVARIANTS` | Founder ordering an unsafe change → `threatensInvariant` **refuses even the founder** |

**The five inviolable invariants** (enforced at every boundary, not by any single agent):
never-in-loss · consent-before-sale · child-safety · no-fabrication · honest-stage.

### Cross-cutting loopholes considered
- **Secret exposure:** API keys/secrets live only in backend env, never sent to client or into
  any model prompt; `productionGuard` blocks default secrets. ✅
- **Listing abuse:** prohibited-item screening + HITL hold. ✅
- **Data exfiltration:** PII encrypted at rest; minimization; rights-based deletion. ✅
- **Injection:** input sanitization + validation at boundaries; parameterised store access. ✅/🔶
- **Rate/DoS:** app rate limiting ✅; WAF/DDoS at host 🔶.
- **Privilege escalation via agents:** `agentAuthority` + HITL gates. ✅

## 10. Honest read
The **policy-and-safety logic is in code and tested** (prohibited items, takedown, DPDP rights,
encryption, agent authority, invariants — now 3,955 tests / 0 fail). What remains is **deploy-time
and institutional**: HTTPS/WAF, secrets manager, 2FA, published privacy/grievance-officer
notices, trademark, and lawyer-finalised NDA/terms. Those are standard setup, not code gaps —
do them alongside the P0 list in `PRODUCTION-READINESS.md`.
