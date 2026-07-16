'use strict';

/**
 * test-saas-metrics.js — MRR/ARR, churn, CAC, LTV, golden ratio.
 */

const S = require('./src/saasMetrics');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('MRR / ARR');
{
  const m = S.mrr([
    { tier: 'karigar', price_paise: 49900, active: true },
    { tier: 'karigar', price_paise: 49900, active: true },
    { tier: 'vyapari', price_paise: 249900, active: true },
    { tier: 'karigar', price_paise: 49900, active: false },  // churned — excluded
  ]);
  a(m.mrr_paise === 49900 + 49900 + 249900, 'MRR sums active subscriptions only');
  a(m.arr_paise === m.mrr_paise * 12, 'ARR = MRR × 12');
  a(m.active_count === 3, 'Counts active accounts');
  a(m.by_tier.karigar === 99800, 'Breaks down by tier');
  a(m.arpa_paise === Math.round(m.mrr_paise / 3), 'ARPA computed');
}

sec('Churn + net revenue retention');
{
  const c = S.churn({ startCount: 100, churnedCount: 3, startMrrPaise: 1000000, churnedMrrPaise: 30000, expansionMrrPaise: 50000 });
  a(c.logo_churn_rate === 0.03, '3% logo churn');
  a(c.revenue_churn_rate === 0.03, '3% revenue churn');
  a(c.net_revenue_retention === 1.02, 'NRR 102% (expansion outpaces churn)');
  a(c.verdict === 'healthy', '3% churn → healthy');
  const high = S.churn({ startCount: 100, churnedCount: 12, startMrrPaise: 1000000, churnedMrrPaise: 120000 });
  a(high.verdict === 'high', '12% churn → high');
}

sec('CAC');
{
  const c = S.cac({ salesMarketingSpendPaise: 1000000, customersAcquired: 20 });
  a(c.cac_paise === 50000, 'CAC = spend / customers');
  const none = S.cac({ salesMarketingSpendPaise: 0, customersAcquired: 0 });
  a(none.cac_paise === null, 'No acquisition → CAC null (not divide-by-zero)');
}

sec('LTV');
{
  const l = S.ltv({ arpaPaise: 50000, grossMargin: 0.8, lifespanMonths: 24 });
  a(l.ltv_paise === Math.round(50000 * 0.8 * 24), 'LTV = ARPA × margin × lifespan');
  // Lifespan derived from churn when not given
  const fromChurn = S.ltv({ arpaPaise: 50000, grossMargin: 0.8, monthlyChurnRate: 0.05 });
  a(fromChurn.lifespan_months === 20, 'Lifespan = 1/churn when not provided (1/0.05 = 20)');
}

sec('Golden ratio (LTV:CAC)');
{
  const healthy = S.goldenRatio({ ltvPaise: 300000, cacPaise: 50000, arpaPaise: 50000, grossMargin: 0.8 });
  a(healthy.ratio === 6, 'LTV:CAC = 6');
  a(healthy.verdict === 'healthy', 'Ratio >= 3 → healthy');
  a(healthy.cac_payback_months != null, 'Computes CAC payback');

  const marginal = S.goldenRatio({ ltvPaise: 100000, cacPaise: 50000, arpaPaise: 50000 });
  a(marginal.verdict === 'marginal', 'Ratio between 1 and 3 → marginal');

  const bad = S.goldenRatio({ ltvPaise: 30000, cacPaise: 50000, arpaPaise: 50000 });
  a(bad.verdict === 'unprofitable', 'Ratio < 1 → unprofitable');

  const noCac = S.goldenRatio({ ltvPaise: 300000, cacPaise: 0 });
  a(noCac.verdict === 'no_cac', 'No CAC → undefined (organic/founder-led)');
}

sec('Full report');
{
  const rep = S.report({
    subscriptions: [
      { tier: 'karigar', price_paise: 49900, active: true },
      { tier: 'vyapari', price_paise: 249900, active: true },
    ],
    churn: { startCount: 10, churnedCount: 0, startMrrPaise: 299800, churnedMrrPaise: 0 },
    acquisition: { salesMarketingSpendPaise: 0, customersAcquired: 0 },
  });
  a(rep.mrr.mrr_paise === 299800, 'Report includes MRR');
  a(rep.golden_ratio.verdict === 'no_cac', 'Founder-led acquisition → no_cac');
  a(rep.overall === 'watch', 'No CAC yet → overall watch (cannot prove unit economics)');
  a(/MRR/.test(rep.headline), 'Headline summarises');

  const empty = S.report({ subscriptions: [] });
  a(empty.overall === 'watch' && /Pre-revenue/.test(empty.headline), 'No subscriptions → pre-revenue watch');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
