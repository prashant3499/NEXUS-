'use strict';

const OC = require('./src/operationalCost');
const UE = require('./src/unitEconomics');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('ZERO CUSTOMERS — dev/pre-launch baseline');
{
  const r = OC.scenarioZero();
  a(r.scenario === 'zero_customers',            'Scenario name set');
  a(r.revenuePaise === 0,                        'No revenue');
  a(r.totalCostPaise > 0,                        'Some cost (domain + dev LLM)');
  a(r.totalCostPaise < 10000000,                 'Under ₹1L/mo — confirms lean baseline');
  a(r.grossMarginPaise < 0,                      'Negative margin (expected at zero customers)');
  a(r.byCategory.inference > 0,                  'Inference category populated (dev LLM)');
  a(r.byCategory.infra >= 0,                     'Infra category present');
}

sec('100 CUSTOMERS — early-traction baseline');
{
  const r = OC.scenario100();
  a(r.revenuePaise === 100 * 249900,             'Revenue = 100 × ₹2,499 = ₹2.49L/mo');
  a(r.totalCostPaise > 0,                        'Has cost');
  a(r.totalCostPaise < r.revenuePaise,            'Profitable at 100 customers');
  a(r.grossMarginPct > 80,                       'Gross margin > 80%');
  a(r.grossMarginPct < 100,                       'Gross margin < 100% (sanity)');
  // LLM should dominate cost
  a(r.byCategory.inference > r.byCategory.infra, 'Inference > infra (LLM dominates at this scale)');
}

sec('1000 CUSTOMERS — scale baseline');
{
  const r = OC.scenario1000();
  // Verify the mix calculation
  const expectedRev = 600*49900 + 300*249900 + 80*199900 + 20*799900;
  a(r.revenuePaise === expectedRev,               'Revenue from tier mix correct');
  a(r.totalCostPaise > 0,                         'Has cost');
  a(r.totalCostPaise < r.revenuePaise,             'Still profitable at 1000');
  a(r.grossMarginPct > 80,                        'Gross margin > 80% even at scale');
  a(r.byCategory.infra > 0,                       'Infra non-zero (Pro hosting + DB + CDN)');
  a(r.byCategory.inference > r.byCategory.infra * 5,
    'LLM still dominates — cost optimization needed if scaled further');
  // 2% opex target: at 1000 we expect opex to be MUCH higher than 2% because
  // LLM is variable and growing
  a(r.opexPctOfRevenue > 0 && r.opexPctOfRevenue < 20,
    'Opex % of revenue is in single-digit-or-low-teen range');
  // Meta
  a(r.meta.sellers === 1000,                       'Meta records seller count');
  a(r.meta.llm_calls === 1000 * 10 * 30,           'Meta records LLM call count (300K/mo)');
}

sec('SUMMARISE — categories add up to total');
{
  const r = OC.scenario100();
  const sumCat = Object.values(r.byCategory).reduce((s, v) => s + v, 0);
  a(sumCat === r.totalCostPaise,                  'Category totals reconcile to total');
}

sec('BASELINE — three scenarios returned in order');
{
  const r = OC.baseline();
  a(Array.isArray(r) && r.length === 3,            'Three scenarios');
  a(r[0].scenario === 'zero_customers',            'First is zero');
  a(r[1].scenario === '100_customers',             'Second is 100');
  a(r[2].scenario === '1000_customers',            'Third is 1000');
  a(r[1].totalCostPaise < r[2].totalCostPaise,     'Cost scales up with customers');
  a(r[1].revenuePaise   < r[2].revenuePaise,       'Revenue scales up with customers');
}

sec('LEDGER POPULATION — feeds into unitEconomics');
{
  const ledger = UE.createLedger();
  const scenario = OC.scenario100();
  OC.populateLedger(ledger, scenario);
  const entries = ledger.getEntries();
  a(entries.length > 0,                            'Ledger has entries from scenario');
  // The non-zero lines should match
  const nonZero = scenario.lines.filter(l => l.amountPaise > 0);
  a(entries.length === nonZero.length,             'Entry count matches non-zero scenario lines');
  // Totals reconcile
  a(ledger.totalPaise() === scenario.totalCostPaise, 'Ledger total matches scenario total');
  // Each entry tagged with scenario in meta
  a(entries[0].meta.source === 'cost-baseline',     'Entry meta tagged with source');
  a(entries[0].meta.scenario === '100_customers',   'Entry meta tagged with scenario');
}

sec('LEDGER POPULATION — validation');
{
  let threw = false;
  try { OC.populateLedger(null, OC.scenarioZero()); } catch (e) { threw = true; }
  a(threw, 'Null ledger throws');

  threw = false;
  try { OC.populateLedger(UE.createLedger(), null); } catch (e) { threw = true; }
  a(threw, 'Null scenario throws');

  threw = false;
  try { OC.populateLedger(UE.createLedger(), { lines: 'not-an-array' }); } catch (e) { threw = true; }
  a(threw, 'Bad scenario shape throws');
}

sec('SENSITIVITY — overriding LLM cost shifts the math');
{
  const baseline = OC.scenario100();
  // What if we cut LLM cost in half (better Sonnet/Haiku mix)?
  const cheaper = OC.scenario100({
    ...OC.ASSUMPTIONS,
    llm_cost_per_call_paise: 28,
  });
  a(cheaper.totalCostPaise < baseline.totalCostPaise,
    'Halving LLM per-call cost reduces total cost');
  a(cheaper.byCategory.inference < baseline.byCategory.inference,
    'Inference category specifically drops');
  a(cheaper.grossMarginPct > baseline.grossMarginPct,
    'Gross margin improves');
}

sec('SENSITIVITY — LLM call volume drives cost');
{
  const baseline = OC.scenario100();
  // What if active sellers send 3x more LLM calls (heavy usage)?
  const heavy = OC.scenario100({
    ...OC.ASSUMPTIONS,
    llm_active_calls_per_seller_per_day: 30,
  });
  a(heavy.totalCostPaise > baseline.totalCostPaise * 2,
    'Tripling LLM call volume more than doubles total cost (LLM dominates)');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
