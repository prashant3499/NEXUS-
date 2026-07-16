/**
 * NEXUS — Unit Economics.
 *
 * The honest accounting of money in vs money out per unit (per seller,
 * per transaction, per marketing campaign). Built so the founder — and
 * only the founder — can see whether each part of the business is
 * profitable.
 *
 * Four parts:
 *
 *   1) COST LEDGER       — every cost the platform incurs, attributed
 *                          by category, with timestamp and ref.
 *   2) TIER PROFITABILITY — for each subscription tier, ARPU – ACPU = margin.
 *   3) CAMPAIGN PLANNER  — proposed marketing spend evaluated against
 *                          expected acquisition and LTV, with a green/
 *                          yellow/red decision and a HITL gate.
 *   4) HITL approval     — campaign spend over a configurable threshold
 *                          requires founder sign-off through the same
 *                          control.js pattern that already gates money.
 *
 * IMPORTANT: This module is PURE LOGIC. Real numbers come from the
 * cost ledger as the platform runs. Tests use seed data; production
 * fills the ledger from real provider calls (Bhashini, payment
 * gateway, infrastructure billing).
 *
 * VISIBILITY: This module is consumed only when the requesting role is
 * 'founder'. The render path enforces this at the UI layer; the module
 * itself exposes the data freely (caller responsibility — same as
 * founderInsights.js).
 */

'use strict';

// ────────────────────────────────────────────────────────────
// COST CATEGORIES — what we attribute spend to
// ────────────────────────────────────────────────────────────

const CATEGORIES = {
  INFRA:       'infra',         // server, storage, bandwidth — daily fixed
  INFERENCE:   'inference',     // Bhashini ₹0 / Global per-char / LLM per-token
  GATEWAY:     'gateway',       // Razorpay fee per transaction
  ACQUISITION: 'acquisition',   // ad spend per channel
  SUPPORT:     'support',       // human-in-the-loop time × rate
  COMPLIANCE:  'compliance',    // CA, lawyer, audit retainers
  PEOPLE:      'people',        // contractor / employee monthly cost
};

const CHANNELS = ['whatsapp', 'facebook', 'google', 'instagram', 'influencer', 'event', 'pr', 'organic'];

// Default thresholds; the founder console can override via config.
const DEFAULTS = {
  campaignHITLPaise: 5000000,   // ₹50,000 — anything bigger needs founder approval
  greenRatio: 0.5,              // CAC ≤ 0.5 × annual margin → green
  yellowRatio: 1.0,             // CAC ≤ 1.0 × annual margin → yellow; above → red
  paybackTargetMonths: 6,       // payback in 6 months is healthy
};

// ────────────────────────────────────────────────────────────
// COST LEDGER — append-only log of platform spend
// ────────────────────────────────────────────────────────────

/**
 * Create a new cost ledger. The ledger holds entries in memory; in
 * production the store layer persists them. Each entry is immutable.
 */
function createLedger() {
  const entries = [];

  function logCost({ category, amountPaise, ref = null, at = Date.now(), meta = {} } = {}) {
    if (!Object.values(CATEGORIES).includes(category)) {
      throw new Error(`Unknown cost category: ${category}`);
    }
    if (typeof amountPaise !== 'number' || !Number.isInteger(amountPaise) || amountPaise < 0) {
      throw new Error('amountPaise must be a non-negative integer');
    }
    const entry = Object.freeze({
      id: 'cost_' + at.toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      category, amountPaise, ref, at, meta: Object.freeze({ ...meta }),
    });
    entries.push(entry);
    return entry;
  }

  function getEntries(filter = {}) {
    let out = entries;
    if (filter.category) out = out.filter(e => e.category === filter.category);
    if (filter.from)     out = out.filter(e => e.at >= filter.from);
    if (filter.to)       out = out.filter(e => e.at <= filter.to);
    if (filter.ref)      out = out.filter(e => e.ref === filter.ref);
    return out;
  }

  function totalPaise(filter = {}) {
    return getEntries(filter).reduce((s, e) => s + e.amountPaise, 0);
  }

  function byCategory(filter = {}) {
    const out = {};
    for (const k of Object.values(CATEGORIES)) out[k] = 0;
    for (const e of getEntries(filter)) out[e.category] += e.amountPaise;
    return out;
  }

  /** Costs attributed to a specific customer via `ref` field. */
  function costPerCustomer(customerId, filter = {}) {
    return totalPaise({ ...filter, ref: customerId });
  }

  return { logCost, getEntries, totalPaise, byCategory, costPerCustomer };
}

// ────────────────────────────────────────────────────────────
// TIER PROFITABILITY — ARPU - ACPU = margin per seller per month
// ────────────────────────────────────────────────────────────

/**
 * TIER_ECONOMICS: per-month revenue / cost assumptions for each tier.
 * The numbers are honest baselines that match the Subscription Promotion
 * tier definitions. They are inputs to the math, not outputs.
 *
 * subPricePaise   = the monthly subscription price the seller pays
 * commissionPct   = % of GMV the platform retains (only on tiers
 *                   where the platform earns commission on top of subs)
 * assumedGmvPaise = the typical 30-day GMV used for the *baseline*
 *                   profitability calc; per-seller GMV varies and is
 *                   passed in for real evaluations
 * variableCostPct = cost as a % of revenue handled (gateway + inference
 *                   + per-txn support attributed to that revenue)
 * fixedAllocPaise = the seller's share of fixed monthly platform cost
 */
const TIER_ECONOMICS = {
  karigar: {
    name: 'Karigar', subPricePaise:  49900, commissionPct: 0.03,
    assumedGmvPaise:  3000000,  variableCostPct: 0.018, fixedAllocPaise:  8000,
  },
  vyapari: {
    name: 'Vyapari', subPricePaise: 249900, commissionPct: 0.03,
    assumedGmvPaise: 15000000,  variableCostPct: 0.014, fixedAllocPaise: 18000,
  },
  pravasi: {
    name: 'Pravasi', subPricePaise: 199900, commissionPct: 0.035,
    assumedGmvPaise: 12000000,  variableCostPct: 0.016, fixedAllocPaise: 16000,
  },
  niryatak: {
    name: 'Niryatak', subPricePaise: 799900, commissionPct: 0.025,
    assumedGmvPaise: 60000000,  variableCostPct: 0.012, fixedAllocPaise: 35000,
  },
  sansthan: {
    name: 'Sansthan', subPricePaise: null,   commissionPct: 0.02,
    assumedGmvPaise:200000000,  variableCostPct: 0.010, fixedAllocPaise:100000,
  },
};

/**
 * Compute profitability for one seller on a given tier.
 * Returns an integer-paise breakdown + the margin% rounded.
 */
function tierProfit(tierKey, opts = {}) {
  const t = TIER_ECONOMICS[tierKey];
  if (!t) throw new Error(`Unknown tier: ${tierKey}`);
  const gmv = (opts.gmvPaise !== undefined) ? opts.gmvPaise : t.assumedGmvPaise;
  const subRevenuePaise   = t.subPricePaise || 0;
  const commissionPaise   = Math.round(gmv * t.commissionPct);
  const revenuePaise      = subRevenuePaise + commissionPaise;
  const variableCostPaise = Math.round(gmv * t.variableCostPct);
  const fixedCostPaise    = t.fixedAllocPaise;
  const costPaise         = variableCostPaise + fixedCostPaise;
  const marginPaise       = revenuePaise - costPaise;
  const marginPct         = revenuePaise ? Math.round((marginPaise / revenuePaise) * 1000) / 10 : 0;
  return {
    tier: tierKey, name: t.name, gmvPaise: gmv,
    revenuePaise, subRevenuePaise, commissionPaise,
    costPaise, variableCostPaise, fixedCostPaise,
    marginPaise, marginPct,
    healthy: marginPaise > 0 && marginPct >= 30,
  };
}

/** Profitability summary across all tiers at their assumed GMV baselines. */
function profitabilityReport() {
  return Object.keys(TIER_ECONOMICS).map(k => tierProfit(k));
}

/**
 * Build the subscription price for a tier from its real cost base, plus
 * a target margin. Tells the founder: "given what this seller costs us,
 * here is what we *should* charge to hit X% margin." Useful for pricing
 * decisions, not for changing prices on the fly.
 */
function priceFromCosts(tierKey, targetMarginPct = 40) {
  const t = TIER_ECONOMICS[tierKey];
  if (!t) throw new Error(`Unknown tier: ${tierKey}`);
  const gmv = t.assumedGmvPaise;
  const commissionPaise   = Math.round(gmv * t.commissionPct);
  const variableCostPaise = Math.round(gmv * t.variableCostPct);
  const fixedCostPaise    = t.fixedAllocPaise;
  const totalCostPaise    = variableCostPaise + fixedCostPaise;
  // Solve: (sub + commission - cost) / (sub + commission) = targetMarginPct/100
  // sub = (cost - commission * (1 - m)) / (1 - m)  where m = targetMarginPct/100
  // Equivalently: sub + commission = cost / (1 - m), so sub = cost/(1-m) - commission
  const m = targetMarginPct / 100;
  if (m >= 1) throw new Error('targetMarginPct must be < 100');
  const targetRevenuePaise = Math.ceil(totalCostPaise / (1 - m));
  const recommendedSubPaise = Math.max(0, targetRevenuePaise - commissionPaise);
  const actualSubPaise = t.subPricePaise || 0;
  return {
    tier: tierKey, name: t.name, targetMarginPct,
    totalCostPaise, commissionPaise, targetRevenuePaise,
    recommendedSubPaise, actualSubPaise,
    deltaPaise: recommendedSubPaise - actualSubPaise,
    verdict: actualSubPaise === 0 ? 'custom' :
             recommendedSubPaise <= actualSubPaise ? 'priced-correctly' :
             (recommendedSubPaise - actualSubPaise) / actualSubPaise > 0.2 ? 'underpriced-significant' :
             'underpriced-mild',
  };
}

// ────────────────────────────────────────────────────────────
// CAMPAIGN PLANNER — proposed marketing spend evaluated against LTV
// ────────────────────────────────────────────────────────────

/**
 * Evaluate a proposed campaign and return a structured decision.
 *
 * @param {object} campaign
 *   {
 *     channel:            'whatsapp' | 'facebook' | 'google' | …
 *     budgetPaise:        total proposed budget
 *     expectedReach:      number of people the budget will reach
 *     expectedConversionRate:  fraction (0..1) — share who become sellers
 *     expectedTierMix:    { karigar: 0.6, vyapari: 0.3, ... } — sums to 1
 *     expectedRetentionMonths:  expected average lifetime in months
 *   }
 * @param {object} opts    overrides for thresholds
 */
function evaluateCampaign(campaign = {}, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const reasons = [];

  // Validate
  if (!CHANNELS.includes(campaign.channel)) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: `Unknown channel: ${campaign.channel}` }] };
  }
  if (!campaign.budgetPaise || campaign.budgetPaise <= 0) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: 'Budget must be positive' }] };
  }
  if (!campaign.expectedReach || campaign.expectedReach <= 0) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: 'Expected reach must be positive' }] };
  }
  const cr = campaign.expectedConversionRate || 0;
  if (cr <= 0 || cr > 1) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: 'Conversion rate must be in (0, 1]' }] };
  }
  const mix = campaign.expectedTierMix || { karigar: 1 };
  const mixSum = Object.values(mix).reduce((s, v) => s + v, 0);
  if (Math.abs(mixSum - 1) > 0.01) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: `Tier mix must sum to 1.0 (got ${mixSum.toFixed(2)})` }] };
  }
  for (const k of Object.keys(mix)) {
    if (!TIER_ECONOMICS[k]) return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: `Unknown tier in mix: ${k}` }] };
  }
  const retention = campaign.expectedRetentionMonths || 12;

  // CAC: budget / expected new sellers
  const expectedNewSellers = Math.floor(campaign.expectedReach * cr);
  if (expectedNewSellers === 0) {
    return { ok: false, decision: 'invalid', reasons: [{ ok: false, text: 'Expected new sellers is zero — increase reach or conversion' }] };
  }
  const cacPaise = Math.round(campaign.budgetPaise / expectedNewSellers);

  // LTV: per acquired seller, weighted across tier mix, over retention months
  let monthlyMarginPaise = 0;
  for (const [tier, share] of Object.entries(mix)) {
    const p = tierProfit(tier);
    monthlyMarginPaise += p.marginPaise * share;
  }
  monthlyMarginPaise = Math.round(monthlyMarginPaise);
  const annualMarginPaise = monthlyMarginPaise * 12;
  const ltvPaise = monthlyMarginPaise * retention;

  // Payback period in months
  const paybackMonths = monthlyMarginPaise > 0 ? Math.ceil(cacPaise / monthlyMarginPaise) : Infinity;

  // Decision
  let decision = 'red';
  const ratio = annualMarginPaise > 0 ? cacPaise / annualMarginPaise : Infinity;
  if (ratio <= cfg.greenRatio)       decision = 'green';
  else if (ratio <= cfg.yellowRatio) decision = 'yellow';

  if (decision === 'green')  reasons.push({ ok: true,  text: `CAC ₹${(cacPaise/100).toLocaleString('en-IN')} is ${(ratio*100).toFixed(0)}% of annual margin — strong` });
  if (decision === 'yellow') reasons.push({ ok: true,  text: `CAC ₹${(cacPaise/100).toLocaleString('en-IN')} is ${(ratio*100).toFixed(0)}% of annual margin — marginal; consider tightening targeting` });
  if (decision === 'red')    reasons.push({ ok: false, text: `CAC ₹${(cacPaise/100).toLocaleString('en-IN')} exceeds annual margin per seller — would lose money` });

  // Payback signal
  if (paybackMonths !== Infinity) {
    if (paybackMonths <= cfg.paybackTargetMonths) reasons.push({ ok: true, text: `Payback in ${paybackMonths} months meets target` });
    else reasons.push({ ok: false, text: `Payback in ${paybackMonths} months exceeds the ${cfg.paybackTargetMonths}-month target` });
  }

  // HITL: does this campaign need founder approval?
  const requiresApproval = campaign.budgetPaise >= cfg.campaignHITLPaise;
  if (requiresApproval) reasons.push({ ok: true, text: `Budget ≥ ₹${(cfg.campaignHITLPaise/100).toLocaleString('en-IN')} — founder approval required (HITL gate)` });

  return {
    ok: true, decision,
    channel: campaign.channel,
    budgetPaise: campaign.budgetPaise,
    expectedNewSellers,
    cacPaise,
    monthlyMarginPaise, annualMarginPaise, ltvPaise,
    paybackMonths,
    ratio,
    requiresApproval,
    reasons,
  };
}

/** Filter a list of proposed campaigns to those worth running this month. */
function rankCampaigns(campaigns = [], opts = {}) {
  const evaluated = campaigns.map(c => ({ campaign: c, result: evaluateCampaign(c, opts) }))
    .filter(e => e.result.ok && (e.result.decision === 'green' || e.result.decision === 'yellow'));
  // Rank by ROI ratio (lower is better, since ratio = CAC / annualMargin)
  evaluated.sort((a, b) => a.result.ratio - b.result.ratio);
  return evaluated;
}

module.exports = {
  CATEGORIES, CHANNELS, DEFAULTS, TIER_ECONOMICS,
  createLedger,
  tierProfit, profitabilityReport, priceFromCosts,
  evaluateCampaign, rankCampaigns,
};
