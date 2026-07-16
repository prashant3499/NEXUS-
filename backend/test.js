'use strict';
const { Platform, MODEL } = require('./src/platform');
const { CostEngine } = require('./src/costEngine');
const { evaluateBooking } = require('./src/tourism');

let p = 0, f = 0;
const a = (c, m) => { if (c) { p++; console.log('  \u2713 ' + m); } else { f++; console.log('  \u2717 FAIL: ' + m); } };
const sec = (s) => console.log('\n\u2501\u2501\u2501 ' + s + ' \u2501\u2501\u2501\n');

sec('UNIFIED LIFECYCLE — onboard \u2192 list \u2192 order');

const plat = new Platform();

// Undocumented artisan → MoR, zero liability
const ramvati = plat.onboard({ isMaker: true, hasVoterId: true, language: 'hi' });
a(ramvati.model === MODEL.MOR, 'Undocumented artisan onboarded \u2192 Merchant of Record');
a(ramvati.liability.customer === 'NONE', '  \u2514 zero liability');
a(ramvati.kyc_tier === 1, '  \u2514 KYC Tier 1 from voter ID (can sell)');

const vase = plat.listProduct(ramvati.id, { title: 'Blue Pottery Vase', supplierPrice: 850, sellPrice: 1580, giTag: 'GI/112/2008', language: 'hi' });
a(vase.inference_path === 'bhashini', 'Hindi listing drafted via Bhashini (free)');

const order = plat.processOrder(vase.id, { buyerName: 'Sophie', buyerEmail: 's@l.uk', isExport: true });
a(order.seller_of_record === 'platform', 'Platform is seller of record (artisan shielded)');
a(order.artisan_liability === 'NONE', 'Artisan liability NONE on the sale');

// Registered exporter → SaaS, keeps own identity
const mahesh = plat.onboard({ hasGSTIN: true, isExporter: true, hasIEC: true, isRegisteredBusiness: true });
a(mahesh.model === MODEL.SAAS, 'Registered exporter \u2192 SaaS (keeps seller-of-record)');

const gem = plat.listProduct(mahesh.id, { title: 'Kashmir Sapphire', supplierPrice: 80000, sellPrice: 150000 });
const gemOrder = plat.processOrder(gem.id, { buyerName: 'Ahmed', buyerEmail: 'a@dubai.ae', isExport: true });
a(gemOrder.seller_of_record === 'customer', 'Exporter remains seller of record');
a(gemOrder.status === 'hitl_review', 'Large export queued for HITL review');

// Blocked customer (minor, no guardian) cannot list
const minor = plat.onboard({ isMaker: true, age: 15 });
a(minor.model === MODEL.BLOCKED, 'Minor without guardian \u2192 BLOCKED');
let blocked = false;
try { plat.listProduct(minor.id, { title: 'x', supplierPrice: 1, sellPrice: 2 }); }
catch (e) { blocked = true; }
a(blocked, '  \u2514 blocked customer cannot list products');

sec('TOURISM — risk-stratified booking');

const t0ghost = { kycTier: 0 };
const verified = { kycTier: 2 };
const goodOp = { licenseVerified: true, cglIndemnity: true, adventureInsuranceBound: true };

a(plat.book({ category: 'cultural' }, t0ghost, goodOp).allowed === true, 'T0 ghost CAN book low-risk cultural');
a(plat.book({ category: 'adventure' }, t0ghost, goodOp).allowed === false, 'T0 ghost BLOCKED from high-risk adventure (KYC link)');
a(plat.book({ category: 'adventure' }, verified, goodOp).allowed === true, 'Tier-2 user CAN book adventure with good operator');

const noPremiumFront = plat.book({ category: 'adventure' }, verified, goodOp);
a(noPremiumFront.insurance_model === 'operator_bound_via_licensed_partner', 'Insurance operator-bound — platform never fronts (F1)');

const badOp = { licenseVerified: false };
a(plat.book({ category: 'eco' }, verified, badOp).allowed === false, 'Unlicensed operator blocked');

sec('COST ENGINE — phase-aware + self-improving');

const ce = new CostEngine();
// Cold start: ₹0 revenue, but spend still allowed from carve-out
a(ce.canSpend(50000_00, { monthlyRevenue: 0 }).allowed === true, 'Cold start: spend allowed from carve-out (not blocked by 2% of \u20B90)');
a(ce.canSpend(300000_00, { monthlyRevenue: 0 }).allowed === false, 'Cold start: spend over \u20B92L carve-out blocked');
// Steady state
a(ce.canSpend(1000_00, { monthlyRevenue: 500000_00, trailingRevenue: 500000_00, trailingOpex: 5000_00 }).allowed === true, 'Steady state: within 2% ceiling allowed');
a(ce.canSpend(60000_00, { monthlyRevenue: 500000_00, trailingRevenue: 500000_00, trailingOpex: 5000_00 }).allowed === false, 'Steady state: breaching 2% \u2192 blocked + HITL');

// Inference routing cheapest-first
a(ce.routeInference({ isIndic: true }, { bhashiniUp: true }).path === 'bhashini', 'Indic \u2192 Bhashini (\u20B90)');
a(ce.routeInference({ isIndic: false }, { gpuQueueDepth: 2 }).path === 'self_hosted_gpu', 'Text, low queue \u2192 GPU (\u20B90)');
a(ce.routeInference({ isIndic: false, estPaise: 500 }, { gpuQueueDepth: 20 }).path === 'api_overflow', 'High queue \u2192 capped API');

// Self-improvement
ce.record('embed_product', 'api_overflow', 800);
ce.record('embed_product', 'api_overflow', 800);
ce.record('whisper_transcribe', 'api_overflow', 1200);
const opt = ce.proposeOptimisations();
a(opt.length > 0 && opt[0].proposal.length > 0, 'Engine proposes its own cost optimisations');
a(opt.some(o => /cache/i.test(o.proposal) || /batch/i.test(o.proposal) || /bhashini/i.test(o.proposal)), '  \u2514 proposals are actionable (cache/batch/Bhashini)');

sec('AUDIT TRAIL');
a(plat.ledger.length > 0, 'Platform ledger records lifecycle events');
a(Object.isFrozen(plat.ledger[0]), 'Ledger entries are immutable');

console.log('\n' + '\u2550'.repeat(52));
console.log('  RESULTS: ' + p + ' passed, ' + f + ' failed');
console.log('\u2550'.repeat(52));
process.exit(f > 0 ? 1 : 0);
