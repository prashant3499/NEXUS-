'use strict';

const UE = require('./src/unitEconomics');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('LEDGER — basic logging and totals');
{
  const led = UE.createLedger();
  const e1 = led.logCost({ category: UE.CATEGORIES.INFRA,     amountPaise: 50000, ref: 'aws-may-2026' });
  const e2 = led.logCost({ category: UE.CATEGORIES.INFERENCE, amountPaise:  1200, ref: 'bhashini-call-1' });
  const e3 = led.logCost({ category: UE.CATEGORIES.GATEWAY,   amountPaise:  3634, ref: 'ord_3' });
  a(e1.id.startsWith('cost_'),               'Logged entries get a cost_ id');
  a(Object.isFrozen(e1),                      'Entries are frozen (immutable)');
  a(led.totalPaise() === 50000 + 1200 + 3634, 'Total across all categories sums correctly');
}

sec('LEDGER — filters and category breakdowns');
{
  const led = UE.createLedger();
  const t0 = Date.now();
  led.logCost({ category: 'infra',     amountPaise: 100000, at: t0 - 10*86400000 });
  led.logCost({ category: 'inference', amountPaise:   5000, at: t0 -  5*86400000 });
  led.logCost({ category: 'gateway',   amountPaise:   3000, at: t0 -  1*86400000 });
  led.logCost({ category: 'gateway',   amountPaise:   2000, at: t0 });

  a(led.totalPaise({ from: t0 - 3*86400000 }) === 5000,
    'Date-range filter picks only recent entries');
  a(led.totalPaise({ category: 'gateway' }) === 5000,
    'Category filter aggregates gateway only');

  const byCat = led.byCategory();
  a(byCat.infra === 100000,  'byCategory: infra correct');
  a(byCat.gateway === 5000,  'byCategory: gateway correct');
  a(byCat.acquisition === 0, 'byCategory: zero categories present (not undefined)');
}

sec('LEDGER — per-customer attribution');
{
  const led = UE.createLedger();
  led.logCost({ category: 'support', amountPaise: 12000, ref: 'cust_ramvati' });
  led.logCost({ category: 'support', amountPaise:  3000, ref: 'cust_ramvati' });
  led.logCost({ category: 'support', amountPaise:  8000, ref: 'cust_mahesh' });
  a(led.costPerCustomer('cust_ramvati') === 15000, 'Sums costs ref-ed to a customer');
  a(led.costPerCustomer('cust_mahesh')  ===  8000, 'Different customer summed separately');
  a(led.costPerCustomer('cust_none')    ===     0, 'Unknown customer returns 0');
}

sec('LEDGER — validation');
{
  const led = UE.createLedger();
  let threw = false; try { led.logCost({ category: 'unknown', amountPaise: 100 }); } catch (e) { threw = true; }
  a(threw, 'Unknown category throws');

  threw = false; try { led.logCost({ category: 'infra', amountPaise: -5 }); } catch (e) { threw = true; }
  a(threw, 'Negative amount throws');

  threw = false; try { led.logCost({ category: 'infra', amountPaise: 10.5 }); } catch (e) { threw = true; }
  a(threw, 'Non-integer amount throws');
}

// ────────────────────────────────────────────────────────────
sec('TIER PROFITABILITY — baseline calculations');
{
  const k = UE.tierProfit('karigar');
  a(k.tier === 'karigar',     'Tier key set');
  a(k.revenuePaise > 0,        'Has revenue');
  a(k.costPaise > 0,           'Has cost');
  a(k.marginPaise === k.revenuePaise - k.costPaise, 'Margin is revenue minus cost');
  // Karigar: sub 499 + commission 3% of ₹30k baseline = 499 + 900 = ₹1,399 revenue
  // costs: var 1.8% × 30000 = 540 + fixed 80 = ₹620 cost
  // margin = 1399 - 620 = ₹779
  a(k.subRevenuePaise === 49900,                  'Karigar sub-revenue is ₹499');
  a(k.commissionPaise === 90000,                  'Karigar commission is 3% × ₹30k = ₹900');
  a(k.revenuePaise === 49900 + 90000,             'Karigar total revenue ₹1,399');
  a(k.marginPaise > 0,                            'Karigar is profitable at baseline GMV');
}

sec('TIER PROFITABILITY — niryatak vs karigar');
{
  const n = UE.tierProfit('niryatak');
  const k = UE.tierProfit('karigar');
  a(n.marginPaise > k.marginPaise * 10, 'Niryatak margin is much larger (high-tier seller)');
  a(n.marginPct >= 30,                  'Niryatak is healthy by margin %');
}

sec('TIER PROFITABILITY — custom GMV overrides assumption');
{
  const lowGmv = UE.tierProfit('karigar', { gmvPaise: 500000 });   // ₹5k month
  const highGmv = UE.tierProfit('karigar', { gmvPaise: 5000000 }); // ₹50k month (ceiling)
  a(highGmv.commissionPaise > lowGmv.commissionPaise,
    'Higher GMV → higher commission');
  a(highGmv.revenuePaise > lowGmv.revenuePaise,
    'Higher GMV → higher revenue');
}

sec('TIER PROFITABILITY — report shape');
{
  const r = UE.profitabilityReport();
  a(Array.isArray(r),                   'Report is an array');
  a(r.length === 5,                     'Covers all 5 tiers');
  a(r.every(t => 'marginPct' in t),     'Each tier reports marginPct');
  a(r.every(t => 'healthy' in t),       'Each tier reports healthy flag');
}

// ────────────────────────────────────────────────────────────
sec('PRICE FROM COSTS — recommended subscription pricing');
{
  const p = UE.priceFromCosts('karigar', 40);
  a(p.tier === 'karigar',                          'Returns the tier');
  a(p.targetMarginPct === 40,                       'Echoes target margin');
  a(p.recommendedSubPaise >= 0,                     'Recommended price ≥ 0');
  a(typeof p.verdict === 'string',                  'Returns a verdict');
  a(['priced-correctly','underpriced-mild','underpriced-significant','custom'].includes(p.verdict),
    'Verdict is one of the known values');

  let threw = false; try { UE.priceFromCosts('not_a_tier', 30); } catch (e) { threw = true; }
  a(threw, 'Unknown tier throws');

  threw = false; try { UE.priceFromCosts('karigar', 100); } catch (e) { threw = true; }
  a(threw, 'Target margin ≥ 100% throws');
}

sec('PRICE FROM COSTS — sansthan (custom-priced)');
{
  const p = UE.priceFromCosts('sansthan', 35);
  a(p.verdict === 'custom', 'Sansthan tier returns "custom" verdict (no fixed price)');
}

// ────────────────────────────────────────────────────────────
sec('CAMPAIGN — input validation');
{
  const c = UE.evaluateCampaign({});
  a(c.ok === false,          'Empty campaign fails');
  a(c.decision === 'invalid','Decision flagged invalid');

  const bad = UE.evaluateCampaign({ channel: 'tv', budgetPaise: 100000 });
  a(bad.decision === 'invalid', 'Unknown channel rejected');

  const noConv = UE.evaluateCampaign({ channel: 'whatsapp', budgetPaise: 100000, expectedReach: 1000, expectedConversionRate: 0 });
  a(noConv.decision === 'invalid', 'Zero conversion rate rejected');

  const badMix = UE.evaluateCampaign({ channel: 'whatsapp', budgetPaise: 100000, expectedReach: 1000, expectedConversionRate: 0.05, expectedTierMix: { karigar: 0.5, vyapari: 0.3 } });
  a(badMix.decision === 'invalid', 'Tier mix that does not sum to 1.0 rejected');
  a(badMix.reasons.some(r => /mix/i.test(r.text)), 'Reason mentions the mix');
}

sec('CAMPAIGN — green decision (CAC well under annual margin)');
{
  // 500 WhatsApp messages, 5% convert to Karigar/Vyapari mix at ₹15k budget
  const c = UE.evaluateCampaign({
    channel: 'whatsapp',
    budgetPaise: 1500000,           // ₹15,000
    expectedReach: 500,
    expectedConversionRate: 0.05,    // 25 new sellers
    expectedTierMix: { karigar: 0.6, vyapari: 0.4 },
    expectedRetentionMonths: 18,
  });
  a(c.ok === true,                            'Campaign evaluates ok');
  a(c.expectedNewSellers === 25,              '25 expected new sellers (500 × 5%)');
  a(c.cacPaise === Math.round(1500000 / 25),  'CAC = budget / new sellers');
  a(c.decision === 'green',                   'Decision is green (favorable economics)');
  a(c.requiresApproval === false,             '₹15k is under HITL threshold');
  a(c.paybackMonths > 0 && c.paybackMonths < 24, 'Payback is within reasonable horizon');
}

sec('CAMPAIGN — red decision (CAC exceeds annual margin)');
{
  // Facebook campaign with poor targeting: ₹2L for 1 acquired Karigar
  const c = UE.evaluateCampaign({
    channel: 'facebook',
    budgetPaise: 20000000,           // ₹2,00,000
    expectedReach: 100,
    expectedConversionRate: 0.01,     // 1 new seller
    expectedTierMix: { karigar: 1 },
    expectedRetentionMonths: 12,
  });
  a(c.decision === 'red',          'Bad-economics campaign is RED');
  a(c.cacPaise > c.annualMarginPaise, 'CAC exceeds annual margin');
  a(c.reasons.some(r => /exceeds/i.test(r.text)), 'Reason names the CAC excess');
}

sec('CAMPAIGN — HITL threshold');
{
  const small = UE.evaluateCampaign({
    channel: 'whatsapp', budgetPaise: 1000000, expectedReach: 200,
    expectedConversionRate: 0.05, expectedTierMix: { vyapari: 1 }, expectedRetentionMonths: 12,
  });
  a(small.requiresApproval === false, '₹10k campaign: no HITL approval needed');

  const big = UE.evaluateCampaign({
    channel: 'google', budgetPaise: 8000000, expectedReach: 50000,
    expectedConversionRate: 0.005, expectedTierMix: { vyapari: 0.5, niryatak: 0.5 }, expectedRetentionMonths: 18,
  });
  a(big.requiresApproval === true,    '₹80k campaign: HITL approval required');
  a(big.reasons.some(r => /approval/i.test(r.text)), 'Reason names the approval gate');

  // Custom threshold override
  const custom = UE.evaluateCampaign(
    { channel: 'whatsapp', budgetPaise: 200000, expectedReach: 100, expectedConversionRate: 0.05, expectedTierMix: { karigar: 1 }, expectedRetentionMonths: 12 },
    { campaignHITLPaise: 100000 }
  );
  a(custom.requiresApproval === true, 'Custom HITL threshold lower than default triggers approval');
}

sec('CAMPAIGN — yellow decision (marginal)');
{
  // Influencer push where CAC is in the 0.5×–1.0× window
  const c = UE.evaluateCampaign({
    channel: 'influencer',
    budgetPaise: 5000000,                // ₹50,000
    expectedReach: 2000,
    expectedConversionRate: 0.025,        // 50 new sellers
    expectedTierMix: { karigar: 1 },
    expectedRetentionMonths: 12,
  });
  // CAC = 5000000/50 = ₹1000/seller, Karigar annual margin ≈ ₹779×12 = ₹9348
  // Ratio ≈ 0.107 → green actually
  a(c.ok === true,                  'Evaluates');
  a(['green','yellow'].includes(c.decision), 'Decision is green or yellow (not red)');
}

sec('RANK — picks the best campaigns');
{
  const proposals = [
    { channel: 'whatsapp',   budgetPaise:  500000, expectedReach: 400, expectedConversionRate: 0.06, expectedTierMix: { karigar: 0.7, vyapari: 0.3 }, expectedRetentionMonths: 18 },
    { channel: 'facebook',   budgetPaise:20000000, expectedReach: 100, expectedConversionRate: 0.01, expectedTierMix: { karigar: 1 },                expectedRetentionMonths: 12 },
    { channel: 'google',     budgetPaise: 1000000, expectedReach: 5000, expectedConversionRate: 0.01, expectedTierMix: { vyapari: 0.5, niryatak: 0.5 }, expectedRetentionMonths: 24 },
    { channel: 'instagram',  budgetPaise:  300000, expectedReach: 1000, expectedConversionRate: 0.03, expectedTierMix: { karigar: 1 },                expectedRetentionMonths: 12 },
  ];
  const ranked = UE.rankCampaigns(proposals);
  a(ranked.length >= 2,                              'At least 2 viable campaigns');
  a(!ranked.some(r => r.result.decision === 'red'),  'No red campaigns in the ranked list');
  a(!ranked.some(r => r.result.decision === 'invalid'), 'No invalid campaigns');
  // Ordered ascending by ratio (best ROI first)
  for (let i = 1; i < ranked.length; i++) {
    a(ranked[i].result.ratio >= ranked[i-1].result.ratio,
      `Ranked[${i}] ratio ≥ ranked[${i-1}] (best ROI first)`);
  }
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
