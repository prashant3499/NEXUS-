'use strict';

const SA = require('./src/selfAuditAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Self-audit agent — the logical mind');
{
  const r = SA.audit();
  a(r.trustworthy === true, 'Audit returns TRUSTWORTHY when invariants hold');
  a(r.passed === r.total && r.total >= 5, 'All pure-module invariants pass');
  a(r.checks.find((c) => c.name === 'money_reconciles').pass, 'Money reconciles check passes');
  a(r.checks.find((c) => c.name === 'rejects_bad_money').pass, 'Bad-money rejection passes');
  a(r.checks.find((c) => c.name === 'verified_is_honest').pass, 'Honest-verification check passes');
  a(r.checks.find((c) => c.name === 'no_greenwashing').pass, 'No-greenwashing check passes');
  a(r.checks.find((c) => c.name === 'ondc_ready').pass, 'ONDC-ready check passes');
}

sec('With live gates injected');
{
  const r = SA.audit({
    signupSvc: {},
    trySignup: ({ age, consent_all }) => ({ blocked: age < 18 || consent_all === false }),
  });
  a(r.checks.find((c) => c.name === 'child_safety_blocks_minor').pass, 'Child-safety gate verified live');
  a(r.checks.find((c) => c.name === 'consent_required').pass, 'Consent gate verified live');
}

sec('A broken invariant flips the verdict');
{
  // Simulate a broken gate via the injected function.
  const r = SA.audit({ signupSvc: {}, trySignup: () => ({ blocked: false }) }); // gate fails to block!
  a(r.trustworthy === false, 'One broken gate → NOT TRUSTWORTHY (no "mostly fine")');
  a(r.failed_checks.length > 0, 'Names the broken checks');
}

sec('40x determinism — the agent gives the SAME verdict every time');
{
  const verdicts = new Set();
  for (let i = 0; i < 40; i++) verdicts.add(SA.audit().verdict);
  a(verdicts.size === 1, 'Identical verdict across 40 runs (deterministic): ' + [...verdicts][0]);
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
