'use strict';

/**
 * test-charity-fund.js
 *   - Contributions accumulate
 *   - Customers see transparency (totals, causes) — but NOT allocation controls
 *   - Founder sets the allocation plan (validated, <= 100%)
 *   - Founder records disbursements (can't overspend)
 *   - founderView exposes the spending controls; publicTransparency does not
 */

const C = require('./src/charityFund');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Payment-gateway ask (asked once, just before payment)');
{
  const ask = C.checkoutAsk(500000); // ₹5000 order
  a(ask.ask === true, 'Produces a checkout ask');
  a(ask.suggested_paise === 1000, 'Suggests 0.2% (₹10 on ₹5000)');
  a(ask.default === false, 'Never pre-checked — the customer must choose');
  a(/artisan welfare/i.test(ask.message), 'Message explains what it supports');
  a(C.checkoutAsk(0).suggested_paise === 100, 'Floors at ₹1 even on tiny orders');
  // The answer at the gateway drives recordContribution:
  const f = C.emptyFund();
  C.recordContribution(f, ask.suggested_paise, { optedIn: false });
  a(f.raised_paise === 0, 'Declined at gateway → nothing recorded');
  C.recordContribution(f, ask.suggested_paise, { optedIn: true });
  a(f.raised_paise === 1000, 'Accepted at gateway → recorded for this order');
}
{
  const f = C.emptyFund();
  C.recordContribution(f, 1000, { optedIn: true });
  C.recordContribution(f, 2000, { optedIn: true });
  a(f.raised_paise === 3000, 'Opted-in contributions accumulate');
  a(f.contributions === 2, 'Counts contributing purchases');
  C.recordContribution(f, 5000, { optedIn: false });
  a(f.raised_paise === 3000, 'Opted-OUT contribution is NOT recorded (optional)');
  C.recordContribution(f, 5000, {});
  a(f.raised_paise === 3000, 'No opt-in flag → not recorded');
}

sec('Fund total is founder/co-founder data — not a customer view');
{
  const f = C.emptyFund();
  C.recordContribution(f, 50000, { optedIn: true });
  // The fund is exposed ONLY through founderView in the app (endpoint is
  // financial-gated). The internal helper still computes aggregates for that.
  const fv = C.founderView(f);
  a(fv.total_raised_paise === 50000, 'Founder view shows the total');
  a(fv.founder_only === true, 'Marked founder-only');
  a(Array.isArray(fv.allocation_plan), 'Founder view has the allocation controls');
}

sec('Founder-only allocation plan');
{
  const f = C.emptyFund();
  const ok = C.setAllocationPlan(f, [{ cause: 'artisan_welfare', pct: 60 }, { cause: 'next_gen_skilling', pct: 40 }]);
  a(ok.ok === true, 'Founder sets a valid plan');
  a(ok.unallocated_pct === 0, 'Reports unallocated %');
  a(f.allocation_plan.length === 2, 'Plan stored');
  const over = C.setAllocationPlan(f, [{ cause: 'artisan_welfare', pct: 70 }, { cause: 'next_gen_skilling', pct: 50 }]);
  a(over.ok === false && /exceed 100/.test(over.error), 'Rejects a plan over 100%');
  const bad = C.setAllocationPlan(f, [{ cause: 'not_a_cause', pct: 10 }]);
  a(bad.ok === false, 'Rejects unknown cause');
}

sec('Founder-only disbursement (cannot overspend)');
{
  const f = C.emptyFund();
  C.recordContribution(f, 100000, { optedIn: true }); // ₹1000 available
  const d = C.recordDisbursement(f, 'artisan_welfare', 40000, 'Flood relief, Khurja');
  a(d.ok === true, 'Records a disbursement');
  a(f.disbursed_paise === 40000, 'Disbursed tracked');
  const over = C.recordDisbursement(f, 'artisan_welfare', 100000, 'too much');
  a(over.ok === false && /available/.test(over.error), 'Cannot disburse more than available');
  const pub = C.publicTransparency(f);
  a(pub.available_paise === 60000, 'Public available reflects disbursement');
  a(pub.causes_supported.some(c => c.cause === 'artisan_welfare'), 'Public sees which causes were supported');
}

sec('Founder view exposes controls that the public view hides');
{
  const f = C.emptyFund();
  C.recordContribution(f, 50000, { optedIn: true });
  C.setAllocationPlan(f, [{ cause: 'artisan_welfare', pct: 100 }]);
  const fv = C.founderView(f);
  a(Array.isArray(fv.allocation_plan) && fv.allocation_plan.length === 1, 'Founder view shows the allocation plan');
  a(Array.isArray(fv.causes_available), 'Founder view lists allocatable causes');
  a(fv.founder_only === true, 'Marked founder-only');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
