'use strict';

const { scoreOperator, seasonalSignals, tourismPortfolio, TIER } = require('./src/tourismIntelligence');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (name) => console.log('\n\u2501\u2501\u2501 ' + name + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — preferred tier (everything aligned)');
{
  const r = scoreOperator(
    { licenseVerified: true, cglIndemnity: true, adventureInsuranceBound: true, categories: ['adventure','natural'] },
    { incidents: 0, avgReview: 4.7, completedBookings: 200 }
  );
  a(r.score >= 80,                        `Score ≥ 80 (got ${r.score})`);
  a(r.tier === TIER.PREFERRED,            `Tier is "preferred"`);
  a(r.reasons.some(x => x.ok && /license/i.test(x.text)), 'License recorded in reasons');
  a(r.reasons.some(x => x.ok && /adventure insurance/i.test(x.text)), 'Adventure insurance recorded');
  a(r.reasons.some(x => x.ok && /200/i.test(x.text)), 'Volume tiebreaker mentions the booking count');
}

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — standard tier (good ops, no extras)');
{
  const r = scoreOperator(
    { licenseVerified: true, cglIndemnity: true, categories: ['cultural','heritage'] },
    { incidents: 0, avgReview: 4.1, completedBookings: 30 }
  );
  a(r.score >= 60 && r.score < 80, `Standard tier score band (got ${r.score})`);
  a(r.tier === TIER.STANDARD,      'Tier is "standard"');
}

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — high-risk WITHOUT adventure insurance');
{
  const r = scoreOperator(
    { licenseVerified: true, cglIndemnity: true, adventureInsuranceBound: false, categories: ['adventure'] },
    { incidents: 0, avgReview: 4.5 }
  );
  a(r.tier === TIER.PROBATIONARY || r.tier === TIER.STANDARD,
    `Adventure operator without adventure insurance does NOT reach preferred (got ${r.tier})`);
  a(r.reasons.some(x => !x.ok && /adventure insurance/i.test(x.text)),
    'Reasoning chain explicitly flags the missing adventure insurance');
}

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — past incidents penalize');
{
  const r = scoreOperator(
    { licenseVerified: true, cglIndemnity: true, categories: ['heritage'] },
    { incidents: 2, avgReview: 4.0, completedBookings: 50 }
  );
  a(r.score < 60, `Two incidents drag score below standard (got ${r.score})`);
  a(r.reasons.some(x => !x.ok && /2 past incident/i.test(x.text)), 'Names the incident count');
}

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — blocked (unlicensed)');
{
  const r = scoreOperator(
    { licenseVerified: false, cglIndemnity: false },
    { incidents: 0, avgReview: 0 }
  );
  a(r.score < 40,            `Unlicensed operator → blocked tier band (got ${r.score})`);
  a(r.tier === TIER.BLOCKED, 'Tier is "blocked"');
}

// ────────────────────────────────────────────────────────────
sec('OPERATOR SCORING — low reviews penalize');
{
  const r = scoreOperator(
    { licenseVerified: true, cglIndemnity: true, categories: ['cultural'] },
    { incidents: 0, avgReview: 2.4, completedBookings: 20 }
  );
  a(r.reasons.some(x => !x.ok && /low review/i.test(x.text)), 'Flags low review score');
  a(r.score < 60, 'Low reviews drop score');
}

// ────────────────────────────────────────────────────────────
sec('SEASONAL SIGNALS — winter peak (December)');
{
  const sig = seasonalSignals(new Date('2026-12-15'));
  a(sig.some(s => s.category === 'heritage' && s.priority === 'high'),
    'December → heritage at HIGH priority (Rajasthan/desert winter)');
  a(sig.some(s => s.category === 'adventure' && /sport|sk/i.test(s.why)),
    'December → adventure/winter sports surfaces');
  a(sig.some(s => /Diwali|festival/i.test(s.why)),
    'December → festival amplification (Diwali/Christmas window)');
}

// ────────────────────────────────────────────────────────────
sec('SEASONAL SIGNALS — monsoon (July)');
{
  const sig = seasonalSignals(new Date('2026-07-10'));
  a(sig.some(s => s.category === 'eco' && /monsoon|ghat|kerala/i.test(s.why)),
    'July → eco category for Western Ghats/Kerala');
  a(!sig.some(s => s.category === 'heritage' && s.priority === 'high'),
    'July → heritage is NOT high priority (off-season for Rajasthan)');
}

// ────────────────────────────────────────────────────────────
sec('SEASONAL SIGNALS — pre-monsoon hill season (April)');
{
  const sig = seasonalSignals(new Date('2026-04-15'));
  a(sig.some(s => s.category === 'natural' && /hill|shimla|manali|himalay/i.test(s.why)),
    'April → natural category for hill stations');
  a(sig.some(s => s.category === 'adventure' && /trekking/i.test(s.why)),
    'April → trekking window');
}

// ────────────────────────────────────────────────────────────
sec('PORTFOLIO — aggregate across an operator pool');
{
  const ops = [
    { id: 'op1', spec: { licenseVerified: true, cglIndemnity: true, adventureInsuranceBound: true, categories: ['heritage','cultural'] }, history: { incidents: 0, avgReview: 4.7, completedBookings: 150 } },
    { id: 'op2', spec: { licenseVerified: true, cglIndemnity: true, categories: ['eco'] },                                                history: { incidents: 0, avgReview: 4.1 } },
    { id: 'op3', spec: { licenseVerified: true, cglIndemnity: false, adventureInsuranceBound: false, categories: ['adventure'] },         history: { incidents: 1, avgReview: 3.8 } },
    { id: 'op4', spec: { licenseVerified: false },                                                                                        history: {} },
  ];
  const r = tourismPortfolio(ops, new Date('2026-12-15'));
  a(r.total === 4,                              'Counts all operators');
  a(r.buckets.preferred.length >= 1,            'Has at least one preferred operator');
  a(r.buckets.blocked.length >= 1,              'Bucket includes the unlicensed operator');
  a(r.season.length > 0,                        'Returns seasonal signals for the date');
  a(r.topPush && r.topPush.category === 'heritage' && r.topPush.priority === 'high',
    'topPush picks heritage in December (matches preferred op categories)');
}

// ────────────────────────────────────────────────────────────
sec('PORTFOLIO — topPush requires a preferred operator running it');
{
  // December heritage is high priority, but no preferred op runs heritage
  const ops = [
    { spec: { licenseVerified: true, cglIndemnity: true, categories: ['eco'] }, history: { avgReview: 4.6, incidents: 0, completedBookings: 100 } },
  ];
  const r = tourismPortfolio(ops, new Date('2026-12-15'));
  a(r.topPush, 'Still returns SOME push (falls back to first signal)');
  // The fallback may not be high-priority heritage when no operator can serve it
  a(r.buckets.preferred.length === 1, 'The eco operator is in preferred bucket');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
