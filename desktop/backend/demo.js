'use strict';
// One-command end-to-end demo of the unified platform.
// Run: node demo.js
const { Platform } = require('./src/platform');
const { FileStore } = require('./src/store');

const store = new FileStore(require('path').join(__dirname, 'data', 'demo.json'));
store.reset();
const plat = new Platform(store);

const line = (s) => console.log('\n\x1b[33m' + s + '\x1b[0m');

line('1. Undocumented Hindi artisan onboards');
const ramvati = plat.onboard({ isMaker: true, hasVoterId: true, language: 'hi' });
console.log(`   ${ramvati.model} | liability: ${ramvati.liability.customer} | KYC tier ${ramvati.kyc_tier}`);

line('2. Registered exporter onboards');
const mahesh = plat.onboard({ hasGSTIN: true, isExporter: true, hasIEC: true, isRegisteredBusiness: true });
console.log(`   ${mahesh.model} | keeps own seller-of-record status`);

line('3. Artisan lists a vase; platform sells it to London');
const vase = plat.listProduct(ramvati.id, { title: 'Blue Pottery Vase', supplierPrice: 850, sellPrice: 1580, language: 'hi' });
const order = plat.processOrder(vase.id, { buyerName: 'Sophie', buyerEmail: 's@l.uk', isExport: true });
console.log(`   seller of record: ${order.seller_of_record} | artisan liability: ${order.artisan_liability}`);
console.log(`   buyer paid ₹1,580 → artisan receives ${order.slice.seller_payout}`);

line('4. Tourism: T0 guest blocked from adventure, allowed for cultural');
console.log(`   adventure: ${plat.book({category:'adventure'},{kycTier:0},{licenseVerified:true,cglIndemnity:true}).allowed}`);
console.log(`   cultural:  ${plat.book({category:'cultural'},{kycTier:0},{licenseVerified:true,cglIndemnity:true}).allowed}`);

line('5. Cost engine: cold-start spend allowed; cheapest inference path');
console.log(`   can spend ₹50K at ₹0 revenue: ${plat.canSpend(5000000,{monthlyRevenue:0}).allowed} (from carve-out)`);

line('6. Everything persisted to data/demo.json');
console.log(`   ledger events: ${plat.ledger.length}`);
console.log('\n\x1b[32m✓ Full lifecycle ran end to end, status-aware, persisted.\x1b[0m\n');

// ── Payments addendum ──
(async () => {
  const { METHOD } = require('./src/payments');
  const line = (s) => console.log('\n\x1b[33m' + s + '\x1b[0m');
  const p2 = new Platform();
  const ar = p2.onboard({ isMaker: true, hasVoterId: true, language: 'hi' });
  const pr = p2.listProduct(ar.id, { title: 'Vase', supplierPrice: 850, sellPrice: 1580, language: 'hi' });

  line('7. UPI payment — full capture → Route split → settle');
  const upiOrder = await p2.processOrder(pr.id, { buyerName: 'Sophie', isExport: true, paymentMethod: METHOD.UPI, authPayload: { vpa: 'sophie@oksbi' } });
  console.log(`   UPI ${upiOrder.payment.state} | platform held float: ${upiOrder.payment.float_held_by_platform}`);
  upiOrder.payment.split.forEach(s => console.log(`     ${s.account}: ${s.amount}`));

  line('8. Card payment — tokenized, PCI-safe');
  const cardOrder = await p2.processOrder(pr.id, { buyerName: 'Ahmed', paymentMethod: METHOD.CARD, authPayload: { cardToken: 'tok_visa' } });
  console.log(`   Card ${cardOrder.payment.state} via tokenized card`);
  console.log('\n\x1b[32m✓ UPI + card payments run end to end, split at gateway, zero float.\x1b[0m\n');
})();
