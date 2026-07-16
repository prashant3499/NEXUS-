'use strict';

/**
 * insuranceConnector.js
 *
 * HOW we connect to an insurer, and WHY.
 *
 * WHY:
 *  - The platform is NOT an insurer and cannot legally underwrite risk. So it
 *    partners with a licensed insurer (an IRDAI-regulated general insurer or an
 *    insurtech that fronts one) and acts only as a distribution + collection
 *    channel.
 *  - Insurance is the buyer's trust backstop: it covers loss/damage in transit
 *    and the authenticity guarantee. For a diaspora or boutique buyer paying a
 *    village maker they've never met, that cover is what makes the purchase
 *    feel safe — it converts hesitation into a sale.
 *  - It protects the MAKER too: if goods are lost in transit, the claim pays the
 *    buyer and the maker still keeps their settled payout. Risk leaves the
 *    maker's shoulders.
 *  - It is CUSTOMER-SIDE: the buyer pays the premium on top of the item price
 *    (see the slicer), the platform remits it to the insurer, and it never
 *    reduces the maker's payout.
 *
 * HOW (the integration shape):
 *   quote()  → ask the insurer what a given shipment/declared value costs to cover
 *   bind()   → on payment, bind a per-shipment policy and get a policy id
 *   claim()  → if lost/damaged/not-authentic, file a claim with evidence
 *
 * Honest seam: this defines the connection and runs on a deterministic MOCK
 * now; it becomes a real policy the moment a licensed insurer's credentials are
 * configured — exactly like payments and KYC. No real policy is bound without a
 * real insurer.
 *
 * Pure + dependency-free (provider injected).
 */

// What the platform needs from whoever underwrites — it is never the underwriter.
const REQUIREMENTS = Object.freeze([
  'A licensed insurer partner (IRDAI-regulated) or an insurtech fronting one.',
  'A distribution arrangement — the platform collects premium, the insurer carries risk.',
  'Per-shipment declared-value cover (parametric for transit; authenticity rider).',
  'A claims API + SLA the platform can call on the buyer\u2019s behalf.',
]);

// Default cover model (mirrors the slicer\u2019s customer-side premium).
const COVER = Object.freeze({
  flat_premium_paise: 5000,        // \u20b950 flat on small orders (matches slicer)
  pct_premium: 0.005,              // 0.5% above threshold
  pct_threshold_paise: 1000000,    // above \u20b910,000
  covers: ['loss in transit', 'damage in transit', 'failed-authenticity refund'],
});

function premiumPaise(declaredValuePaise) {
  const v = Math.max(0, Math.round(declaredValuePaise || 0));
  const p = v > COVER.pct_threshold_paise ? Math.round(v * COVER.pct_premium) : COVER.flat_premium_paise;
  return Math.min(p, Math.round(v * 0.05)); // never more than 5% of value
}

/** quote — what the insurer would charge to cover this shipment. */
function quote(input = {}) {
  const declared = Math.round((input.declaredValueRupees || 0) * 100);
  if (declared <= 0) return { ok: false, reason: 'Declared value must be positive.' };
  return {
    ok: true,
    declared_value_paise: declared,
    premium_paise: premiumPaise(declared),
    covers: COVER.covers,
    payer: 'buyer',
    note: 'Customer-side premium. Collected by the platform on top of the item price and remitted to the insurer.',
  };
}

/** bind — bind a per-shipment policy on payment (needs a real insurer to be live). */
function bind(input = {}, provider) {
  const q = quote(input);
  if (!q.ok) return q;
  if (!provider || !provider.bindPolicy) {
    return { ok: true, live: false, mode: 'mock', policy_id: 'MOCKPOL-' + (input.orderId || 'x') + '-' + Date.now().toString(36),
      premium_paise: q.premium_paise, covers: q.covers,
      note: 'Mock policy. A real, claimable policy is bound only once a licensed insurer\u2019s credentials are configured.' };
  }
  const pol = provider.bindPolicy({ orderId: input.orderId, declaredValuePaise: q.declared_value_paise, premiumPaise: q.premium_paise });
  return { ok: true, live: true, mode: 'live', policy_id: pol.policyId, premium_paise: q.premium_paise, covers: q.covers };
}

/** claim — file a claim on the buyer\u2019s behalf. */
function claim(input = {}, provider) {
  if (!input.policyId) return { ok: false, reason: 'policyId required.' };
  const reason = input.reason || 'damage';
  if (!['loss', 'damage', 'not_authentic'].includes(reason)) return { ok: false, reason: 'reason must be loss, damage, or not_authentic.' };
  if (!provider || !provider.fileClaim) {
    return { ok: true, live: false, mode: 'mock', claim_id: 'MOCKCLM-' + Date.now().toString(36), status: 'received',
      note: 'Mock claim. Real adjudication happens at the licensed insurer once connected.' };
  }
  const c = provider.fileClaim({ policyId: input.policyId, reason, evidence: input.evidence });
  return { ok: true, live: true, mode: 'live', claim_id: c.claimId, status: c.status };
}

function posture() {
  return {
    role: 'distribution + collection channel \u2014 NOT the underwriter',
    why: 'Buyer trust backstop (transit + authenticity), maker risk removed, customer-side premium.',
    how: ['quote', 'bind on payment', 'claim with evidence'],
    requirements: REQUIREMENTS,
    honest: 'Runs on a mock now; binds a real, claimable policy only when a licensed insurer\u2019s credentials are configured. The platform never carries the risk itself.',
  };
}

module.exports = { REQUIREMENTS, COVER, premiumPaise, quote, bind, claim, posture };
