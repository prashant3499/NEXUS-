'use strict';

/**
 * test-seller-ads.js — sellers generate ads (same engine as the platform),
 * bounded by a per-tier monthly quota that keeps the feature never-in-loss.
 */

const S = require('./src/sellerAds');
const engine = require('./src/adGeneration');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const seller = { id: 's1', archetype: 'vyapari', name: 'Ramvati Devi', cluster: 'Varanasi' };
const product = { title: 'Banarasi Silk Saree', vertical: 'gi', price_paise: 850000, gi_tag: 'Banarasi Saree' };

sec('Quota by tier');
{
  a(S.quotaFor('karigar') === 8, 'Karigar gets 8/mo');
  a(S.quotaFor('niryatak') === 80, 'Niryatak gets 80/mo');
  a(S.quotaFor('unknown') === 0, 'Unknown tier gets 0');
  const st = S.quotaStatus('vyapari', 5);
  a(st.remaining === 25 && st.quota === 30, 'Status reports remaining');
  a(st.exhausted === false, 'Not exhausted at 5/30');
}

sec('Generate a product ad (same engine as the platform)');
{
  const r = S.generateSellerAd({ seller, subject: 'product', product, channel: 'instagram', tone: 'artisan_story', usedThisMonth: 0 }, engine);
  a(r.ok === true, 'Generates an ad');
  a(r.ad && r.ad.creative, 'Returns creative from the shared engine');
  a(r.quota.used === 1, 'Quota increments to 1');
  a(r.included_in_subscription === true, 'Cost is included in subscription');
}

sec('Generate a MAKER (seller-story) ad');
{
  const r = S.generateSellerAd({ seller, subject: 'maker', product: { vertical: 'gi' }, channel: 'facebook', tone: 'artisan_story', usedThisMonth: 0 }, engine);
  a(r.ok === true, 'Generates a maker ad without a product');
  a(r.ad.subject === 'maker', 'Subject is the maker');
}

sec('QUOTA GATE — the never-in-loss control');
{
  const exhausted = S.generateSellerAd({ seller, subject: 'product', product, usedThisMonth: 30 }, engine);
  a(exhausted.ok === false, 'Blocks when quota is used up');
  a(/used all/i.test(exhausted.reason), 'Explains the quota is exhausted');
  const noPlan = S.generateSellerAd({ seller: { id: 's', archetype: 'unknown' }, product, usedThisMonth: 0 }, engine);
  a(noPlan.ok === false, 'Zero-quota tier cannot generate');
}

sec('Cost exposure is bounded (never-in-loss proof)');
{
  // Even at full quota, the inference cost must stay far below the tier price.
  const TIER_PRICE = { karigar: 49900, vyapari: 249900, niryatak: 799900 };
  for (const tier of ['karigar', 'vyapari', 'niryatak']) {
    const exp = S.costExposure(tier);
    a(exp.max_cost_paise < TIER_PRICE[tier] * 0.5, `${tier}: max ad cost (\u20b9${exp.max_cost_paise / 100}) stays under half the plan price — never-in-loss safe`);
  }
}

sec('Validation');
{
  const noProduct = S.generateSellerAd({ seller, subject: 'product', usedThisMonth: 0 }, engine);
  a(noProduct.ok === false, 'Product ad needs a product');
  const noEngine = S.generateSellerAd({ seller, subject: 'product', product, usedThisMonth: 0 }, null);
  a(noEngine.ok === false, 'No engine → graceful failure');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
