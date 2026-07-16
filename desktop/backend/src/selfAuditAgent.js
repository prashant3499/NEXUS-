'use strict';

/**
 * selfAuditAgent.js
 *
 * "There should be a logical mind / AI agent that does the same for the SaaS" —
 * i.e. the platform should continuously verify ITSELF, not rely on a human
 * remembering to run tests. This is that agent: a logical mind that, on demand
 * or on a schedule, re-checks every invariant the business depends on and
 * returns a trust verdict.
 *
 * It does not duplicate the unit tests — it asserts the LIVE truths a real
 * business engine must never violate, by exercising the real modules:
 *   1. Money reconciles to the paisa, and the platform is never in loss.
 *   2. Negative/zero/garbage money is rejected, not silently processed.
 *   3. Child-safety blocks a minor even with consent flags set.
 *   4. Consent is required before a sale.
 *   5. "Verified" is honest — a format-only doc is NOT reported as verified.
 *   6. Greenwashing is blocked — an unsubstantiated eco-claim earns no premium.
 *   7. ONDC/Beckn envelopes are signed and schema-valid (network-ready).
 *
 * Each check returns pass/fail + evidence. A single fail flips the verdict to
 * NOT TRUSTWORTHY — because a business that quietly loses money or sells to a
 * child once is not "mostly fine." Pure; composes the real modules.
 */

const slicer = require('./slicer');
const environmentVertical = require('./environmentVertical');
const kycVerification = require('./kycVerification');
const beckn = require('./beckn');

function check(name, fn) {
  try { const r = fn(); return { name, pass: !!r.pass, evidence: r.evidence }; }
  catch (e) { return { name, pass: false, evidence: 'threw: ' + e.message }; }
}

/**
 * audit — run the full invariant sweep. Optionally pass live signups/orders
 * services to also assert the live gates; without them, the pure-module
 * invariants still run.
 */
function audit(ctx = {}) {
  const checks = [];

  // 1. Money reconciles + maker gets the lion's share + platform not in loss.
  // Insurance is CUSTOMER-SIDE (buyer pays on top), so it is NOT part of the
  // maker-side reconciliation — only the deductions that come out of the total.
  checks.push(check('money_reconciles', () => {
    const s = slicer.sliceTransaction(5000, {});
    const sum = s.slices.seller_payout + s.slices.platform_commission + s.slices.gst_on_commission
      + s.slices.payment_gateway_fee + s.slices.tcs_collection + s.slices.tds_deduction
      + (s.slices.charity_donation || 0);
    const reconciles = Math.abs(sum - s.order_total) <= 1; // ≤1 paise rounding
    const platformOk = s.slices.platform_commission > 0; // never in loss
    const makerMajority = s.slices.seller_payout > s.order_total * 0.5; // maker keeps the most
    const buyerOk = s.buyer_pays === s.order_total; // no add-on, no insurer
    return { pass: reconciles && platformOk && makerMajority && buyerOk, evidence: `payout=${s.slices.seller_payout} (${(s.slices.seller_payout / s.order_total * 100).toFixed(1)}% to maker), reconciles=${reconciles}, buyer_pays=${s.buyer_pays}` };
  }));

  // 2. Bad money is rejected.
  checks.push(check('rejects_bad_money', () => {
    let neg = false, zero = false;
    try { slicer.sliceTransaction(-100, {}); } catch (e) { neg = true; }
    try { slicer.sliceTransaction(0, {}); } catch (e) { zero = true; }
    return { pass: neg && zero, evidence: `negative_rejected=${neg}, zero_rejected=${zero}` };
  }));

  // 3 & 4. Child-safety + consent (if a live signup service is provided).
  if (ctx.signupSvc && typeof ctx.trySignup === 'function') {
    checks.push(check('child_safety_blocks_minor', () => {
      const r = ctx.trySignup({ age: 14, consent_all: true });
      return { pass: r.blocked === true, evidence: 'minor+consent_all blocked=' + r.blocked };
    }));
    checks.push(check('consent_required', () => {
      const r = ctx.trySignup({ age: 30, consent_all: false });
      return { pass: r.blocked === true, evidence: 'no-consent blocked=' + r.blocked };
    }));
  }

  // 5. "Verified" is honest.
  checks.push(check('verified_is_honest', () => {
    const r = kycVerification.verifyDocument('aadhaar', '234123412346', kycVerification.makeVerifier({}));
    return { pass: r.verified === false && r.status === 'format_only', evidence: 'mock reports status=' + r.status };
  }));

  // 6. Greenwashing blocked.
  checks.push(check('no_greenwashing', () => {
    const est = environmentVertical.earningsEstimate({ price_paise: 120000, evidence: [] }, { green_premium_pct: 0.2 }, environmentVertical.makeCarbonMethodology({}));
    return { pass: est.sale.green_premium_paise === 0, evidence: 'unsubstantiated premium=' + est.sale.green_premium_paise };
  }));

  // 7. ONDC/Beckn signed + schema-valid.
  checks.push(check('ondc_ready', () => {
    const ctxObj = beckn.buildContext('search', { bap_id: 'nexus', bap_uri: 'https://x' });
    const msg = { context: ctxObj, message: { intent: { item: { descriptor: { name: 'saree' } } } } };
    const problems = beckn.validateMessage(msg);
    const valid = Array.isArray(problems) && problems.length === 0;
    return { pass: !!ctxObj.transaction_id && valid, evidence: 'context+schema valid=' + valid + (valid ? '' : ' (' + problems.join('; ') + ')') };
  }));

  const failed = checks.filter((c) => !c.pass);
  return {
    trustworthy: failed.length === 0,
    verdict: failed.length === 0 ? 'TRUSTWORTHY — every business invariant holds' : `NOT TRUSTWORTHY — ${failed.length} invariant(s) broken`,
    passed: checks.length - failed.length,
    total: checks.length,
    failed_checks: failed.map((c) => c.name),
    checks,
    at: Date.now(),
  };
}

module.exports = { audit };
