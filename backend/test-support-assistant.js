'use strict';

/**
 * test-support-assistant.js — the customer-facing help assistant.
 *   - Answers common seller/buyer questions, grounded (never invented)
 *   - Weaves in account facts (tier, archetype)
 *   - Escalates complaints + low-confidence questions to grievance
 *   - Audience filtering (seller vs buyer)
 */

const S = require('./src/supportAssistant');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Answers grounded platform questions');
{
  const pay = S.answer('when will I get paid?', { audience: 'seller' });
  a(pay.matched === true, 'Matches a payout question');
  a(/T\+2|two days/i.test(pay.answer), 'Payout answer states the real T+2 mechanic');
  a(pay.escalate === false, 'A clear FAQ is not escalated');

  const list = S.answer('how do I add a product?', { audience: 'seller' });
  a(list.matched && list.intent === 'how_to_list', 'Matches the listing question');

  const ret = S.answer('can I return a damaged item?', { audience: 'buyer' });
  a(ret.matched && /7 days/i.test(ret.answer), 'Returns answer states the 7-day window');
}

sec('Weaves in account facts');
{
  const tier = S.answer('what is my plan?', { audience: 'seller', tier: 'Karigar', archetype: 'karigar' });
  a(/Karigar/.test(tier.answer), 'Mentions the seller\u2019s actual tier');
  const kyc = S.answer('what documents for verification?', { audience: 'seller', archetype: 'niryatak' });
  a(/niryatak/i.test(kyc.answer), 'KYC answer references the seller\u2019s archetype');
}

sec('Escalation — complaints go to a human');
{
  const complaint = S.answer('I was cheated, I never received my money!', { audience: 'seller' });
  a(complaint.escalate === true, 'Complaint is escalated');
  a(complaint.escalation.route === 'grievance', 'Routes to grievance');
  a(complaint.escalation.suggested_type === 'payment', 'Pre-classifies as a payment grievance');
  a(/sorry/i.test(complaint.answer), 'Responds with empathy, not an FAQ');
}

sec('Escalation — low confidence');
{
  const vague = S.answer('asdfghjkl random gibberish xyz', { audience: 'seller' });
  a(vague.escalate === true, 'Unmatched question escalates rather than guessing');
  a(vague.matched === false, 'Not marked as matched');
}

sec('Empty + audience filtering');
{
  const empty = S.answer('', {});
  a(empty.matched === false && empty.escalate === false, 'Empty question handled gracefully');
  const sellerTopics = S.topics('seller');
  a(sellerTopics.length > 0, 'Lists seller topics');
  a(sellerTopics.every(t => t.audience === 'seller' || t.audience === 'any'), 'Audience filter excludes buyer-only topics');
}

sec('Confidence is bounded');
{
  const r = S.answer('payout payment money bank settle when paid', { audience: 'seller' });
  a(r.confidence >= 0 && r.confidence <= 1, 'Confidence in [0,1]');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
