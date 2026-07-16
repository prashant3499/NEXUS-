'use strict';

/**
 * test-watchdog.js — the self-monitoring agent.
 *   - Each invariant check flags real violations as critical
 *   - A clean platform reports all-OK
 *   - Findings are severity-ranked, worst-first
 *   - Trend detects improving / worsening
 */

const W = require('./src/watchdog');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const NOW = 1000000000000;
const find = (rep, cat) => rep.findings.find(f => f.category === cat);

sec('Clean platform → all OK');
{
  const clean = {
    pnl: { net_profit_paise: 50000, margin_pct: 60 },
    activeListings: [{ id: 'l1', seller_id: 's1' }],
    consentOf: () => ({ ok: true }), canSell: () => ({ ok: true, missing: [] }),
    sellers: [{ id: 's1', status: 'active', age: 30 }],
    orders: [{ id: 'o1', total_paise: 1000, splits: [{ amount_paise: 600 }, { amount_paise: 400 }] }],
    pricing: { karigar: { price_paise: 49900 } }, floors: { karigar: 20000 },
    grievances: [], health: { overallHealth: 'healthy' },
  };
  const r = W.scan(clean, NOW);
  a(r.overall === 'ok', 'Clean platform → overall ok');
  a(r.counts.critical === 0, 'No critical findings');
  a(/healthy/i.test(r.headline), 'Healthy headline');
}

sec('Never-in-loss violation → critical');
{
  const r = W.scan({ pnl: { net_profit_paise: -5000, margin_pct: -10, total_revenue_paise: 100000 } }, NOW);
  const f = find(r, 'solvency');
  a(f.severity === 'critical', 'Loss on real revenue → critical');
  a(/loss/i.test(f.message), 'Names the loss');
  a(r.overall === 'critical', 'Overall escalates to critical');
  // Pre-revenue negative is NOT a violation
  const pre = W.scan({ pnl: { net_profit_paise: -5000, total_revenue_paise: 0 } }, NOW);
  a(find(pre, 'solvency').severity === 'ok', 'Pre-revenue burn is not a never-in-loss violation');
}

sec('Consent-before-sale violation → critical');
{
  const r = W.scan({
    activeListings: [{ id: 'l1', seller_id: 's1' }],
    consentOf: () => null, canSell: () => ({ ok: false, missing: ['selling_authorization'] }),
  }, NOW);
  const f = find(r, 'consent');
  a(f.severity === 'critical', 'Active listing without consent → critical');
  a(f.recommendation && /take.*down/i.test(f.recommendation), 'Recommends taking it down');
}

sec('Child-safety violations → critical');
{
  const minor = W.scan({ sellers: [{ id: 's1', status: 'active', age: 15 }] }, NOW);
  a(find(minor, 'child_safety').severity === 'critical', 'Minor without guardian → critical');
  const minorOk = W.scan({ sellers: [{ id: 's1', status: 'active', age: 15, guardian: { name: 'X' } }], guardianOf: () => ({ name: 'X' }) }, NOW);
  a(find(minorOk, 'child_safety').severity === 'ok', 'Minor WITH guardian → ok');
  const unknownAge = W.scan({ sellers: [{ id: 's2', status: 'active' }] }, NOW);
  a(find(unknownAge, 'child_safety').severity === 'critical', 'Active seller with undeclared age → critical');
}

sec('Payout integrity → critical when splits do not reconcile');
{
  const r = W.scan({ orders: [{ id: 'o1', total_paise: 1000, splits: [{ amount_paise: 600 }, { amount_paise: 300 }] }] }, NOW);
  const f = find(r, 'payout');
  a(f.severity === 'critical', 'Split sum != total → critical');
  a(f.evidence.broken[0].diff === 100, 'Reports the exact discrepancy');
}

sec('Pricing floor → critical when below cost-to-serve');
{
  const r = W.scan({ pricing: { karigar: { price_paise: 5000 } }, floors: { karigar: 20000 } }, NOW);
  a(find(r, 'pricing').severity === 'critical', 'Price below floor → critical');
}

sec('Grievance SLA');
{
  const breached = W.scan({ grievances: [{ id: 'g1', status: 'open', slaAckBy: NOW - 1000 }] }, NOW);
  a(find(breached, 'grievance').severity === 'critical', 'Past acknowledgement SLA → critical');
  const approaching = W.scan({ grievances: [{ id: 'g2', status: 'open', slaAckBy: NOW + 3 * 3600 * 1000 }] }, NOW);
  a(find(approaching, 'grievance').severity === 'watch', 'Approaching SLA → watch');
}

sec('Ranking + trend');
{
  const r = W.scan({ pnl: { net_profit_paise: -1, total_revenue_paise: 1000 }, grievances: [{ id: 'g', status: 'open', slaAckBy: NOW + 3 * 3600 * 1000 }] }, NOW);
  a(r.findings[0].severity === 'critical', 'Worst finding sorted first');
  const t = W.trend([{ counts: { critical: 2, watch: 1, ok: 3 } }, { counts: { critical: 0, watch: 1, ok: 5 } }]);
  a(t.direction === 'improving', 'Trend detects improvement');
  const t2 = W.trend([{ counts: { critical: 0, watch: 0, ok: 6 } }, { counts: { critical: 1, watch: 0, ok: 5 } }]);
  a(t2.direction === 'worsening', 'Trend detects worsening');
  a(W.trend([{ counts: {} }]).direction === 'insufficient_data', 'Single scan → insufficient data');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
