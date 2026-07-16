'use strict';

/**
 * test-insurance.js — insurance facilitation (platform is NOT the insurer).
 *   - Quotes premium per vertical/coverage with a floor
 *   - Premium is pass-through; platform keeps only a disclosed fee
 *   - High-value goods + high-risk tourism are mandatory
 *   - Cannot bind without a licensed insurer (compliance)
 *   - Mock insurer is honestly labelled not-licensed
 */

const I = require('./src/insurance');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Quote per vertical');
{
  const t = I.quote({ vertical: 'handicraft', value_paise: 2000000 }); // ₹20k → 0.5% = ₹100 > floor
  a(t.coverage === 'transit', 'Handicraft → transit cover');
  a(t.premium_paise === Math.round(2000000 * 0.005), '0.5% transit premium (above floor)');
  const g = I.quote({ vertical: 'gems', value_paise: 4000000 }); // ₹40k
  a(g.coverage === 'high_value_goods', 'Gems → high-value-goods cover');
  a(g.premium_paise === Math.round(4000000 * 0.012), '1.2% high-value premium');
  const e = I.quote({ vertical: 'tourism', value_paise: 200000 });
  a(e.coverage === 'experience', 'Tourism → experience cover');
}

sec('Floors apply on small values');
{
  const tiny = I.quote({ vertical: 'handicraft', value_paise: 100 });
  a(tiny.premium_paise === 5000, 'Transit premium floors at ₹50');
}

sec('Premium is pass-through; platform keeps only a disclosed fee');
{
  const q = I.quote({ vertical: 'handicraft', value_paise: 1000000 }); // ₹10k → premium ₹50
  a(q.insurer_premium_paise + q.platform_fee_paise === q.premium_paise, 'Insurer share + platform fee = total premium (pass-through)');
  a(q.platform_fee_paise === Math.round(q.premium_paise * 0.10), 'Platform fee is 10% of premium');
  a(q.platform_fee_paise < q.insurer_premium_paise, 'Insurer gets the larger share (platform is a facilitator)');
}

sec('Mandatory cover');
{
  a(I.quote({ vertical: 'gems', value_paise: 5000000 }).mandatory === true, 'High-value goods cover is mandatory');
  a(I.quote({ vertical: 'tourism', value_paise: 100000, risk: 'high' }).mandatory === true, 'High-risk tourism cover is mandatory');
  a(I.quote({ vertical: 'handicraft', value_paise: 100000 }).mandatory === false, 'Ordinary transit is optional');
}

sec('Binding requires a licensed insurer (compliance)');
{
  const q = I.quote({ vertical: 'handicraft', value_paise: 500000 });
  const noInsurer = I.bindPolicy(q, null);
  a(noInsurer.ok === false, 'Cannot bind without an insurer');
  a(/cannot issue insurance itself/i.test(noInsurer.reason), 'Explains the platform cannot self-insure');

  const insurer = I.makeInsurer({});
  a(insurer.kind === 'mock' && insurer.licensed === false, 'Mock insurer is honestly NOT licensed');
  const bound = I.bindPolicy(q, insurer, { subject_ref: 'order_1' });
  a(bound.ok === true && bound.policy.policy_id, 'Mock insurer binds a (mock) policy');
  a(/not real cover/i.test(bound.policy.note), 'Mock policy is labelled not-real');
  a(bound.policy.platform_fee_paise === q.platform_fee_paise, 'Platform fee carried onto the policy');
}

sec('Live insurer slot on credentials');
{
  const live = I.makeInsurer({ insurerApiKey: 'k', insurerId: 'id' });
  a(live.kind === 'partner' && live.licensed === true, 'Credentials → licensed partner slot');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
