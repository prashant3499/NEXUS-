# NEXUS — Canonical Facts (single source of truth)

These numbers are **measured from the code** by `backend/scripts-facts.js` (run it yourself;
it prints JSON). Every other doc must cite this file, never hardcode its own count. This
resolves the #1 credibility risk: docs drifting apart on module/test/status numbers.

Run: `cd backend && node scripts-facts.js`

## Verified as of this build
- **Backend modules:** 139 (`backend/src/*.js`)
- **Test suites:** 122 · **Assertions passing:** 4,108 · **Failures:** 0
- **API endpoints:** 175 · **Auth-gated sites:** 44
- **Dependencies:** 0 (no npm packages — verify: `backend/` has no `node_modules` requirement)
- **Frontend (canonical):** `website/nexus-app.html` — single file, also served at `/`.
  Older references to other filenames are historical; this is the one.
- **Payments (default):** mock (real via `PAYMENTS_PROVIDER=razorpay` + keys)
- **Store (default):** in-memory (real via `STORE_DRIVER=postgres` + `DATABASE_URL`)
- **Auth:** session in dev, token in prod; founder/customer separation enforced (401 to customers)

## Honest status (say this consistently, everywhere)
NEXUS is **code-complete and verified for a pilot in mock mode.** It is **not yet live for real
money** — that requires the deploy-time spine (entity → lawyer sign-off → auth/Postgres/Razorpay/
notifications) which `productionGuard` enforces before real money can flow. Anyone who reads
"production-ready" should read it as "**pilot-ready in mock mode; launch-ready after the P0
spine.**"

## Why this file exists
An analyst review flagged that our documents disagreed on counts and on whether payments were
"integrated." Disagreement — not the numbers themselves — is what erodes investor/lawyer/partner
trust. From now on: **one measured source, cited by all.** If a number here surprises you, the
code changed — re-run `scripts-facts.js` and update this file only.
