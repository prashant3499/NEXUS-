'use strict';

/**
 * test-scheme-alignment.js — the unified, extensible scheme engine.
 *   - Aggregates multiple sources behind one interface
 *   - Normalises differing source shapes
 *   - Matches a seller; ranks eligible + cash schemes first
 *   - registerSource extends it (future schemes)
 *   - alignmentReport states mutual benefit
 */

const A = require('./src/schemeAlignment');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// Two mock sources with DIFFERENT shapes (mirrors schemes.js vs ondc.js).
const govSource = {
  name: 'gov',
  match: () => [
    { scheme: { id: 'mudra', name: 'PM MUDRA', ministry: 'Ministry of Finance', category: 'credit', benefit: 'Loan', typical_amount_paise: 5000000, application_url: 'x' }, eligible: true },
    { scheme: { id: 'gi', name: 'GI Tag', ministry: 'DPIIT', category: 'ip_protection', summary: 'Provenance' }, eligible: true },
  ],
};
const ondcSource = {
  name: 'ondc',
  match: () => [
    { id: 'ondc_onboarding', name: 'ONDC', body: 'DPIIT', category: 'digital_commerce', benefit: 'Open network reach', url: 'https://ondc.org' },
  ],
};

sec('Aggregate + normalise differing shapes');
{
  const eng = A.createEngine([govSource, ondcSource]);
  a(eng.sourceCount() === 2, 'Two sources registered');
  const matched = eng.matchSeller({ archetype: 'karigar' });
  a(matched.length === 3, 'Aggregates all three schemes across sources');
  a(matched.every(m => m.id && m.name && m.body && m.seller_benefit !== undefined), 'Normalises to one shape');
  a(matched.every(m => m.platform_benefit), 'Every scheme has a platform-benefit note (mutual benefit)');
}

sec('Ranking — cash schemes surface high');
{
  const eng = A.createEngine([govSource, ondcSource]);
  const matched = eng.matchSeller({});
  a(matched[0].amount_paise === 5000000, 'A cash scheme (MUDRA) ranks first');
}

sec('Platform-benefit mapping by category');
{
  const eng = A.createEngine([ondcSource]);
  const m = eng.matchSeller({})[0];
  a(/CAC|reach|network/i.test(m.platform_benefit), 'ONDC platform-benefit mentions reach/CAC');
}

sec('Extensible — register a future scheme source');
{
  const eng = A.createEngine([govSource]);
  a(eng.matchSeller({}).length === 2, 'Two before extension');
  eng.registerSource({ name: 'future_state_subsidy', match: () => [{ id: 'st1', name: 'State Loom Subsidy 2027', category: 'credit', benefit: 'New', typical_amount_paise: 2000000 }] });
  const after = eng.matchSeller({});
  a(after.length === 3, 'New source absorbed without a rewrite');
  a(after.some(m => m.source === 'future_state_subsidy'), 'Future scheme is matched');
}

sec('Alignment report');
{
  const eng = A.createEngine([govSource, ondcSource]);
  const rep = eng.alignmentReport({ archetype: 'karigar' });
  a(rep.matched_count === 3, 'Counts matched schemes');
  a(rep.potential_cash_benefit_paise === 5000000, 'Sums potential cash benefit');
  a(Object.keys(rep.by_category).length >= 2, 'Breaks down by category');
  a(/aligns with every scheme/i.test(rep.posture), 'States the alignment posture');
}

sec('Robustness — a broken source does not break the engine');
{
  const eng = A.createEngine([govSource, { name: 'bad', match: () => { throw new Error('boom'); } }]);
  const matched = eng.matchSeller({});
  a(matched.length === 2, 'A throwing source is skipped, others still matched');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
