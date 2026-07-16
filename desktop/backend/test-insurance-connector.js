'use strict';

const I = require('./src/insuranceConnector');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Quote — customer-side premium');
{
  const q = I.quote({ declaredValueRupees: 5000 });
  a(q.ok && q.premium_paise === 5000, 'Flat \u20b950 premium on a \u20b95,000 order');
  a(q.payer === 'buyer', 'Premium is the buyer\u2019s (customer-side)');
  a(q.covers.includes('loss in transit'), 'Covers transit loss');
  const big = I.quote({ declaredValueRupees: 50000 });
  a(big.premium_paise === Math.round(5000000 * 0.005), '0.5% above the \u20b910k threshold');
  a(I.quote({ declaredValueRupees: 0 }).ok === false, 'Rejects zero value');
}

sec('Bind — mock now, real on credentials');
{
  const m = I.bind({ orderId: 'o1', declaredValueRupees: 5000 });
  a(m.ok && m.live === false && /MOCKPOL/.test(m.policy_id), 'Mock policy without insurer creds');
  a(/only once a licensed insurer/i.test(m.note), 'Honest: not a real policy until insurer connected');
  const fakeProvider = { bindPolicy: () => ({ policyId: 'POL-REAL-9' }) };
  const live = I.bind({ orderId: 'o2', declaredValueRupees: 5000 }, fakeProvider);
  a(live.live === true && live.policy_id === 'POL-REAL-9', 'Binds via real provider when present');
}

sec('Claim — filed on buyer\u2019s behalf');
{
  a(I.claim({}).ok === false, 'Needs a policy id');
  a(I.claim({ policyId: 'p', reason: 'nonsense' }).ok === false, 'Validates reason');
  const c = I.claim({ policyId: 'MOCKPOL-x', reason: 'damage' });
  a(c.ok && /MOCKCLM/.test(c.claim_id) && c.status === 'received', 'Files a (mock) claim');
}

sec('Posture — the platform is NOT the underwriter');
{
  const p = I.posture();
  a(/NOT the underwriter/i.test(p.role), 'Honest: platform is a channel, not the insurer');
  a(p.requirements.some((r) => /IRDAI|licensed insurer/i.test(r)), 'Requires a licensed insurer partner');
  a(/customer-side/i.test(p.why), 'Why: customer-side trust backstop');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
