'use strict';

/**
 * productionGuard.js
 *
 * The last line of defence before the world: a boot-time check that REFUSES to
 * run unsafely in production. The catastrophic failure mode for a money
 * platform is launching with mock payments still on, dev secrets still active,
 * or — worst — taking real money before a lawyer has confirmed the model is
 * lawful. This guard makes those impossible to do by accident.
 *
 * It is intentionally strict ONLY in production: in development and test
 * everything passes, so the demo and the test suite keep working untouched.
 * In production, any blocker stops the boot with a clear message.
 *
 * The cleverest check: COMPLIANCE_CONFIRMED. The platform will not take real
 * money in production unless the founder has explicitly set this flag — which
 * they should set ONLY after a lawyer + CA have signed off. It turns "we must
 * remember to get legal sign-off" into "the software won't run without attesting
 * we did." A guard you can't forget.
 *
 * Pure + dependency-free.
 */

const DEV_SECRETS = ['dev-founder-token', 'dev-cofounder-token', 'whsec_dev_default', 'dev', 'changeme', 'secret', ''];

function isDev(secret) { return secret === undefined || secret === null || DEV_SECRETS.includes(String(secret)); }

/**
 * check — evaluate production readiness from the environment.
 * @returns { production, ready, blockers[], warnings[] }
 */
function check(env = {}) {
  const production = env.NODE_ENV === 'production';
  const blockers = [];
  const warnings = [];

  // Outside production, never block — dev/test/demo run freely.
  if (!production) {
    return { production: false, ready: true, blockers: [], warnings: ['Not production — guard inactive. Set NODE_ENV=production to enforce.'] };
  }

  // 1) Secrets must be rotated away from dev defaults.
  if (isDev(env.AUTH_SECRET)) blockers.push('AUTH_SECRET is unset or a dev default — set a strong unique secret.');
  if (isDev(env.FOUNDER_TOKEN)) blockers.push('FOUNDER_TOKEN is a dev default — rotate it.');
  if (isDev(env.WEBHOOK_SECRET)) blockers.push('WEBHOOK_SECRET is a dev default — set a real signing secret.');

  // 2) Real money must be real (no mock payments in production).
  const paymentsReal = env.PAYMENTS_PROVIDER === 'razorpay' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET;
  if (!paymentsReal) blockers.push('Payments are not on a real provider — connect Razorpay (PAYMENTS_PROVIDER, RAZORPAY_KEY_ID/SECRET) before taking money.');

  // 3) Durable storage (no file store for money records at scale).
  if (!env.DATABASE_URL) blockers.push('DATABASE_URL is unset — production must use Postgres, not the file store.');

  // 4) The compliance attestation — the un-forgettable legal gate.
  if (env.COMPLIANCE_CONFIRMED !== 'true') {
    blockers.push('COMPLIANCE_CONFIRMED is not "true" — the platform will not take real money until a lawyer + CA have signed off on the Merchant-of-Record + TCS model and you attest it here.');
  }

  // 4b) Encryption key for PII-at-rest must be strong in production.
  try {
    const dp = require('./dataProtection');
    const k = dp.validateKey(env.ENCRYPTION_KEY, { production: true });
    if (!k.ok) blockers.push(k.reason);
  } catch (e) { /* module optional at boot */ }

  // 5) HTTPS / transport (warn — usually terminated at a proxy).
  if (env.FORCE_HTTPS !== 'true') warnings.push('FORCE_HTTPS is not "true" — ensure TLS is terminated upstream; never serve real users over plain HTTP.');

  // 6) Real KYC (warn, not block — you may pilot with manual KYC).
  if (!env.KYC_API_KEY) warnings.push('No KYC provider connected — makers will be format-only, not registry-verified. Acceptable for a tiny supervised pilot; not for scale.');

  return { production: true, ready: blockers.length === 0, blockers, warnings };
}

/**
 * assertReady — call at boot. Throws in production if not ready, so an unsafe
 * configuration cannot start. No-op in dev/test.
 */
function assertReady(env = {}) {
  const r = check(env);
  if (r.production && !r.ready) {
    const msg = 'NEXUS refused to start — production safety blockers:\n  - ' + r.blockers.join('\n  - ') + '\n\nFix these, or run with NODE_ENV!=production for the demo. The platform will not move real money unsafely.';
    const err = new Error(msg);
    err.blockers = r.blockers;
    throw err;
  }
  return r;
}

module.exports = { DEV_SECRETS, check, assertReady };
