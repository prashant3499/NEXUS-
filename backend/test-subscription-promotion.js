'use strict';

const {
  TIERS, SUSTAINED_DAYS, COOLDOWN_DAYS, HIGH_VALUE_PAISE,
  aggregateUsage, detectUpgradeSignal, readinessScore,
  promotionOffer, promotionCohort, nextTierForGmv,
} = require('./src/subscriptionPromotion');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const DAY = 86400 * 1000;
const NOW = 1750000000000;  // a fixed instant for repeatable tests

// helper — synthesize an event stream
const evt = (daysAgo, sellPriceRupees, opts = {}) => ({
  at: NOW - daysAgo * DAY,
  sellPricePaise: sellPriceRupees * 100,
  isExport: opts.isExport || false,
  modality: opts.modality || 'D2C',
  status: opts.status || 'settled',
});

// ────────────────────────────────────────────────────────────
sec('AGGREGATION — rolling windows and sustained detection');
{
  // 6 orders spread across 6 different days in last 30 → sustained
  const events = [evt(2, 5000), evt(5, 5000), evt(9, 5000), evt(14, 5000), evt(20, 5000), evt(27, 5000)];
  const u = aggregateUsage(events, NOW);
  a(u.orderCount30 === 6,    'Counts 6 orders in 30-day window');
  a(u.gmvPaise30 === 6 * 5000 * 100, 'GMV aggregated in paise');
  a(u.sustained === true,    'Spread across 5+ distinct days → sustained');
  a(u.modalitiesUsed.includes('D2C'), 'Modalities aggregated');

  // 6 orders all on the same day → NOT sustained (a spike)
  const spike = [evt(1, 5000), evt(1, 5000), evt(1, 5000), evt(1, 5000), evt(1, 5000), evt(1, 5000)];
  const us = aggregateUsage(spike, NOW);
  a(us.sustained === false, 'One-day spike is NOT sustained');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — GMV ceiling (sustained Karigar over the ₹50k limit)');
{
  // Karigar ceiling is ₹50k = 5,000,000 paise. Push GMV to ₹80k, sustained.
  const events = Array.from({length: 10}, (_, i) => evt(i*3, 8000));
  const u = aggregateUsage(events, NOW);
  const sig = detectUpgradeSignal({ tier: 'karigar' }, u);
  a(sig !== null,                              'Detects an upgrade signal');
  a(sig.signal === 'gmv_ceiling',              'Signal type is GMV ceiling');
  a(sig.suggestedTier === 'vyapari',           'Suggests Vyapari (next up from Karigar)');
  a(/sustained/i.test(sig.evidence),           'Evidence mentions sustained activity');
  a(/80,000|80000/.test(sig.evidence.replace(/[,]/g,'')) || /80/i.test(sig.evidence), 'Evidence quotes the GMV figure');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — single spike does NOT trigger GMV upgrade');
{
  // One ₹3L order, nothing else. Crosses Karigar ceiling but not sustained.
  const events = [evt(2, 300000)];
  const u = aggregateUsage(events, NOW);
  const sig = detectUpgradeSignal({ tier: 'karigar' }, u);
  a(sig === null || sig.signal !== 'gmv_ceiling',
    'GMV signal requires sustained, not one spike');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — export adoption (Karigar starts exporting)');
{
  const events = Array.from({length: 3}, (_, i) => evt(i*4, 10000, { isExport: true }));
  const u = aggregateUsage(events, NOW);
  const sig = detectUpgradeSignal({ tier: 'karigar' }, u);
  a(sig?.signal === 'export_modality',  'Detects export modality signal');
  a(sig?.suggestedTier === 'pravasi',   'Light export count → Pravasi (diaspora tier)');
}
{
  const heavy = Array.from({length: 25}, (_, i) => evt(i, 8000, { isExport: true }));
  const u = aggregateUsage(heavy, NOW);
  const sig = detectUpgradeSignal({ tier: 'karigar' }, u);
  a(sig?.suggestedTier === 'niryatak',  'Heavy export volume → Niryatak (full EXIM stack)');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — B2B modality from a Karigar');
{
  const events = [evt(3, 10000, { modality: 'B2B' }), evt(5, 8000, { modality: 'B2B' })];
  const u = aggregateUsage(events, NOW);
  const sig = detectUpgradeSignal({ tier: 'karigar' }, u);
  a(sig?.signal === 'b2b_modality',  'Detects B2B modality usage');
  a(sig?.suggestedTier === 'vyapari','Suggests Vyapari (first tier with B2B)');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — friction event (tier limit hit explicitly)');
{
  const seller = { tier: 'karigar', frictionEvent: { tierLimited: true, requiredTier: 'vyapari', what: 'tried to use bulk pricing' } };
  const sig = detectUpgradeSignal(seller, {});
  a(sig?.signal === 'friction',       'Detects friction signal');
  a(sig?.suggestedTier === 'vyapari', 'Friction picks the tier that unlocks it');
  a(sig.evidence.includes('bulk pricing'), 'Evidence quotes the specific friction');
}

// ────────────────────────────────────────────────────────────
sec('SIGNAL — already at top of usage → no signal');
{
  // Niryatak with high usage → no further upgrade in this engine (Sansthan is custom)
  const events = Array.from({length: 30}, (_, i) => evt(i, 200000));
  const u = aggregateUsage(events, NOW);
  const sig = detectUpgradeSignal({ tier: 'niryatak' }, u);
  a(sig === null, 'No signal at Niryatak (top automated tier)');
}

// ────────────────────────────────────────────────────────────
sec('READINESS — wins moment bumps score, cooldown blocks');
{
  // Sustained GMV + a recent big win
  const events = [
    ...Array.from({length: 8}, (_, i) => evt(i*3, 10000)),
    evt(1, HIGH_VALUE_PAISE / 100 + 1000), // a ₹2.01L wins moment
  ];
  const u = aggregateUsage(events, NOW);
  const r = readinessScore({ tier: 'karigar' }, u, NOW);
  a(r.score >= 80,  `Wins moment + sustained → high readiness (got ${r.score})`);
  a(r.ready,        'Ready flag true');

  // Same usage but cooldown active
  const r2 = readinessScore({ tier: 'karigar', lastOfferDeclinedAt: NOW - 3 * DAY }, u, NOW);
  a(r2.ready === false,             'Cooldown blocks readiness');
  a(r2.blockers.some(b => /cooldown/i.test(b)), 'Blocker names the cooldown');
  a(/day/i.test(r2.blockers.find(b => /cooldown/i.test(b))), 'Cooldown blocker mentions days');

  // Open dispute blocks
  const r3 = readinessScore({ tier: 'karigar', openDispute: true }, u, NOW);
  a(r3.ready === false,             'Open dispute blocks readiness');
  a(r3.blockers.some(b => /dispute/i.test(b)), 'Blocker names the dispute');
}

// ────────────────────────────────────────────────────────────
sec('READINESS — cooldown expires after window');
{
  const events = Array.from({length: 8}, (_, i) => evt(i*3, 10000));
  const u = aggregateUsage(events, NOW);
  const justExpired = NOW - (COOLDOWN_DAYS + 1) * DAY;
  const r = readinessScore({ tier: 'karigar', lastOfferDeclinedAt: justExpired }, u, NOW);
  a(r.ready,              'After cooldown expires, ready flag returns');
  a(r.blockers.length === 0, 'No blockers after cooldown');
}

// ────────────────────────────────────────────────────────────
sec('OFFER — contents are correct and seller-specific');
{
  const events = Array.from({length: 8}, (_, i) => evt(i*3, 10000));
  const u = aggregateUsage(events, NOW);
  const o = promotionOffer({ tier: 'karigar' }, u, NOW);
  a(o !== null,                       'Builds an offer');
  a(o.fromTier === 'karigar' && o.toTier === 'vyapari', 'From / to tiers correct');
  a(o.priceDeltaPaise === TIERS.vyapari.pricePaise - TIERS.karigar.pricePaise,
    'Price delta calculated from tier prices');
  a(o.newUnlocks.length > 0, 'Names specific unlocks for the new tier');
  a(o.newUnlocks.some(u => /B2B|RFQ|GST|Net-30|bulk/i.test(u)),
    'Unlocks include B2B-specific tools');
  a(o.evidence && o.evidence.length > 10, 'Evidence is non-trivial');
  a(o.roiNote && /GMV/i.test(o.roiNote), 'ROI note interpolates seller GMV');
}

// ────────────────────────────────────────────────────────────
sec('OFFER — null when not ready');
{
  // No usage at all
  const o = promotionOffer({ tier: 'karigar' }, {}, NOW);
  a(o === null, 'No usage → no offer');
}

// ────────────────────────────────────────────────────────────
sec('COHORT — ranked across sellers, MRR lift aggregated');
{
  // Three sellers in three different states
  const sellers = [
    { id: 's1', tier: 'karigar' },                        // ready, strong
    { id: 's2', tier: 'karigar' },                        // ready, weaker
    { id: 's3', tier: 'karigar', openDispute: true },     // blocked
    { id: 's4', tier: 'karigar' },                        // no usage, no signal
  ];
  const usage = {
    s1: aggregateUsage([
      ...Array.from({length: 8}, (_, i) => evt(i*3, 12000)),
      evt(1, HIGH_VALUE_PAISE / 100 + 5000), // wins moment
    ], NOW),
    s2: aggregateUsage(Array.from({length: 6}, (_, i) => evt(i*4, 9000)), NOW),
    s3: aggregateUsage(Array.from({length: 8}, (_, i) => evt(i*3, 10000)), NOW),
    s4: aggregateUsage([], NOW),
  };
  const c = promotionCohort(sellers, usage, NOW);
  a(c.cohortSize === 2,                       'Cohort excludes blocked + no-signal sellers');
  a(c.offers[0].seller.id === 's1',           'Ranks the stronger-signal seller first');
  // s1's GMV with the wins moment crosses the Vyapari ceiling → Niryatak
  // s2's GMV stays below Vyapari ceiling → Vyapari
  const expectedLift = (TIERS.niryatak.pricePaise - TIERS.karigar.pricePaise)
                     + (TIERS.vyapari.pricePaise  - TIERS.karigar.pricePaise);
  a(c.expectedMrrLiftPaise === expectedLift,
    'MRR lift aggregates correctly across heterogeneous offers');
}

// ────────────────────────────────────────────────────────────
sec('TIER ESCALATION — Vyapari → Niryatak on heavy export');
{
  const events = Array.from({length: 25}, (_, i) => evt(i, 10000, { isExport: true }));
  const u = aggregateUsage(events, NOW);
  const o = promotionOffer({ tier: 'vyapari' }, u, NOW);
  a(o?.toTier === 'niryatak',  'Heavy export from Vyapari → Niryatak');
  a(o?.newUnlocks.some(u => /IRP|FEMA|EXIM/i.test(u)), 'Unlocks include EXIM-stack tools');
}

// ────────────────────────────────────────────────────────────
sec('NEXT-TIER UTILITY — gmv bucket lookups');
{
  a(nextTierForGmv(1000000)        === 'karigar',  '₹10k → still Karigar');
  a(nextTierForGmv(15000000)       === 'vyapari',  '₹1.5L → Vyapari');
  a(nextTierForGmv(80000000)       === 'niryatak', '₹8L → Niryatak');
  a(nextTierForGmv(500000000)      === 'niryatak', '₹50L → Niryatak (top automated)');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
