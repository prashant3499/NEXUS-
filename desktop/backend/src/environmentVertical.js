'use strict';

/**
 * environmentVertical.js
 *
 * How business is actually done in the environment/climate vertical — which is
 * genuinely different from the other six. A handicraft sells once to a buyer.
 * An environment listing can earn THREE ways from the same product:
 *
 *   1. PRODUCT SALE        — the eco-good sells like any product (with a green
 *                            premium buyers will pay for verified sustainability).
 *   2. CSR / ESG FUNDING    — corporates with a Sec-135 CSR mandate (2% of profit)
 *                            or ESG targets fund verified-impact craft. This is a
 *                            B2B/institutional buyer the other verticals don't have.
 *   3. CARBON ATTRIBUTION   — a product with a substantiated carbon-avoided figure
 *                            can, via an ACCREDITED methodology partner, contribute
 *                            to carbon credits — a revenue TYPE that doesn't exist
 *                            in pure commerce.
 *
 * The hard rule: NO GREENWASHING. A green claim is only surfaced if it is
 * substantiated; a carbon figure only counts toward credits if an accredited
 * methodology verifies it. The platform refuses to monetise an unverified claim
 * — that protects the platform (no false-advertising liability) and the buyer.
 *
 * Pure + dependency-free. The accredited carbon methodology is a PROVIDER SEAM
 * (like payments/insurer): a mock estimator runs now; a real registry partner
 * (Verra, Gold Standard, or an Indian accredited body) drops in on credentials.
 */

// A green claim must cite evidence to be shown. Evidence types we accept.
const EVIDENCE = Object.freeze({
  ORGANIC_CERT: 'organic_cert', RECYCLED_DECLARATION: 'recycled_declaration',
  LCA_STUDY: 'lca_study', FOREST_PRODUCE_PERMIT: 'forest_produce_permit',
  THIRD_PARTY_AUDIT: 'third_party_audit',
});

// Revenue paths this vertical can earn from.
const REVENUE_PATH = Object.freeze({ SALE: 'product_sale', CSR: 'csr_esg_funding', CARBON: 'carbon_attribution' });

/**
 * verifyClaim — anti-greenwashing gate. A green claim is publishable only if it
 * cites at least one accepted evidence type. Returns what may be shown.
 */
function verifyClaim(listing = {}) {
  const evidence = Array.isArray(listing.evidence) ? listing.evidence : [];
  const valid = evidence.filter((e) => Object.values(EVIDENCE).includes(e.type) && e.ref);
  const substantiated = valid.length > 0;
  return {
    substantiated,
    publishable_claim: substantiated ? listing.impact_claim : null,
    shown_evidence: valid.map((e) => e.type),
    blocked_reason: substantiated ? null : 'Green claim not substantiated — provide evidence (cert, audit, or LCA) before it can be shown. No greenwashing.',
  };
}

/**
 * carbonAttribution — estimate carbon credit value for a listing's avoided
 * emissions, via the accredited methodology provider. Only counts if the claim
 * is substantiated AND the provider verifies. The platform never invents a
 * credit.
 * @param {object} listing { carbon_kg_avoided, evidence }
 * @param {object} methodology  provider seam (mock or accredited)
 */
function carbonAttribution(listing, methodology) {
  const claim = verifyClaim(listing);
  if (!claim.substantiated) {
    return { ok: false, creditable: false, reason: 'Carbon cannot be credited without a substantiated claim.' };
  }
  if (!methodology || typeof methodology.verify !== 'function') {
    return { ok: false, creditable: false, reason: 'No accredited carbon methodology connected — credits cannot be issued by the platform itself.' };
  }
  try {
    const v = methodology.verify({ kg: listing.carbon_kg_avoided || 0, evidence: claim.shown_evidence });
    return { ok: true, creditable: v.accredited === true, verified_kg: v.verified_kg, est_credit_value_paise: v.value_paise, methodology: v.kind };
  } catch (e) {
    return { ok: false, creditable: false, reason: e.message };
  }
}

/**
 * businessModel — the explainer for a listing: which of the three revenue paths
 * are open to it given what's verified. This is "how business is done here."
 */
function businessModel(listing = {}, methodology) {
  const claim = verifyClaim(listing);
  const carbon = carbonAttribution(listing, methodology);
  const paths = [];
  // 1) Always: the product can be sold (green premium if substantiated).
  paths.push({ path: REVENUE_PATH.SALE, open: true, note: claim.substantiated ? 'Sells with a verified-green premium.' : 'Sells, but without a green premium until the claim is substantiated.' });
  // 2) CSR/ESG funding needs a substantiated impact claim.
  paths.push({ path: REVENUE_PATH.CSR, open: claim.substantiated, note: claim.substantiated ? 'Eligible for CSR/ESG-funded purchase by corporates.' : 'Substantiate the impact claim to unlock CSR/ESG buyers.' });
  // 3) Carbon attribution needs accredited verification.
  paths.push({ path: REVENUE_PATH.CARBON, open: carbon.creditable === true, note: carbon.creditable ? `Carbon-creditable (~${carbon.verified_kg}kg verified).` : (carbon.reason || 'Carbon credits need an accredited methodology partner.') });
  return {
    substantiated: claim.substantiated,
    open_paths: paths.filter((p) => p.open).map((p) => p.path),
    paths,
    headline: `${paths.filter((p) => p.open).length} of 3 revenue paths open for this listing.`,
  };
}

/**
 * earningsEstimate — the plain-numbers answer to "how much do we earn?" For a
 * listing, compute the three revenue paths in rupees, for the SELLER and the
 * PLATFORM, given a sale price, a green premium, an optional CSR bulk order,
 * and verified carbon. Platform commission is the standard 3%.
 *
 * @param {object} listing  { price_paise, carbon_kg_avoided, evidence }
 * @param {object} opts     { csr_units, carbon_credit_paise_per_kg, green_premium_pct }
 * @param {object} methodology  carbon provider seam
 */
function earningsEstimate(listing = {}, opts = {}, methodology) {
  const COMMISSION = 0.03;
  const price = Math.max(0, listing.price_paise || 0);
  const claim = verifyClaim(listing);
  const premiumPct = claim.substantiated ? (opts.green_premium_pct != null ? opts.green_premium_pct : 0.2) : 0;
  const greenPrice = Math.round(price * (1 + premiumPct));

  // 1) PRODUCT SALE (per unit, with green premium if verified)
  // The green premium exists ONLY because the platform verifies the claim, so
  // the platform may take a share of THE PREMIUM (not the base price). Default
  // is 0 (maker keeps all); set platform_premium_share_pct to capture a share.
  const premiumShare = Math.max(0, Math.min(1, opts.platform_premium_share_pct || 0));
  const premiumPaise = greenPrice - price;
  const saleCommission = Math.round(greenPrice * COMMISSION);
  const platformPremiumCut = Math.round(premiumPaise * premiumShare);
  const sale = {
    unit_price_paise: greenPrice,
    green_premium_paise: premiumPaise,
    platform_commission_paise: saleCommission,
    platform_premium_share_paise: platformPremiumCut,
    platform_earns_paise: saleCommission + platformPremiumCut,
    seller_earns_paise: greenPrice - saleCommission - platformPremiumCut,
  };

  // 2) CSR / ESG BULK ORDER (a corporate buys N units from its CSR budget)
  const units = Math.max(0, opts.csr_units || 0);
  const csrGross = greenPrice * units;
  const csr = claim.substantiated && units > 0 ? {
    units, order_value_paise: csrGross,
    platform_earns_paise: Math.round(csrGross * COMMISSION),
    seller_earns_paise: csrGross - Math.round(csrGross * COMMISSION),
    note: 'Funded from the corporate buyer\u2019s Sec-135 CSR / ESG budget.',
  } : { units: 0, open: false, note: 'CSR path needs a substantiated claim + a corporate buyer.' };

  // 3) CARBON (only if accredited; value per unit is modest, scales with volume)
  const carbonRatePaise = opts.carbon_credit_paise_per_kg != null ? opts.carbon_credit_paise_per_kg : 150; // ~₹1.5/kg = ₹1500/tonne
  const carbonVerify = carbonAttribution(listing, methodology);
  const carbonUnits = units || 1;
  const carbon = carbonVerify.creditable ? {
    per_unit_paise: Math.round((listing.carbon_kg_avoided || 0) * carbonRatePaise),
    total_paise: Math.round((listing.carbon_kg_avoided || 0) * carbonRatePaise * carbonUnits),
    over_units: carbonUnits,
    note: 'Accredited carbon credit — a revenue type pure commerce does not have.',
  } : { creditable: false, note: carbonVerify.reason || 'Needs an accredited methodology partner.' };

  return {
    substantiated: claim.substantiated,
    green_premium_pct: premiumPct,
    sale, csr, carbon,
    summary: 'Per-unit sale + (optional) CSR bulk + (future) carbon. The green premium and CSR access are the near-term money; carbon is the long-term upside.',
  };
}

// ── Provider seam: accredited carbon methodology ──
function MockCarbonMethodology() {
  return {
    kind: 'mock', accreditedBody: false,
    verify({ kg }) {
      // Mock: "verifies" the figure but is NOT accredited, so not truly creditable.
      return { accredited: false, verified_kg: kg, value_paise: Math.round((kg || 0) * 150), kind: 'mock', note: 'Mock estimate — not an accredited credit. Connect an accredited body (Verra/Gold Standard) to issue real credits.' };
    },
  };
}
function makeCarbonMethodology(config = {}) {
  if (config.carbonApiKey && config.carbonRegistry) {
    return { kind: 'accredited', accreditedBody: true, verify() { throw new Error('live carbon registry client not yet implemented'); } };
  }
  return MockCarbonMethodology();
}

module.exports = {
  EVIDENCE, REVENUE_PATH,
  verifyClaim, carbonAttribution, businessModel, earningsEstimate,
  MockCarbonMethodology, makeCarbonMethodology,
};
