# NEXUS — TDD (Technical Design Document)

## Architecture
Single Node.js process, **zero npm dependencies** (no supply-chain surface). ~125 modules in
`src/`, one HTTP router (`server.js`). Website = single self-contained HTML file (also served
at `/`). Desktop = Electron shell bundling the backend. Store abstraction: memory (mock) →
Postgres via `STORE_DRIVER` + `DATABASE_URL`.

## Layering
1. **Domain** (`domain.js`): 6 entities, schema validation-at-birth, order state machine,
   `morSplit()` (delegates to tested `slicer`).
2. **Repository** (`repository.js`): uniform CRUD; validates via domain; emits to audit log;
   interface maps 1:1 to Postgres tables.
3. **Engine modules**: payments/razorpayProvider/returns, hitl (6 gates), changeControl
   (PROTECTED_INVARIANTS — refuses even founder), profit/order guards, fraud (7 modules),
   sellerConsent, contentPolicy, dataRights, dataCrypto (AES-256-GCM), sanitize, idempotency,
   cache, spendControl (live capResolver), monitoring, auditLog (hash-chained), mlops
   (routing/prompts/evals/telemetry), webCrawler (allowlist, off by default), cockpitOps.
4. **Agents**: founderInsights co-founder, executiveTeam (advisory), acquisition/sourcing/
   dataCollector (consent-gated), researchAgent (10 domains), geoOptimizer, aiProvider
   (anthropic|krutrim|sarvam swappable, 6h response cache, local fallback).
5. **HTTP**: security headers, per-IP rate limit (429), `requireAuth(role)` on 22+ founder/agent
   endpoints, webhook HMAC, top-level catch → monitoring.capture → 500.

## Security model
Secrets env-only; productionGuard refuses boot on default secrets / unsigned compliance;
founder vs customer separation verified (401); PII encrypted at rest; DPDP rights endpoints;
prohibited-item screening + 36h/15d takedown workflow (IT Rules safe harbor).

## Testing (test-driven discipline)
117 suites / **4,057 assertions / 0 failures**; every new module ships with its suite; CI
(GitHub Actions) syntax-checks all files, runs all suites, boot-smokes `/health` on every
push/PR. Perf verified: ~1,000–1,500 req/s, p95 <40ms single instance; slicer 3.1K ops/s
(integrity-checked by design).

## Failure posture
Fail-safe: faults pause/hold, never pay out. Invariants enforced at code boundaries, not by
any model. Errors captured + optional webhook forward. Idempotency blocks double money ops.

## Deploy topology
Render (node backend/server.js, /health checked) + Netlify (static site) + Cloudflare
(TLS/WAF/CDN) + Neon/Supabase Postgres + Clerk/OTP + Razorpay + Gupshup/Resend + Sentry.
