'use strict';

/**
 * dataSources.js
 *
 * A platform is only as real as the data feeding it. This is the honest map of
 * EVERY data input NEXUS needs to run, classified by where it comes from and
 * whether we actually have it. Four source types:
 *
 *   • USER        — the platform collects it from makers/buyers at runtime
 *                   (listings, KYC docs, addresses, reviews). We "have" the
 *                   mechanism; the data arrives when real users do.
 *   • REFERENCE   — public/government datasets we must obtain and keep current
 *                   (GI registry, HSN codes, schemes, pincodes). Mostly NOT yet
 *                   sourced — this is real work, not a mock.
 *   • PROVIDER    — third-party APIs behind credentials (payments, KYC verify,
 *                   translation, logistics, insurance, carbon, maps, AI). Built
 *                   as seams; MOCK until a real key + contract is in place.
 *   • DERIVED     — the platform computes it from the above (reputation, cost
 *                   models, the money split, insights). We have these.
 *
 * Status is deliberately honest: have / mock / collected_at_runtime /
 * not_yet_sourced. A pilot cannot run on "mock" for anything that moves money.
 *
 * Pure + dependency-free.
 */

const SOURCE = Object.freeze({ USER: 'user', REFERENCE: 'reference', PROVIDER: 'provider', DERIVED: 'derived' });
const STATUS = Object.freeze({ HAVE: 'have', MOCK: 'mock', RUNTIME: 'collected_at_runtime', NOT_SOURCED: 'not_yet_sourced' });

const INPUTS = Object.freeze([
  // ── USER-GENERATED ──
  { key: 'maker_profile', source: SOURCE.USER, status: STATUS.RUNTIME, desc: 'Maker name, trade, language, state', how: 'Collected at onboarding (voice-assisted).' },
  { key: 'kyc_documents', source: SOURCE.USER, status: STATUS.RUNTIME, desc: 'Aadhaar/PAN/GSTIN/bank', how: 'Collected at onboarding; FORMAT-checked now, registry-verified on a KYC provider.' },
  { key: 'product_listings', source: SOURCE.USER, status: STATUS.RUNTIME, desc: 'Title, description, price, stock', how: 'Created by makers; needs real product photography (a known operational gap).' },
  { key: 'product_photos', source: SOURCE.USER, status: STATUS.NOT_SOURCED, desc: 'Sellable images of products', how: 'Artisans usually cannot shoot these — needs a photography solution. REAL GAP.' },
  { key: 'buyer_orders', source: SOURCE.USER, status: STATUS.RUNTIME, desc: 'Buyer phone, shipping, items', how: 'Collected at checkout.' },
  { key: 'reviews', source: SOURCE.USER, status: STATUS.RUNTIME, desc: 'Verified-purchase ratings', how: 'Only from delivered orders.' },

  // ── REFERENCE / GOVERNMENT (mostly to be sourced) ──
  { key: 'gi_registry', source: SOURCE.REFERENCE, status: STATUS.HAVE, desc: 'GI-tagged products + authorised users', how: 'Seeded from the real GI Registry (CGPDTM); must be kept current.' },
  { key: 'hsn_codes', source: SOURCE.REFERENCE, status: STATUS.HAVE, desc: 'HSN codes for GST classification', how: 'Subset embedded; full set from CBIC.' },
  { key: 'government_schemes', source: SOURCE.REFERENCE, status: STATUS.HAVE, desc: 'TRIFED, KVIC, CSR, state schemes', how: 'Real schemes seeded; needs ongoing curation as schemes change.' },
  { key: 'pincode_geo', source: SOURCE.REFERENCE, status: STATUS.NOT_SOURCED, desc: 'Pincode → location, serviceability', how: 'Needs India Post / a geo dataset for accurate logistics. GAP.' },
  { key: 'compliance_rules', source: SOURCE.REFERENCE, status: STATUS.HAVE, desc: 'GST/TCS/RBI/DPDP requirement map', how: 'Tracked in the compliance registry; rules change — needs monitoring.' },

  // ── PROVIDER APIs (seams; mock until credentials) ──
  { key: 'payments_payouts', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Collect + split + payout', how: 'Razorpay Route seam. CRITICAL — no real money moves until connected.' },
  { key: 'kyc_verification', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'DigiLocker/UIDAI/GSTN/penny-drop', how: 'Verifier seam; "verified" is honest-format-only until connected.' },
  { key: 'translation', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Bhashini (Indian langs) + global', how: 'Routes to Bhashini on a key; mock now.' },
  { key: 'logistics', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Rates, labels, tracking', how: '3PL seam (Delhivery/Shiprocket/ONDC-logistics).' },
  { key: 'insurance', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Transit / experience cover', how: 'IRDAI-licensed insurer seam; platform is facilitator only.' },
  { key: 'carbon_methodology', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Accredited carbon verification', how: 'Verra/Gold Standard seam; not creditable until accredited.' },
  { key: 'maps_geocoding', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'Geocoding, service areas', how: 'Google/MapMyIndia seam.' },
  { key: 'ai_inference', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'The AI co-founder + agents', how: 'Anthropic seam; deterministic routing now, model on a key.' },
  { key: 'ondc_registry', source: SOURCE.PROVIDER, status: STATUS.MOCK, desc: 'ONDC network participant registry', how: 'Beckn layer built; needs real ONDC onboarding + keys.' },

  // ── PLATFORM-DERIVED (we compute these) ──
  { key: 'money_split', source: SOURCE.DERIVED, status: STATUS.HAVE, desc: 'Per-transaction slice', how: 'Computed by the slicer (verified).' },
  { key: 'reputation', source: SOURCE.DERIVED, status: STATUS.HAVE, desc: 'Maker reputation, portable to ONDC', how: 'Computed from verified reviews.' },
  { key: 'cost_to_serve', source: SOURCE.DERIVED, status: STATUS.HAVE, desc: 'Per-vertical cost model', how: 'Computed from operational assumptions.' },
  { key: 'insights', source: SOURCE.DERIVED, status: STATUS.HAVE, desc: 'Feedback insights, watchdog, advisor', how: 'Computed from platform signals.' },
]);

function bySource(s) { return INPUTS.filter((i) => i.source === s); }
function byStatus(st) { return INPUTS.filter((i) => i.status === st); }

/**
 * readiness — the honest data-readiness picture for going live.
 */
function readiness() {
  const mocks = byStatus(STATUS.MOCK);
  const gaps = byStatus(STATUS.NOT_SOURCED);
  // What MUST be real before a pilot that moves money:
  const pilot_blockers = INPUTS.filter((i) => ['payments_payouts', 'kyc_verification'].includes(i.key) && i.status !== STATUS.HAVE);
  return {
    total_inputs: INPUTS.length,
    by_source: { user: bySource(SOURCE.USER).length, reference: bySource(SOURCE.REFERENCE).length, provider: bySource(SOURCE.PROVIDER).length, derived: bySource(SOURCE.DERIVED).length },
    have: byStatus(STATUS.HAVE).length,
    mock: mocks.length,
    runtime: byStatus(STATUS.RUNTIME).length,
    not_sourced: gaps.length,
    pilot_blockers: pilot_blockers.map((i) => i.key),
    reference_to_source: gaps.map((i) => ({ key: i.key, how: i.how })),
    providers_to_connect: mocks.map((i) => i.key),
    summary: `${byStatus(STATUS.HAVE).length} ready, ${mocks.length} on mocks (connect a provider), ${gaps.length} reference datasets to source, ${bySource(SOURCE.USER).length} collected from users at runtime. Money + KYC must be real before any pilot.`,
  };
}

module.exports = { SOURCE, STATUS, INPUTS, bySource, byStatus, readiness };
