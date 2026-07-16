# CLAUDE.md — NEXUS project instructions for Claude Code

## Numbers
All counts are measured — see `docs/FACTS.md` (run `backend/scripts-facts.js`). Do not hardcode counts elsewhere.

## What this is
NEXUS: an AI-operated, founder-in-the-loop **Merchant of Record** for India's craft economy.
Solo founder (Prashant, Jaipur). This repo is the FINAL VERIFIED build: **117 test suites,
~4,057 assertions, 0 failures**; 14/14 public + 11/11 founder endpoints verified; load-tested
~1,000–1,500 req/s, p95 <40ms.

## Layout
- `backend/` — the engine. Pure Node.js, **ZERO npm dependencies** (keep it that way).
  `node backend/server.js` (PORT env, default varies; health at `/health`). ~125 modules in
  `backend/src/`, one router in `backend/server.js`.
- `website/nexus-app.html` — single-file site (also served by the backend at `/`).
- `deploy/` — static-deploy copy (Netlify/Vercel/Cloudflare Pages).
- `desktop/` — Electron shell bundling the backend.
- `docs/` — 28 docs: PRD, APP-FLOW, TDD, BACKEND-SCHEMA, IMPLEMENTATION-PLAN,
  PRODUCTION-READINESS, RISK-REGISTER, LEGAL-SECURITY-ARCHITECTURE, etc. Read TDD.md first.
- `.github/workflows/ci.yml` — CI: syntax-check all files → run all suites → boot smoke.

## Commands
- Run all tests: `cd backend && for t in $(ls test*.js | grep -v test-api-routes.js); do node $t; done && node test-api-routes.js`
  (api-routes binds a port — run it LAST/alone; it is flaky in parallel, clean in isolation)
- Boot: `cd backend && node server.js` — wait ~17–19s before curling endpoints.
- Syntax sweep: `for f in server.js src/*.js; do node --check $f; done`

## HARD RULES (do not violate — enforced in code, keep it enforced)
1. **Five invariants**: never-in-loss (payout ≤ collected; fee floor 2% / ceiling 30%),
   consent-before-sale (`sellerConsent.canSell`), child-safety, no-fabrication, honest-stage.
   `changeControl` + `cockpitOps` refuse invariant-threatening changes EVEN from the founder.
2. **Zero npm dependencies** in backend. Do not add packages. (`pg` is the single sanctioned
   exception when wiring `STORE_DRIVER=postgres`.)
3. Money is **BIGINT paise**, never floats. All money ops pass `idempotency` guard.
4. Every founder/agent endpoint stays behind `requireAuth(req,res,{role:'founder'})` (22+ sites).
5. Every state change goes through `repository`/`domain` and lands in the hash-chained
   `auditLog`. Order transitions ONLY via `domain.transition` (illegal moves refused).
6. Secrets env-only; `productionGuard` must keep refusing real money until
   COMPLIANCE_CONFIRMED=true. Never weaken it.
7. Website: preserve inline `window.*` handlers, i18n keys (329/329 EN/HI parity), and design
   tokens. After ANY website edit, re-verify: balanced divs, script parses, handlers run.
8. Every new module ships WITH a `test-*.js` suite following the existing
   `N passed, M failed` output convention (CI parses it).

## Current state / next work (see docs/IMPLEMENTATION-PLAN.md)
Code-complete for pilot. P0 build work ONLY: OTP auth → Postgres migration
(docs/BACKEND-SCHEMA.md has the DDL) → Razorpay live (wire idempotency into charge/payout,
webhook HMAC, reconciliation) → WhatsApp/email notifications. Feature freeze otherwise —
validation (one pilot cluster) is the bottleneck, not features.

## Deploy
Render: start `node backend/server.js`, health `/health` (root `package.json`/`render.yaml`
already configured). Static site: drag `deploy/` to Netlify Drop. Env template:
`backend/.env.example`.
