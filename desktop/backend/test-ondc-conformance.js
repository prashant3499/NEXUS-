'use strict';

/**
 * test-ondc-conformance.js
 *
 * A REVERSE-ENGINEERING-style verification. Instead of testing that our code
 * does what we wrote, this works BACKWARD from what the ONDC network actually
 * expects of a Seller App and asserts our output would satisfy it. It encodes
 * the real ONDC retail (beckn) item/catalog contract as the source of truth and
 * checks our mapping against it — the way an integrator would QA against the
 * spec before going live, so we don't discover gaps only when the registry
 * rejects us.
 *
 * Reference contract (ONDC Retail / beckn on_search catalog item essentials):
 *   - provider.descriptor.name              (who is selling)
 *   - item.id                               (stable catalog id)
 *   - item.descriptor.name + images         (what it is)
 *   - item.price.currency == 'INR'          (priced in rupees)
 *   - item.price.value                      (decimal string, e.g. "8500.00")
 *   - item.quantity.available.count         (sellable units)
 *   - item.category_id                      (a category)
 *   - item domain in the ONDC:RETxx set     (valid retail domain)
 *   - @ondc/org/returnable                  (mandatory returns flag)
 *   - tags carry country of origin          (ONDC requires country of origin)
 */

const O = require('./src/ondc');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// The spec, expressed as assertions a live ONDC validator would make.
const VALID_DOMAINS = new Set(Object.values(O.ONDC_DOMAIN));
const DECIMAL_2 = /^\d+\.\d{2}$/;

const product = {
  id: 'p_khurja_01', status: 'active', seller_id: 's1', title: 'Khurja Blue Pottery Vase',
  description: 'Hand-thrown, hand-painted ceramic vase from the Khurja cluster.',
  vertical: 'ceramics', price_paise: 145000, stock: 8, region: 'Khurja',
  gi_tag: 'Khurja Pottery', hsn: '6913', photos: ['v1.jpg', 'v2.jpg'], returnable: true,
};
const seller = { id: 's1', archetype: 'karigar', primary_vertical: 'ceramics', payoutAccount: 'ac1' };

sec('Item conformance — every ONDC-required field present & well-formed');
{
  const it = O.toOndcItem(product, seller);
  // Work backward from each spec requirement:
  a(typeof it.id === 'string' && it.id.length > 0, 'SPEC: item.id is a stable non-empty string');
  a(VALID_DOMAINS.has(it.domain), 'SPEC: item.domain is a valid ONDC:RETxx retail domain');
  a(it.descriptor && it.descriptor.name, 'SPEC: item.descriptor.name present');
  a(Array.isArray(it.descriptor.images) && it.descriptor.images.length >= 1, 'SPEC: item.descriptor.images has at least one image');
  a(it.price && it.price.currency === 'INR', 'SPEC: price.currency is INR');
  a(DECIMAL_2.test(it.price.value), 'SPEC: price.value is a 2-decimal string (got "' + it.price.value + '")');
  a(it.quantity && it.quantity.available && Number.isInteger(it.quantity.available.count), 'SPEC: quantity.available.count is an integer');
  a(typeof it.category_id === 'string' && it.category_id, 'SPEC: category_id present');
  a(typeof it['@ondc/org/returnable'] === 'boolean', 'SPEC: @ondc/org/returnable flag present (mandatory)');
}

sec('Price math is exact (reverse-check paise → rupees)');
{
  // 145000 paise MUST serialize to exactly "1450.00" — a rounding bug here = a
  // mispriced item on the live network.
  const it = O.toOndcItem(product, seller);
  a(it.price.value === '1450.00', 'SPEC: \u20b91450 (145000 paise) maps to exactly "1450.00"');
  const odd = O.toOndcItem({ ...product, price_paise: 99 }, seller); // 99 paise = 0.99
  a(odd.price.value === '0.99', 'SPEC: 99 paise maps to "0.99" (sub-rupee exact)');
  const big = O.toOndcItem({ ...product, price_paise: 100000000 }, seller); // 10,00,000.00
  a(big.price.value === '1000000.00', 'SPEC: 10 lakh rupees maps exactly, no float drift');
}

sec('Country of origin — ONDC mandates it; verify it is always emitted');
{
  const it = O.toOndcItem(product, seller);
  const origin = it.tags.find(t => t.code === 'origin');
  a(!!origin, 'SPEC: an origin tag is present');
  const country = origin && origin.list.find(x => x.code === 'country');
  a(country && country.value === 'IND', 'SPEC: country of origin is IND (ISO-3)');
  // Even with a product that has NO region, origin/country must still emit.
  const noRegion = O.toOndcItem({ ...product, region: undefined }, seller);
  const o2 = noRegion.tags.find(t => t.code === 'origin');
  a(o2 && o2.list.some(x => x.code === 'country' && x.value === 'IND'), 'SPEC: country still emitted when cluster/region is missing');
}

sec('Provenance survives the mapping (our differentiator must reach buyers)');
{
  const it = O.toOndcItem(product, seller);
  a(it.tags.some(t => t.code === 'gi_tag' && t.list.some(x => x.value === 'Khurja Pottery')), 'GI tag reaches the ONDC item');
  a(it.tags.some(t => t.code === 'hsn' && t.list.some(x => x.value === '6913')), 'HSN (tax compliance) reaches the item');
}

sec('Catalog conformance — provider + grouping + active-only');
{
  const products = [
    product,
    { ...product, id: 'p2', vertical: 'textile' },
    { ...product, id: 'p3_draft', status: 'draft' },   // must NOT publish
  ];
  const cat = O.buildCatalog(products, () => seller);
  a(cat.provider && cat.provider.descriptor && cat.provider.descriptor.name, 'SPEC: catalog has provider.descriptor.name');
  a(cat.item_count === 2, 'SPEC: only ACTIVE items published (draft excluded — no accidental leakage)');
  a(cat.items.every(it => VALID_DOMAINS.has(it.domain)), 'SPEC: every published item has a valid domain');
  a(cat.domains.every(d => VALID_DOMAINS.has(d)), 'SPEC: catalog domains are all valid');
  // Reverse-check: each item must be resolvable back to a real product id.
  const ids = new Set(products.filter(p => p.status === 'active').map(p => p.id));
  a(cat.items.every(it => ids.has(it.id)), 'Round-trip: every published item maps back to a source product');
}

sec('Enrolment gate matches ONDC participant requirements');
{
  // ONDC requires a seller be a real, consented, settle-able entity. Reverse-
  // check: anything missing those MUST NOT reach "pending/live".
  a(O.enrollSeller(seller, { consentComplete: false, hasPayout: true }).ok === false, 'No consent → cannot enrol (platform sells on their behalf, needs authority)');
  a(O.enrollSeller({ id: 's' }, { consentComplete: true, hasPayout: false }).ok === false, 'No payout → cannot enrol (network settlement impossible)');
  const ok = O.enrollSeller(seller, { consentComplete: true, hasPayout: true });
  a(ok.ok && ok.status === O.PARTICIPATION.PENDING, 'Consent + payout → pending (awaiting registry, not auto-live)');
}

sec('No live connection is faked (honesty check)');
{
  const gw = O.makeGateway({});
  a(gw.kind === 'mock', 'Without credentials, the gateway is explicitly a mock — never pretends to be on the network');
  const live = O.makeGateway({ subscriberId: 'x', signingKey: 'y' });
  a(live.kind === 'live', 'With credentials, the live slot is selected (real client to be implemented)');
}

sec('Image requirement — items without photos are held back, not published broken');
{
  const noPhoto = O.toOndcItem({ id: 'np', price_paise: 1000, vertical: 'ceramics' }, seller);
  a(noPhoto.publishable === false, 'An item with no images is marked not-publishable');
  a(noPhoto.publish_blockers.some(b => /photo|image/i.test(b)), 'Names the missing-image blocker');
  const cat = O.buildCatalog([
    product,                                              // has photos → publishes
    { ...product, id: 'np2', photos: [] },                // no photos → held back
  ], () => seller);
  a(cat.item_count === 1, 'Only the image-having item is published');
  a(cat.not_ready_count === 1, 'The image-less item is reported as not-ready (not silently dropped)');
  a(cat.items.every(it => it.descriptor.images.length >= 1), 'Every PUBLISHED item has an image (would pass live ONDC)');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
