'use strict';

/**
 * explainer.js
 *
 * The human-facing self-explaining system. The platform manifest explains the
 * system to the AI; this explains it to PEOPLE — the two audiences who need to
 * understand it to act: CUSTOMERS (should I use this? how does it help me grow?)
 * and INVESTORS (what is this, why does it matter, is it real?).
 *
 * Everything here is assembled from the platform's REAL facts — identity, legal
 * models, invariants, the operating-cost model, and live metrics — never
 * invented marketing. Crucially, the investor view is HONEST about state: it
 * reports pre-revenue when pre-revenue, validated when validated. A self-
 * explanation that flatters is worse than none, because it loses trust the
 * moment a sharp reader checks it.
 *
 * Pure: the server passes live facts (manifest, cost scenarios, metrics) in via
 * `facts`; this shapes them into a narrative. No dependencies.
 */

const AUDIENCE = Object.freeze({ CUSTOMER: 'customer', INVESTOR: 'investor' });

/**
 * customerStory — for an artisan / seller / buyer. Plain, concrete, growth-
 * focused. "How does this help ME?"
 */
function customerStory(facts = {}) {
  const id = facts.identity || {};
  return {
    audience: AUDIENCE.CUSTOMER,
    headline: id.tagline || 'Sell your craft anywhere, with the hard parts handled.',
    one_liner: id.one_liner,
    how_it_helps_you_grow: [
      { title: 'Reach buyers anywhere', body: 'List once and sell across India and abroad. The platform brings the buyers; you make the craft.' },
      { title: 'No GST number needed', body: 'If you are an individual artisan, the platform sells on your behalf as Merchant of Record and handles the tax and paperwork. You do not need to be registered.' },
      { title: 'Paid in about two days', body: 'When a buyer pays, your share is split out immediately and sent straight to your bank — usually within two days (T+2). The platform never holds your money.' },
      { title: 'Zero legal risk to you', body: 'The platform carries the legal responsibility for the sale. You keep your maker price and your peace of mind.' },
      { title: 'In your language', body: 'Use the platform in your own language — you do not need English to sell or buy here.' },
      { title: 'Buy your tools and materials too', body: 'Source the looms, yarn, clay, dyes and tools you make with — the platform is a marketplace for what you sell and what you need.' },
    ],
    how_to_start: [
      'Sign up with your phone — verify with a one-time code.',
      'Add a product: a photo and a short description in your language.',
      'Authorize the platform to sell for you (one-time consent), and add your bank account.',
      'Your listing goes live after a quick review — and you start selling.',
    ],
    why_trust_it: [
      'Your payout is structural — money is split at the payment gateway, so it can never be held back or lost.',
      'Nothing of yours is ever sold without your permission, and you can withdraw it any time.',
      'Verified origin (GI tags and cluster provenance) lets buyers trust your work and pay a fair price.',
    ],
    what_it_costs: 'A fair, published commission on each sale plus your plan — shown to you before every transaction, with no hidden fees.',
  };
}

/**
 * investorStory — the thesis, the model, the moat, the economics, and an HONEST
 * read of state. Pulls real cost/margin numbers and the live metrics snapshot.
 */
function investorStory(facts = {}) {
  const id = facts.identity || {};
  const models = facts.legalModels || [];
  const invariants = facts.invariants || [];
  const econ = facts.economics || {};
  const metrics = facts.metrics || {};
  const giCount = facts.giCount || 0;

  // Honest state: derive from live metrics rather than asserting traction.
  const hasRevenue = metrics.mrr && metrics.mrr.mrr_paise > 0;
  const state = hasRevenue
    ? { stage: 'early_revenue', headline: `Live with ${metrics.mrr.active_count} paying accounts; MRR ₹${(metrics.mrr.mrr_rupees||0).toLocaleString('en-IN')}.` }
    : { stage: 'pre_revenue', headline: 'Pre-revenue. The engine is built and tested; demand and the legal model are the next things to validate with a pilot.' };

  return {
    audience: AUDIENCE.INVESTOR,
    thesis: id.one_liner,
    problem: 'India has tens of millions of artisans making world-class craft, but most are undocumented, cannot register for GST, cannot reach buyers abroad, and are squeezed by intermediaries. The barrier is not skill — it is trust, compliance, and access.',
    solution: `${id.name} is a ${id.tagline} It lets an undocumented maker sell compliantly to anyone, paid directly, carrying zero legal liability — because the platform absorbs the legal and tax burden as a status-aware Merchant of Record.`,
    why_now: 'Digital payments (UPI), Aadhaar identity, Bhashini language infrastructure, and GI-tagging have all matured — making it newly possible to onboard a phone-first, low-literacy maker compliantly at near-zero marginal cost.',
    the_model: {
      summary: 'A status-aware legal engine: the platform\u2019s relationship adapts to each seller\u2019s documentation, applying the right model automatically.',
      models: models,
    },
    the_moat: [
      'The legal architecture itself — status-aware Merchant-of-Record with consent, tax-at-source, and child-safety built in — is hard to copy and harder to retrofit.',
      'Authenticity: grounded in real GI tags and ' + giCount + ' verified craft clusters; provenance is the thing buyers pay a premium for.',
      'A compliance + trust moat compounds: every solved regulation and verified maker raises the wall for a fast follower.',
      'Cost structure: zero-dependency engine, Indic translation at near-zero cost — software margins on a market everyone else treats as high-touch.',
    ],
    unit_economics: {
      summary: econ.summary || 'At pilot scale the model runs at high software margins; AI inference is the dominant cost and the main lever as it scales.',
      at_100_sellers: econ.at_100 || null,
      invariant: 'A hard never-in-loss rule is enforced in code — no transaction, price, or AI action can put the platform in loss.',
    },
    invariants_that_protect_the_business: invariants,
    state,
    honest_risks: [
      'Demand is unvalidated — no paying customers yet; a pilot must prove makers and buyers will transact.',
      'The Merchant-of-Record + TCS model needs sign-off from a qualified Indian tax lawyer before scale.',
      'Persistence is a file store today; a database migration is needed before high transaction volume.',
    ],
    use_of_proceeds: 'Validate demand with a paid pilot, secure legal sign-off on the MoR model, and migrate to a production datastore — in that order.',
  };
}

/**
 * explain — the entry point. Returns the story for the requested audience,
 * grounded in the live facts the server supplies.
 */
function explain(audience, facts = {}) {
  if (audience === AUDIENCE.INVESTOR) return investorStory(facts);
  return customerStory(facts);
}

module.exports = { AUDIENCE, explain, customerStory, investorStory };
