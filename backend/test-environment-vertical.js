'use strict';

const E = require('./src/environmentVertical');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const substantiated = {
  impact_claim: '70% recycled content, plastic-free',
  carbon_kg_avoided: 12,
  evidence: [{ type: 'recycled_declaration', ref: 'DOC-123' }, { type: 'third_party_audit', ref: 'AUD-9' }],
};
const unsubstantiated = { impact_claim: 'eco-friendly!', carbon_kg_avoided: 12, evidence: [] };

sec('Anti-greenwashing: claims need evidence');
{
  const ok = E.verifyClaim(substantiated);
  a(ok.substantiated === true, 'Substantiated claim is publishable');
  a(ok.publishable_claim && ok.shown_evidence.length === 2, 'Shows the evidence backing it');
  const bad = E.verifyClaim(unsubstantiated);
  a(bad.substantiated === false, 'Unsubstantiated claim blocked');
  a(/greenwashing/i.test(bad.blocked_reason), 'Explains the no-greenwashing rule');
  a(bad.publishable_claim === null, 'Unverified claim is not shown');
}

sec('Carbon attribution needs substantiation + accredited methodology');
{
  const method = E.makeCarbonMethodology({});
  a(method.kind === 'mock' && method.accreditedBody === false, 'Mock methodology is honestly NOT accredited');
  const noClaim = E.carbonAttribution(unsubstantiated, method);
  a(noClaim.creditable === false, 'No substantiation → not creditable');
  const withMock = E.carbonAttribution(substantiated, method);
  a(withMock.ok === true && withMock.creditable === false, 'Mock verifies but is not accredited → not truly creditable');
  const noMethod = E.carbonAttribution(substantiated, null);
  a(noMethod.creditable === false && /accredited/i.test(noMethod.reason), 'No methodology → platform cannot issue credits itself');
  const live = E.makeCarbonMethodology({ carbonApiKey: 'k', carbonRegistry: 'verra' });
  a(live.kind === 'accredited' && live.accreditedBody === true, 'Credentials → accredited methodology slot');
}

sec('Business model: the three revenue paths');
{
  const method = E.makeCarbonMethodology({});
  const sub = E.businessModel(substantiated, method);
  a(sub.paths.length === 3, 'Three revenue paths described');
  a(sub.open_paths.includes('product_sale'), 'Product sale always open');
  a(sub.open_paths.includes('csr_esg_funding'), 'CSR/ESG open when substantiated');
  a(!sub.open_paths.includes('carbon_attribution'), 'Carbon NOT open without an accredited body (mock)');
  const unsub = E.businessModel(unsubstantiated, method);
  a(unsub.open_paths.length === 1, 'Unsubstantiated listing: only the plain sale is open');
  a(/1 of 3/.test(unsub.headline), 'Headline counts open paths');
}

sec('Earnings estimate — concrete rupee numbers');
{
  const method = E.makeCarbonMethodology({});
  const priced = { ...substantiated, price_paise: 120000 };
  const est = E.earningsEstimate(priced, { csr_units: 500, green_premium_pct: 0.2 }, method);
  a(est.sale.green_premium_paise > 0, 'Substantiated listing earns a green premium');
  a(est.sale.platform_earns_paise === Math.round(est.sale.unit_price_paise * 0.03), 'Platform earns 3% on a sale');
  a(est.csr.units === 500 && est.csr.order_value_paise > 0, 'CSR bulk order computed');
  a(est.csr.platform_earns_paise === Math.round(est.csr.order_value_paise * 0.03), 'Platform earns 3% on the CSR order');
  a(est.carbon.creditable === undefined || est.carbon.creditable === false, 'Carbon not creditable on mock methodology');
  // Unsubstantiated → no premium, no CSR
  const bad = E.earningsEstimate({ ...unsubstantiated, price_paise: 120000 }, { csr_units: 500 }, method);
  a(bad.sale.green_premium_paise === 0, 'No green premium without substantiation');
  a(bad.csr.open === false, 'CSR closed without substantiation');
  // Accredited → carbon counts
  const accredited = { verify: ({ kg }) => ({ accredited: true, verified_kg: kg, value_paise: kg * 150, kind: 'accredited' }) };
  const withCarbon = E.earningsEstimate(priced, { csr_units: 100 }, accredited);
  a(withCarbon.carbon.total_paise > 0, 'Carbon value computed with an accredited partner');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
