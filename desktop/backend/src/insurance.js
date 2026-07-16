'use strict';

/**
 * insurance.js
 *
 * How insurance works ON the platform — and, just as important, how it does NOT.
 *
 * NEXUS is NOT an insurer and never carries risk. In India you cannot bear
 * insurance risk without an IRDAI licence, and you cannot even sell a policy
 * without being a registered intermediary (corporate agent / broker / web-
 * aggregator). So the platform's role is deliberately narrow and compliant:
 *
 *   • It FACILITATES cover from a LICENSED partner insurer.
 *   • It NEVER fronts or holds the premium as its own money — the premium is
 *     passed through to the insurer; the platform earns only a disclosed
 *     referral/facilitation fee, within IRDAI norms.
 *   • For tourism, cover is OPERATOR-BOUND: the host/operator carries the
 *     policy via the licensed partner; the platform books only.
 *
 * This keeps the never-in-loss invariant intact (premium is pass-through, not
 * platform cost) and keeps the platform on the right side of insurance law.
 *
 * Coverage types, by what they protect:
 *   • transit          — goods lost/damaged in shipping (products)
 *   • experience       — traveler + operator liability (tourism)
 *   • high_value_goods — gems/jewellery in transit + handling
 *
 * Like payments and ONDC, the insurer is a PROVIDER SEAM: a mock insurer runs
 * today so quotes + binding are exercised end-to-end; a real partner API drops
 * in behind the same interface on credentials. Nothing fakes a bound policy.
 *
 * Pure + dependency-free.
 */

const COVERAGE = Object.freeze({
  TRANSIT: 'transit',
  EXPERIENCE: 'experience',
  HIGH_VALUE_GOODS: 'high_value_goods',
});

// Which coverage applies to which vertical.
const VERTICAL_COVERAGE = Object.freeze({
  handicraft: COVERAGE.TRANSIT, naturals: COVERAGE.TRANSIT, gi: COVERAGE.TRANSIT,
  gems: COVERAGE.HIGH_VALUE_GOODS, jewellery: COVERAGE.HIGH_VALUE_GOODS,
  tourism: COVERAGE.EXPERIENCE,
});

// Premium rates (illustrative, partner-set in reality). Premium is a % of the
// insured value, with a floor. The platform's facilitation fee is a small,
// disclosed cut of the premium — NOT additional cost to the customer.
const PREMIUM = Object.freeze({
  transit: { pct: 0.005, floor_paise: 5000 },              // 0.5%, min ₹50
  high_value_goods: { pct: 0.012, floor_paise: 25000 },    // 1.2%, min ₹250 (escorted/insured handling)
  experience: { pct: 0.02, floor_paise: 10000 },           // 2%, min ₹100 (liability + traveler)
});
const FACILITATION_FEE_PCT = 0.10;                         // platform keeps 10% of premium as a referral fee
const MANDATORY_FOR = Object.freeze(['high_value_goods']); // + tourism high-risk (decided by the gate)

/**
 * quote — produce an insurance quote for a transaction/booking. Does NOT bind;
 * returns the premium, the insurer's share, and the platform's disclosed fee.
 * @param {object} subject { vertical, value_paise, risk?, mandatory? }
 * @returns { coverage, premium_paise, insurer_premium_paise, platform_fee_paise, mandatory, insurer_required }
 */
function quote(subject = {}) {
  const coverage = VERTICAL_COVERAGE[subject.vertical] || COVERAGE.TRANSIT;
  const rate = PREMIUM[coverage];
  const value = Math.max(0, subject.value_paise || 0);
  const premium_paise = Math.max(rate.floor_paise, Math.round(value * rate.pct));
  // The platform's fee is carved OUT of the premium (pass-through model), so
  // the customer pays one premium and the platform never fronts money.
  const platform_fee_paise = Math.round(premium_paise * FACILITATION_FEE_PCT);
  const insurer_premium_paise = premium_paise - platform_fee_paise;
  const mandatory = MANDATORY_FOR.includes(coverage) || subject.mandatory === true || subject.risk === 'high';
  return {
    coverage,
    premium_paise,
    insurer_premium_paise,     // remitted to the licensed insurer
    platform_fee_paise,        // disclosed referral fee — the only money the platform keeps
    mandatory,
    insurer_required: true,    // a licensed partner insurer must bind this; platform cannot
    note: 'Premium is pass-through to a licensed insurer; the platform fronts nothing and bears no risk.',
  };
}

/**
 * bindPolicy — bind cover via the licensed partner insurer. The platform calls
 * the partner; it does NOT issue the policy itself.
 * @returns { ok, policy } | { ok:false, reason }
 */
function bindPolicy(quoteResult, insurer, ctx = {}) {
  if (!insurer || typeof insurer.bind !== 'function') {
    return { ok: false, reason: 'No licensed insurer connected. Cover cannot be bound — the platform cannot issue insurance itself.' };
  }
  try {
    const policy = insurer.bind({
      coverage: quoteResult.coverage,
      insurer_premium_paise: quoteResult.insurer_premium_paise,
      subject_ref: ctx.subject_ref,
    });
    return { ok: true, policy: { ...policy, platform_fee_paise: quoteResult.platform_fee_paise } };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── Provider seam: a mock licensed insurer so the flow runs without a partner ──
function MockInsurer() {
  let n = 0;
  return {
    kind: 'mock',
    licensed: false,                 // honest: a mock is NOT a licensed insurer
    bind(req) {
      n += 1;
      return {
        policy_id: 'MOCK-POL-' + Date.now() + '-' + n,
        coverage: req.coverage,
        premium_paise: req.insurer_premium_paise,
        status: 'bound_mock',
        note: 'Mock policy — not real cover. A licensed partner insurer issues real policies in production.',
      };
    },
  };
}
function makeInsurer(config = {}) {
  // A real partner (e.g. an IRDAI-licensed insurer's API) would be constructed
  // from credentials here. Absent those, return the mock.
  if (config.insurerApiKey && config.insurerId) {
    return { kind: 'partner', licensed: true, bind() { throw new Error('live insurer client not yet implemented'); } };
  }
  return MockInsurer();
}

module.exports = {
  COVERAGE, VERTICAL_COVERAGE, PREMIUM, FACILITATION_FEE_PCT, MANDATORY_FOR,
  quote, bindPolicy, MockInsurer, makeInsurer,
};
