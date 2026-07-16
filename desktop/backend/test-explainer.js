'use strict';

/**
 * test-explainer.js — the human-facing self-explaining system.
 *   - Customer story is concrete + growth-focused
 *   - Investor story is grounded in real facts
 *   - Investor state is HONEST (pre-revenue when pre-revenue)
 */

const E = require('./src/explainer');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const facts = {
  identity: { name: 'NEXUS', tagline: 'Trust + compliance OS for craft.', one_liner: 'A weaver sells abroad, paid in two days, zero liability.' },
  legalModels: [{ id: 'merchant_of_record' }, { id: 'guardian_mor' }],
  invariants: ['Never-in-loss', 'Consent-before-sale', 'Child-safety'],
  giCount: 54,
  economics: { summary: 'High software margins at scale.', at_100: { opex_pct: 7.6, margin_pct: 92.4 } },
};

sec('Customer story');
{
  const c = E.explain('customer', facts);
  a(c.audience === 'customer', 'Customer audience');
  a(c.how_it_helps_you_grow.length >= 5, 'Lists concrete growth benefits');
  a(c.how_it_helps_you_grow.some(b => /two days|T\+2/.test(b.body)), 'Mentions the real T+2 payout');
  a(c.how_it_helps_you_grow.some(b => /GST/.test(b.body + ' ' + b.title)), 'Mentions no-GST handling');
  a(c.how_to_start.length === 4, 'Gives a clear start path');
  a(c.why_trust_it.length >= 3, 'Explains why to trust it');
}

sec('Investor story — grounded in real facts');
{
  const i = E.explain('investor', facts);
  a(i.audience === 'investor', 'Investor audience');
  a(/weaver/.test(i.thesis), 'Thesis uses the real one-liner');
  a(i.the_model.models.length === 2, 'Includes the real legal models');
  a(i.the_moat.some(m => /54/.test(m)), 'Moat cites the real GI/cluster count');
  a(i.unit_economics.at_100_sellers.margin_pct === 92.4, 'Uses real unit economics');
  a(i.invariants_that_protect_the_business.length === 3, 'Lists the protective invariants');
}

sec('Investor state is HONEST');
{
  const preRev = E.explain('investor', { ...facts, metrics: { mrr: { mrr_paise: 0, active_count: 0 } } });
  a(preRev.state.stage === 'pre_revenue', 'Reports pre-revenue when there is no MRR');
  a(/pre-revenue|validate/i.test(preRev.state.headline), 'Honest headline, not vanity');
  a(preRev.honest_risks.length >= 3, 'Surfaces real risks (demand, legal, datastore)');
  a(preRev.honest_risks.some(r => /demand/i.test(r)), 'Names demand validation as a risk');

  const withRev = E.explain('investor', { ...facts, metrics: { mrr: { mrr_paise: 2998000, mrr_rupees: 29980, active_count: 12 } } });
  a(withRev.state.stage === 'early_revenue', 'Reports early-revenue when MRR exists');
  a(/12/.test(withRev.state.headline), 'Cites the real account count');
}

sec('Defaults');
{
  const def = E.explain('something_else', facts);
  a(def.audience === 'customer', 'Unknown audience → customer view');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
