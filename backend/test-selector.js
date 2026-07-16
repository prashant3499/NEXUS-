'use strict';
const { resolve, MODEL, FULFILMENT, KYC_TIER } = require('./src/selector');

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  \u2713 ' + m); } else { fail++; console.log('  \u2717 FAIL: ' + m); } };
const sec = (s) => console.log('\n\u2501\u2501\u2501 ' + s + ' \u2501\u2501\u2501\n');

sec('CLEAN CASES (regression — must still work)');

let r = resolve({ isMaker: true, hasAadhaar: true });
assert(r.model === MODEL.MOR, 'Individual artisan \u2192 MoR');
assert(r.liability_map.customer === 'NONE', '  \u2514 zero liability');

r = resolve({ hasGSTIN: true, isExporter: true, hasIEC: true, isRegisteredBusiness: true });
assert(r.model === MODEL.SAAS, 'Registered exporter (with IEC) \u2192 SaaS');

r = resolve({ isCooperativeMember: true, cooperativeRegistered: true });
assert(r.model === MODEL.UMBRELLA, 'Registered cooperative member \u2192 Umbrella');

r = resolve({ sellsServices: true });
assert(r.model === MODEL.AGENT, 'Pure tourism operator \u2192 Agent');

sec('EDGE CASES (the bulletproofing)');

// 1. Minor
r = resolve({ isMaker: true, age: 15 });
assert(r.model === MODEL.BLOCKED, 'E1: Minor without guardian \u2192 BLOCKED (Contract Act s.11)');
r = resolve({ isMaker: true, age: 15, hasGuardian: true, hasAadhaar: true });
assert(r.model === MODEL.GUARDIAN, 'E1: Minor WITH guardian \u2192 Guardian-MoR');

// 2. Turnover migration
r = resolve({ isMaker: true, hasAadhaar: true, annualTurnover: 2200000 });
assert(r.migration_watch.length > 0, 'E2: MoR supplier over \u20B920L \u2192 migration watch raised');

// 3. GSTIN but no IEC, wants export
r = resolve({ hasGSTIN: true, isRegisteredBusiness: true, wantsToExport: true, hasIEC: false });
assert(r.model === MODEL.HYBRID, 'E3: GSTIN no IEC + export \u2192 Hybrid (domestic SaaS, export MoR)');
assert(!!r.liability_map.export_sales, '  \u2514 split liability by destination');

// 4. Informal cooperative
r = resolve({ isCooperativeMember: true, cooperativeRegistered: false, hasVoterId: true });
assert(r.model === MODEL.MOR, 'E4: Informal SHG \u2192 individual MoR (cannot shield)');

// 5. Tourism + products
r = resolve({ sellsServices: true, alsoSellsProducts: true });
assert(r.model === MODEL.HYBRID, 'E5: Tourism + products \u2192 Hybrid (agent + MoR)');
assert(!!r.liability_map.for_the_experience && !!r.liability_map.for_the_products, '  \u2514 two liability maps');

// 6. NRI artisan
r = resolve({ isMaker: true, isNRI: true });
assert(r.model === MODEL.MOR && r.kyc_tier === KYC_TIER.T3, 'E6: NRI artisan \u2192 MoR with OCI/passport KYC (T3)');
assert(r.required_actions.some(a => a.includes('OCI')), '  \u2514 OCI/passport + FEMA flagged');

// 7. Reseller
r = resolve({ isReseller: true, isMaker: false, hasGSTIN: true });
assert(r.model === MODEL.SAAS && r.kyc_tier === KYC_TIER.T3, 'E7: Reseller \u2192 higher scrutiny (T3)');
assert(r.required_actions.some(a => a.includes('provenance')), '  \u2514 provenance proof required');

// 8. Composition scheme
r = resolve({ hasGSTIN: true, isRegisteredBusiness: true, gstComposition: true });
assert(r.notes.some(n => n.includes('composition')), 'E8: Composition scheme \u2192 distinct TCS handling flagged');

// 9. Partial documentation
r = resolve({ isMaker: true, hasVoterId: true, bankVerified: true });
assert(r.kyc_tier === KYC_TIER.T1, 'E9: Voter ID + bank only \u2192 KYC Tier 1 (can still sell)');
r = resolve({ isMaker: true });
assert(r.kyc_tier === KYC_TIER.T0, 'E9: No documents \u2192 Tier 0 (browse only)');

// 10. Deceased
r = resolve({ isMaker: true, isDeceasedOrIncapacitated: true });
assert(r.model === MODEL.BLOCKED, 'E10: Deceased/incapacitated \u2192 BLOCKED, payout to nominee');
assert(r.required_actions.some(a => a.includes('nominee') || a.includes('heir')), '  \u2514 nominee/heir path');

// 11. Disputed identity
r = resolve({ isMaker: true, identityDisputed: true });
assert(r.kyc_tier === KYC_TIER.CONDITIONAL, 'E11: Disputed identity \u2192 Conditional tier (capped, not rejected)');
assert(r.required_actions.some(a => a.includes('10,000')), '  \u2514 \u20B910K cap until resolved');

// 12. Dual-role buyer+seller
r = resolve({ isBuyer: true, isSeller: true, isMaker: true });
assert(r.model === MODEL.HYBRID, 'E12: Buyer+seller \u2192 Hybrid (liability splits by transaction)');

// 13. Institutional buyer
r = resolve({ isBuyer: true, isInstitutional: true });
assert(r.model === MODEL.DEMAND, 'E13: Institutional buyer \u2192 Demand side');
assert(r.required_actions.some(a => a.includes('TDS')), '  \u2514 they deduct TDS on platform');

// 14. Consignment vs outright
r = resolve({ isMaker: true, hasAadhaar: true, fulfilment: FULFILMENT.CONSIGNMENT });
assert(r.fulfilment === FULFILMENT.CONSIGNMENT, 'E14: Consignment fulfilment respected');
r = resolve({ isMaker: true, hasAadhaar: true });
assert(r.fulfilment === FULFILMENT.DROPSHIP, 'E14: Default fulfilment = dropship (lowest risk)');

// 15. Returns liability
r = resolve({ isMaker: true, hasAadhaar: true });
assert(r.notes.some(n => n.includes('return')), 'E15: Returns \u2192 platform absorbs, recourse-to-supplier clause noted');

sec('INTERNATIONAL BUYER');
r = resolve({ isBuyer: true, isInternational: true });
assert(r.model === MODEL.DEMAND, 'International buyer \u2192 Demand side');
assert(r.required_actions.some(a => a.includes('CSRD')), '  \u2514 EU CSRD report flagged');

console.log('\n' + '\u2550'.repeat(52));
console.log('  RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('\u2550'.repeat(52));
process.exit(fail > 0 ? 1 : 0);
