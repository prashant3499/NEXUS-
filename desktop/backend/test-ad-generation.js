'use strict';

const AD = require('./src/adGeneration');
const UE = require('./src/unitEconomics');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('CREATIVE GENERATION — shape and prompt content');
{
  const product = {
    id: 'p1', title: 'Khurja Blue Pottery Vase',
    artisan: 'Ramvati Devi', region: 'Uttar Pradesh', craft: 'blue pottery',
    gi: 'Khurja Pottery', vertical: 'handicrafts',
  };
  const ad = AD.generateAdCreative({ product, channel: 'instagram', tone: 'artisan_story' });
  a(ad.channel === 'instagram',                            'Channel echoed');
  a(ad.tone === 'artisan_story',                            'Tone echoed');
  a(ad.product_ref === 'p1',                                'Product ref set');
  a(ad.char_limits.headline === 50,                         'Char limits applied for channel');
  a(ad.prompt.includes('Khurja Blue Pottery Vase'),         'Prompt includes product title');
  a(ad.prompt.includes('Ramvati Devi'),                     'Prompt includes artisan name');
  a(ad.prompt.includes('Khurja Pottery'),                   'Prompt includes GI tag');
  a(ad.prompt.includes('Instagram'),                        'Prompt includes channel label');
  a(ad.prompt.includes('warm, first-person'),               'Prompt includes tone description');
  a(ad.prompt.includes('Return JSON exactly'),              'Prompt asks for JSON');
  a(ad.creative.headline === null,                          'Creative placeholder until LLM fills it');
}

sec('CREATIVE GENERATION — validation');
{
  let threw = false;
  try { AD.generateAdCreative({}); } catch (e) { threw = true; }
  a(threw, 'No product throws');

  threw = false;
  try { AD.generateAdCreative({ product: { title: 'X' }, channel: 'tv' }); } catch (e) { threw = true; }
  a(threw, 'Unknown channel throws');

  threw = false;
  try { AD.generateAdCreative({ product: { title: 'X' }, channel: 'whatsapp', tone: 'aggressive' }); } catch (e) { threw = true; }
  a(threw, 'Unknown tone throws');
}

sec('CREATIVE GENERATION — different channels get different limits');
{
  const product = { id: 'p2', title: 'Pashmina Shawl' };
  const wapp = AD.generateAdCreative({ product, channel: 'whatsapp' });
  const goog = AD.generateAdCreative({ product, channel: 'google' });
  a(wapp.char_limits.body  > goog.char_limits.body,         'WhatsApp allows longer body than Google');
  a(goog.char_limits.headline < wapp.char_limits.headline,  'Google has shorter headline limit');
}

// ────────────────────────────────────────────────────────────
sec('CAMPAIGN REACH — channel economics');
{
  // ₹1000 on WhatsApp at ₹80 CPM and 12 reach/rupee
  const r = AD.estimateCampaignReach({ channel: 'whatsapp', budgetPaise: 100000, creativeCostPaise: 200 });
  a(r.channel === 'whatsapp',                                  'Channel set');
  a(r.spendablePaise === 100000 - 200,                          'Creative cost subtracted from spendable');
  a(r.estimatedReach > 0,                                       'Has positive reach');
  // Higher CPM channel = lower reach for same budget
  const g = AD.estimateCampaignReach({ channel: 'google', budgetPaise: 100000 });
  a(g.estimatedReach < r.estimatedReach,                        'Google reach < WhatsApp reach for same budget');
}

sec('CAMPAIGN REACH — validation');
{
  let threw = false;
  try { AD.estimateCampaignReach({ channel: 'tv', budgetPaise: 1000 }); } catch (e) { threw = true; }
  a(threw, 'Unknown channel throws');

  threw = false;
  try { AD.estimateCampaignReach({ channel: 'whatsapp', budgetPaise: 0 }); } catch (e) { threw = true; }
  a(threw, 'Zero budget throws');
}

// ────────────────────────────────────────────────────────────
sec('COST ATTRIBUTION — logs to ledger with correct ref');
{
  const ledger = UE.createLedger();
  AD.attributeAdCost(ledger, { sellerId: 'cust_ramvati', channel: 'whatsapp', amountPaise: 5000 });
  AD.attributeAdCost(ledger, { sellerId: 'cust_ramvati', channel: 'instagram', amountPaise: 8000 });
  AD.attributeAdCost(ledger, { sellerId: 'cust_mahesh',  channel: 'google',    amountPaise: 12000 });

  a(ledger.costPerCustomer('cust_ramvati') === 13000, 'Ramvati ad costs sum correctly');
  a(ledger.costPerCustomer('cust_mahesh')  === 12000, 'Mahesh ad costs sum correctly');
  a(ledger.byCategory().acquisition === 25000,        'All flow to acquisition category');

  const entries = ledger.getEntries({ category: 'acquisition' });
  a(entries[0].meta.source === 'adGeneration',         'Entry meta tagged with source');
  a(entries[0].meta.channel === 'whatsapp',            'Entry meta records channel');
}

sec('COST ATTRIBUTION — validation');
{
  const ledger = UE.createLedger();
  let threw = false;
  try { AD.attributeAdCost(null, { sellerId: 'x', channel: 'whatsapp', amountPaise: 100 }); } catch (e) { threw = true; }
  a(threw, 'Null ledger throws');

  threw = false;
  try { AD.attributeAdCost(ledger, { channel: 'whatsapp', amountPaise: 100 }); } catch (e) { threw = true; }
  a(threw, 'Missing sellerId throws');

  threw = false;
  try { AD.attributeAdCost(ledger, { sellerId: 'x', channel: 'tv', amountPaise: 100 }); } catch (e) { threw = true; }
  a(threw, 'Unknown channel throws');

  threw = false;
  try { AD.attributeAdCost(ledger, { sellerId: 'x', channel: 'whatsapp', amountPaise: -5 }); } catch (e) { threw = true; }
  a(threw, 'Negative amount throws');
}

// ────────────────────────────────────────────────────────────
sec('SELLER MARGIN AFTER ADS — baseline vs adjusted');
{
  const baseline = UE.tierProfit('vyapari');
  // No ad spend → margin matches baseline
  const m0 = AD.sellerMarginAfterAds({ tier: 'vyapari', adSpendPaise: 0 });
  a(m0.adjustedMarginPaise === baseline.marginPaise,    'Zero ad spend → baseline margin preserved');

  // Add ad spend → margin shrinks
  const m1 = AD.sellerMarginAfterAds({ tier: 'vyapari', adSpendPaise: 50000 });
  a(m1.adjustedMarginPaise === baseline.marginPaise - 50000, 'Ad spend reduces margin by exact paise');
  a(m1.adjustedMarginPaise < baseline.marginPaise,            'Margin shrinks with ad spend');
}

sec('SELLER MARGIN AFTER ADS — custom GMV');
{
  const m = AD.sellerMarginAfterAds({ tier: 'karigar', gmvPaise: 1000000, adSpendPaise: 5000 });
  a(m.revenuePaise > 0,            'Custom GMV used');
  a(m.adSpendPaise === 5000,       'Ad spend echoed');
  a('healthy' in m,                'Healthy flag returned');
}

// ────────────────────────────────────────────────────────────
sec('GUARDED AD SPEND — in-subscription budget gate');
{
  // Vyapari: in-sub budget = ₹374.85/mo (37485 paise)
  // Small spend, well within budget, baseline GMV
  const r1 = AD.guardedAdSpend({ sellerId: 's1', tier: 'vyapari', plannedSpendPaise: 10000 });
  a(r1.approved === true && r1.requiresHITL === false,
    'Small spend within budget → auto-approved');

  // Spending right at budget — still auto
  const r2 = AD.guardedAdSpend({ sellerId: 's1', tier: 'vyapari', plannedSpendPaise: 37000 });
  a(r2.approved === true && r2.requiresHITL === false,
    'Spend just under in-sub budget → auto-approved');

  // Spending 50% over budget → HITL
  const r3 = AD.guardedAdSpend({ sellerId: 's1', tier: 'vyapari', plannedSpendPaise: 56000 });
  a(r3.approved === true && r3.requiresHITL === true,
    'Spend over in-sub budget → HITL required');
  a(/in-subscription budget/i.test(r3.reason),
    'HITL reason names the budget');

  // Spending 3x over budget → hard reject
  const r4 = AD.guardedAdSpend({ sellerId: 's1', tier: 'vyapari', plannedSpendPaise: 200000 });
  a(r4.approved === false,
    'Spend > 2x in-sub budget → rejected');
}

sec('GUARDED AD SPEND — margin floor enforced');
{
  // Karigar tier with very low GMV — margin tight, even small ad spend triggers floor
  const r = AD.guardedAdSpend({
    sellerId: 's2', tier: 'karigar',
    gmvPaise: 500000,            // ₹5k GMV (way below baseline ₹30k)
    plannedSpendPaise: 50000,    // ₹500 ad spend — would crater margin
  });
  // Either rejected (negative margin) or HITL (below floor)
  a(r.approved === false || r.requiresHITL === true,
    'Spend that pushes margin below floor → blocked or HITL');
  a(r.marginAfter !== null,
    'Margin breakdown returned even on rejection');
}

sec('GUARDED AD SPEND — cumulative spend in same month');
{
  // Vyapari with ₹35k already spent. Another ₹10k pushes total over budget.
  const r = AD.guardedAdSpend({
    sellerId: 's3', tier: 'vyapari',
    plannedSpendPaise: 10000,
    alreadySpentPaise: 35000,
  });
  a(r.requiresHITL === true,
    'Cumulative spend over budget → HITL');
}

sec('GUARDED AD SPEND — sansthan exempted from budget cap');
{
  // Sansthan has no fixed monthly budget — only margin floor applies
  const r = AD.guardedAdSpend({
    sellerId: 'enterprise', tier: 'sansthan',
    plannedSpendPaise: 500000,
  });
  a(r.approved === true,
    'Sansthan large spend approved (margin still healthy at custom GMV)');
}

sec('GUARDED AD SPEND — validation');
{
  const r1 = AD.guardedAdSpend({ sellerId: 's', tier: 'unknown', plannedSpendPaise: 100 });
  a(r1.approved === false, 'Unknown tier rejected');

  const r2 = AD.guardedAdSpend({ sellerId: 's', tier: 'vyapari', plannedSpendPaise: 0 });
  a(r2.approved === false, 'Zero spend rejected (not a meaningful spend)');

  const r3 = AD.guardedAdSpend({ sellerId: 's', tier: 'vyapari', plannedSpendPaise: 10.5 });
  a(r3.approved === false, 'Non-integer spend rejected');
}

sec('GUARDED AD SPEND — custom floor and cap');
{
  // Tighter floor: 50%
  const r = AD.guardedAdSpend({
    sellerId: 's', tier: 'vyapari',
    plannedSpendPaise: 20000,
    opts: { marginFloorPct: 50 },
  });
  // Vyapari baseline margin is ~62%, with ₹200 ad spend it'd drop slightly
  // The exact behavior depends on margin math; check that the floor is consulted
  a('approved' in r && 'requiresHITL' in r && 'marginAfter' in r,
    'Custom floor produces a structured decision');
}

// ────────────────────────────────────────────────────────────
sec('COHORT RANKING — headroom-ordered');
{
  const sellers = [
    { id: 'a', tier: 'niryatak', gmvPaise: 60000000, alreadySpentPaise:  20000 },  // big tier, low spend
    { id: 'b', tier: 'karigar',  gmvPaise:  3000000, alreadySpentPaise:   2000 },  // small tier
    { id: 'c', tier: 'vyapari',  gmvPaise: 15000000, alreadySpentPaise:   8000 },  // mid
    { id: 'd', tier: 'vyapari',  gmvPaise: 15000000, alreadySpentPaise:  30000 },  // mid, near budget
    { id: 'x', tier: 'unknown',  gmvPaise: 1,         alreadySpentPaise: 0      },  // filtered out
  ];
  const ranked = AD.rankAdHeadroom(sellers);
  a(ranked.length === 4,                                  'Unknown tier filtered, 4 valid');
  a(ranked[0].sellerId === 'a',                           'Niryatak has most headroom (top of list)');
  for (let i = 1; i < ranked.length; i++) {
    a(ranked[i].headroomBeforeFloorPaise <= ranked[i-1].headroomBeforeFloorPaise,
      `Ranked[${i}] headroom ≤ ranked[${i-1}] (sorted desc)`);
  }
  a('currentMarginPct' in ranked[0],                      'Each entry reports current margin %');
  a('remainingInSubBudgetPaise' in ranked[0],             'Each entry reports remaining in-sub budget');
}

// ────────────────────────────────────────────────────────────
sec('INTEGRATION — end-to-end ad campaign flow');
{
  const ledger = UE.createLedger();
  const product = { id: 'p_x', title: 'Pashmina Shawl', artisan: 'Begum', region: 'Kashmir' };

  // 1. Check we can afford to advertise for this Vyapari seller
  const guard = AD.guardedAdSpend({
    sellerId: 'cust_begum', tier: 'vyapari', plannedSpendPaise: 15000,
  });
  a(guard.approved === true,                              'Pre-flight guard approves the spend');
  a(guard.requiresHITL === false,                          'No HITL needed for this size');

  // 2. Generate creative
  const creative = AD.generateAdCreative({ product, channel: 'instagram', tone: 'premium' });
  a(creative.prompt.length > 100,                          'Creative prompt is substantial');

  // 3. Estimate reach
  const reach = AD.estimateCampaignReach({ channel: 'instagram', budgetPaise: 15000 });
  a(reach.estimatedReach > 0,                              'Reach estimated');

  // 4. Run the campaign (mocked) and log the cost
  AD.attributeAdCost(ledger, {
    sellerId: 'cust_begum', channel: 'instagram', amountPaise: 15000, campaignId: 'camp_001',
  });
  a(ledger.costPerCustomer('cust_begum') === 15000,        'Spend attributed to seller');

  // 5. Verify post-campaign margin is still healthy
  const post = AD.sellerMarginAfterAds({
    tier: 'vyapari', adSpendPaise: ledger.costPerCustomer('cust_begum'),
  });
  a(post.healthy === true,                                 'Post-campaign margin still healthy');
  a(post.adjustedMarginPct >= 30,                          'Margin floor preserved');
}

sec('Ad budget is INCLUDED in subscription');
{
  // Included budget = subscription price × allocation %. Tracks live price.
  a(AD.includedAdBudget('karigar', 49900) === 4990,     'Karigar 10% of ₹499 = ₹49.90');
  a(AD.includedAdBudget('karigar', 99900) === 9990,     'Tracks founder price change (₹999 → ₹99.90)');
  a(AD.includedAdBudget('niryatak', 799900) === 143982, 'Niryatak 18% of ₹7999');
  a(AD.includedAdBudget('sansthan', null) === null,     'Sansthan custom → null');
  // Status view for the seller
  const st = AD.adBudgetStatus('karigar', 2000, 49900);
  a(st.included_paise === 4990,                            'Status includes monthly allowance');
  a(st.spent_paise === 2000,                               'Status tracks spend');
  a(st.remaining_paise === 2990,                           'Status computes remaining');
  a(st.included_in_subscription === true,                  'Flagged as included in subscription (no extra charge)');
  a(st.pct_used === 40,                                    'Percent used computed');
  // Spending beyond the allowance clamps remaining at 0 (no negative)
  const over = AD.adBudgetStatus('karigar', 99999, 49900);
  a(over.remaining_paise === 0,                            'Overspend clamps remaining at 0');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
