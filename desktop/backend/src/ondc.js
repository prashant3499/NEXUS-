'use strict';

/**
 * ondc.js
 *
 * Integration with ONDC — the Open Network for Digital Commerce, the
 * Government of India's open protocol that lets a seller on one app be
 * discovered and bought by a buyer on any other app on the network. For
 * NEXUS this is the single biggest distribution unlock: an artisan listed
 * once becomes visible across every ONDC buyer app, through a government-
 * backed open channel — exactly the "reach buyers anywhere" promise.
 *
 * The platform acts as an ONDC **Seller Network Participant (Seller App)**: it
 * publishes its artisans' catalogs to the network and fulfils the protocol
 * (search → select → init → confirm). This module does the two things that are
 * pure and testable: (1) map a NEXUS product to the ONDC catalog schema, and
 * (2) manage a seller's enrolment + participation status.
 *
 * Like payments and maps, the live network gateway is a PROVIDER SEAM: a mock
 * provider runs today (so the mapping + flow are exercised end-to-end), and a
 * real ONDC gateway client drops in behind the same interface once the platform
 * has its network credentials (subscriber ID, signing keys, registry entry).
 * Nothing here fabricates a live ONDC connection.
 *
 * Pure + dependency-free.
 */

// ONDC retail domain codes relevant to craft commerce.
const ONDC_DOMAIN = Object.freeze({
  RETAIL: 'ONDC:RET10',          // Grocery/retail (general goods)
  FASHION: 'ONDC:RET12',         // Fashion / textiles / apparel
  HOME_DECOR: 'ONDC:RET16',      // Home & decor / handicrafts
});

// Map a NEXUS vertical to the closest ONDC retail domain.
const VERTICAL_TO_DOMAIN = Object.freeze({
  textile: ONDC_DOMAIN.FASHION, apparel: ONDC_DOMAIN.FASHION, jewellery: ONDC_DOMAIN.FASHION,
  handicraft: ONDC_DOMAIN.HOME_DECOR, ceramics: ONDC_DOMAIN.HOME_DECOR, woodcraft: ONDC_DOMAIN.HOME_DECOR,
  metalware: ONDC_DOMAIN.HOME_DECOR, naturals: ONDC_DOMAIN.RETAIL, environment: ONDC_DOMAIN.RETAIL, default: ONDC_DOMAIN.HOME_DECOR,
});

const PARTICIPATION = Object.freeze({
  NOT_ENROLLED: 'not_enrolled', PENDING: 'pending', LIVE: 'live', PAUSED: 'paused',
});

/**
 * toOndcItem — map a NEXUS product to an ONDC catalog item. Follows the ONDC
 * retail item shape (id, descriptor, price, quantity, category, tags) closely
 * enough to publish; a real client adds network envelope + signing.
 */
function toOndcItem(product = {}, seller = {}) {
  const domain = VERTICAL_TO_DOMAIN[product.vertical || product.category] || VERTICAL_TO_DOMAIN.default;
  const images = (product.photos || product.images || []).filter(Boolean);
  // ONDC requires at least one image. Rather than emit an item the network
  // would reject, mark it not-publish-ready so the catalog can exclude it and
  // tell the seller exactly what's missing.
  const publishable = images.length >= 1;
  return {
    id: product.id,
    domain,
    publishable,
    publish_blockers: publishable ? [] : ['at least one product photo is required by ONDC'],
    descriptor: {
      name: product.title || product.name,
      short_desc: (product.description || '').slice(0, 120),
      long_desc: product.description || '',
      images,
    },
    price: {
      currency: 'INR',
      value: ((product.price_paise || 0) / 100).toFixed(2),
    },
    quantity: { available: { count: product.stock != null ? product.stock : 1 } },
    category_id: product.vertical || product.category || 'handicraft',
    // ONDC tags carry provenance + compliance — our authenticity edge travels.
    tags: [
      { code: 'origin', list: [{ code: 'country', value: 'IND' }, { code: 'cluster', value: product.region || '' }] },
      product.gi_tag ? { code: 'gi_tag', list: [{ code: 'name', value: product.gi_tag }] } : null,
      { code: 'hsn', list: [{ code: 'code', value: product.hsn || '' }] },
      { code: 'seller_type', list: [{ code: 'archetype', value: seller.archetype || '' }] },
    ].filter(Boolean),
    '@ondc/org/returnable': product.returnable !== false,
    '@ondc/org/seller_pickup_return': false,
  };
}

/**
 * buildCatalog — assemble a publishable ONDC catalog from a set of active
 * NEXUS products + their sellers. Groups by domain (ONDC publishes per-domain).
 */
function buildCatalog(products = [], sellerOf = () => ({})) {
  const active = products.filter((p) => p.status === 'active');
  const mapped = active.map((p) => toOndcItem(p, sellerOf(p.seller_id) || {}));
  const items = mapped.filter((it) => it.publishable);
  const not_ready = mapped.filter((it) => !it.publishable).map((it) => ({ id: it.id, blockers: it.publish_blockers }));
  const byDomain = {};
  for (const it of items) (byDomain[it.domain] = byDomain[it.domain] || []).push(it);
  return {
    provider: { descriptor: { name: 'NEXUS', short_desc: 'India craft, verified & compliant' } },
    item_count: items.length,
    not_ready_count: not_ready.length,
    not_ready,
    domains: Object.keys(byDomain),
    items,
    by_domain: byDomain,
  };
}

/**
 * enrollSeller — decide whether a seller can be published to ONDC and return
 * the participation record. A seller must have completed consent (the platform
 * publishes on their behalf) and have a payable bank account.
 * @returns { ok, status, reasons, record }
 */
function enrollSeller(seller = {}, opts = {}, now = Date.now()) {
  const reasons = [];
  if (!seller.id) reasons.push('seller id required');
  if (opts.consentComplete !== true) reasons.push('seller consent + selling authorization required before ONDC publishing');
  if (!seller.payoutAccount && opts.hasPayout !== true) reasons.push('payout account required for network settlement');
  if (reasons.length) return { ok: false, status: PARTICIPATION.NOT_ENROLLED, reasons };
  return {
    ok: true,
    status: PARTICIPATION.PENDING,   // goes LIVE once the network registry confirms
    reasons: [],
    record: {
      seller_id: seller.id,
      status: PARTICIPATION.PENDING,
      domains: [VERTICAL_TO_DOMAIN[seller.primary_vertical] || VERTICAL_TO_DOMAIN.default],
      enrolled_at: now,
      subscriber_note: 'Awaiting ONDC registry confirmation (live gateway).',
    },
  };
}

/** Mark a pending enrolment live (called when the registry confirms). */
function activate(record) {
  if (!record) return { ok: false };
  record.status = PARTICIPATION.LIVE;
  record.live_at = Date.now();
  return { ok: true, record };
}

// ── Provider seam: a mock ONDC gateway so the flow runs without credentials ──
function MockOndcGateway() {
  return {
    kind: 'mock',
    publish(catalog) { return { ack: true, published: catalog.item_count, domains: catalog.domains }; },
    onSearch(intent) { return { results: [], note: 'mock gateway — no live network' }; },
  };
}
function makeGateway(config = {}) {
  // A real gateway client would be constructed here from config.subscriberId,
  // config.signingKey, config.registryUrl. Absent those, return the mock.
  if (config.subscriberId && config.signingKey) {
    return { kind: 'live', note: 'real ONDC client would be wired here', publish() { throw new Error('live ONDC client not yet implemented'); } };
  }
  return MockOndcGateway();
}

// ── ONDC + digital-commerce as GOVERNMENT SCHEMES (for the schemes engine) ──
// These are real government-backed programmes a craft seller can benefit from.
const ONDC_SCHEMES = Object.freeze([
  {
    id: 'ondc_onboarding',
    name: 'ONDC — Open Network for Digital Commerce',
    body: 'Department for Promotion of Industry and Internal Trade (DPIIT), Govt. of India',
    benefit: 'List once, be discovered and bought across every buyer app on the open network — no platform lock-in.',
    eligibility: 'Any seller with completed consent + a payout account.',
    url: 'https://ondc.org',
  },
  {
    id: 'pm_vishwakarma_digital',
    name: 'PM Vishwakarma — digital onboarding support',
    body: 'Ministry of MSME, Govt. of India',
    benefit: 'Recognition, toolkit + credit support, and digital-marketplace onboarding for traditional artisans.',
    eligibility: 'Traditional artisans/craftspeople in the listed trades.',
    url: 'https://pmvishwakarma.gov.in',
  },
  {
    id: 'digital_shakti',
    name: 'Digital commerce readiness (state e-commerce cells)',
    body: 'State Handicraft & Handloom Development Corporations',
    benefit: 'Cluster-level support to get artisans transaction-ready for digital and open-network commerce.',
    eligibility: 'Artisans in recognised craft clusters.',
    url: '',
  },
]);

module.exports = {
  ONDC_DOMAIN, VERTICAL_TO_DOMAIN, PARTICIPATION, ONDC_SCHEMES,
  toOndcItem, buildCatalog, enrollSeller, activate,
  MockOndcGateway, makeGateway,
};
