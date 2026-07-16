'use strict';

const VC = require('./src/verticalCost');
const O = require('./src/operationalCost');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Per-vertical monthly cost');
{
  const t = VC.verticalMonthlyCost('tourism', O.ASSUMPTIONS);
  const h = VC.verticalMonthlyCost('handicraft', O.ASSUMPTIONS);
  a(t && h, 'Computes cost for tourism + handicraft');
  a(t.total_paise > h.total_paise, 'Tourism costs more to serve than handicraft');
  a(t.inference_paise > 0 && t.support_paise > 0, 'Breaks cost into inference + support');
  a(VC.verticalMonthlyCost('nonexistent', O.ASSUMPTIONS) === null, 'Unknown vertical → null');
}

sec('All-verticals report');
{
  const r = VC.reportAllVerticals(O.ASSUMPTIONS);
  a(r.per_vertical.length === 7, 'Reports all seven verticals (incl. environment)');
  a(r.per_vertical.every(v => v.margin_pct != null), 'Every vertical has a margin %');
  a(r.costliest.vertical === 'tourism', 'Tourism is costliest to serve');
  a(r.cheapest.total_paise <= r.costliest.total_paise, 'Cheapest <= costliest');
  a(r.blended_margin_pct > 50 && r.blended_margin_pct < 100, 'Blended margin is a sane software-margin %');
  a(r.per_vertical[0].total_paise >= r.per_vertical[1].total_paise, 'Sorted costliest-first');
}

sec('Margins reflect tier pricing');
{
  const r = VC.reportAllVerticals(O.ASSUMPTIONS);
  const gems = r.per_vertical.find(v => v.vertical === 'gems');
  a(gems.revenue_paise === VC.TIER_PRICE_PAISE.niryatak, 'Gems priced at the niryatak tier');
  a(gems.margin_pct > 90, 'High-value gems vertical has a strong margin');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
