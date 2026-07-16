'use strict';

const G = require('./src/productionGuard');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Dev/test always pass (demo + tests keep working)');
{
  a(G.check({}).ready === true, 'No NODE_ENV → not production → ready');
  a(G.check({ NODE_ENV: 'development' }).ready === true, 'development → ready');
  a(G.check({ NODE_ENV: 'test' }).ready === true, 'test → ready');
  // assertReady never throws outside production
  let threw = false; try { G.assertReady({ NODE_ENV: 'development' }); } catch (e) { threw = true; }
  a(threw === false, 'assertReady does not throw in dev');
}

sec('Production with dev defaults is BLOCKED');
{
  const r = G.check({ NODE_ENV: 'production' });
  a(r.ready === false, 'Bare production → not ready');
  a(r.blockers.some((b) => /AUTH_SECRET/.test(b)), 'Flags dev AUTH_SECRET');
  a(r.blockers.some((b) => /Payments/.test(b)), 'Flags mock payments');
  a(r.blockers.some((b) => /DATABASE_URL/.test(b)), 'Flags file store');
  a(r.blockers.some((b) => /COMPLIANCE_CONFIRMED/.test(b)), 'Flags missing legal attestation');
}

sec('assertReady throws in unsafe production');
{
  let threw = false, blockers = [];
  try { G.assertReady({ NODE_ENV: 'production' }); } catch (e) { threw = true; blockers = e.blockers; }
  a(threw === true, 'Refuses to boot unsafely');
  a(blockers.length > 0, 'Throw carries the blocker list');
}

sec('A fully-configured production passes');
{
  const env = {
    NODE_ENV: 'production',
    AUTH_SECRET: 'a-real-long-random-secret-xyz',
    FOUNDER_TOKEN: 'rotated-founder-token-abc',
    WEBHOOK_SECRET: 'whsec_real_signing_key',
    PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'rzp_live_x', RAZORPAY_KEY_SECRET: 'secret_x',
    DATABASE_URL: 'postgres://user@host/db',
    COMPLIANCE_CONFIRMED: 'true',
    ENCRYPTION_KEY: 'a'.repeat(64),
    FORCE_HTTPS: 'true', KYC_API_KEY: 'kyc_x',
  };
  const r = G.check(env);
  a(r.ready === true, 'Fully configured → ready');
  a(r.blockers.length === 0, 'No blockers');
  let threw = false; try { G.assertReady(env); } catch (e) { threw = true; }
  a(threw === false, 'assertReady passes when ready');
}

sec('The compliance attestation is the un-forgettable gate');
{
  const env = {
    NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(20), FOUNDER_TOKEN: 'rot', WEBHOOK_SECRET: 'whsec_real',
    PAYMENTS_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'x', RAZORPAY_KEY_SECRET: 'y', DATABASE_URL: 'postgres://x',
    // COMPLIANCE_CONFIRMED deliberately missing
  };
  const r = G.check(env);
  a(r.ready === false && r.blockers.some((b) => /COMPLIANCE_CONFIRMED/.test(b)), 'Everything else right, but no legal attestation → still blocked');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
