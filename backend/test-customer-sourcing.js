'use strict';

const S = require('./src/customerSourcing');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Per-vertical sourcing plans');
{
  const gi = S.sourcingPlan('gi', 'seller');
  a(gi && gi.where.length > 0, 'GI seller plan has sources');
  a(gi.hook && gi.channel, 'Plan has a hook + channel');
  const env = S.sourcingPlan('environment', 'buyer');
  a(env.where.some(w => /CSR|ESG|impact/i.test(w)), 'Environment buyer sourcing targets ESG/CSR');
  a(S.sourcingPlan('nonexistent') === null, 'Unknown vertical → null');
}

sec('All-vertical sourcing map');
{
  const sellers = S.allVerticalPlans('seller');
  const buyers = S.allVerticalPlans('buyer');
  a(sellers.length === 7, 'Covers all seven verticals (seller)');
  a(buyers.length === 7, 'Covers all seven verticals (buyer)');
  a(sellers.every(p => p.where.length && p.channel), 'Every plan is populated');
  a(buyers.find(p => p.vertical === 'tourism').where.some(w => /diaspora|operator|board/i.test(w)), 'Tourism buyer sourcing names real channels');
}

sec('Prospect generation (honest: targets, not invented people)');
{
  const r = S.generateProspects('handicraft', 'seller');
  a(r.ok && r.count > 0, 'Generates prospects');
  a(r.prospects.every(p => p.is_target_not_contact === true), 'Flags them as sourcing TARGETS, not fake contacts');
  a(r.prospects.every(p => p.vertical === 'handicraft' && p.opening_hook && p.stage === 'sourced'), 'Each tagged with vertical, hook, stage');
  a(S.generateProspects('bad').ok === false, 'Unknown vertical → error');
}

sec('Audiences differ');
{
  const sel = S.sourcingPlan('jewellery', 'seller');
  const buy = S.sourcingPlan('jewellery', 'buyer');
  a(JSON.stringify(sel.where) !== JSON.stringify(buy.where), 'Seller and buyer sources differ for the same vertical');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
