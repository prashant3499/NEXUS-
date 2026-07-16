'use strict';

/**
 * profitGuard.js
 *
 * Enforces the founder's core constraint: "Platform should never be in loss."
 *
 * Every expensive operation goes through canAfford() which:
 *   1. Estimates the operation's cost (inference tokens, infra, ops time)
 *   2. Looks up the seller's revenue contribution this month
 *   3. Compares cumulative cost vs revenue
 *   4. Returns one of: APPROVE / WARN / DENY
 *
 * The result is enforced upstream by the agent registry's executeTool: if
 * DENY, the tool refuses to run and the founder sees a clear explanation.
 *
 * The pricing model is conservative — actual prices today are LOWER than
 * what we model. We model worst-case so the guard never under-counts.
 *
 *   Claude Opus 4 (worst case for our agent calls):
 *     Input:  $15 / Mtok ≈ ₹1.26 / 1k tokens (at ₹84/USD)
 *     Output: $75 / Mtok ≈ ₹6.30 / 1k tokens
 *
 *   Storage + bandwidth: ~₹2/seller/month at low scale
 *   Razorpay gateway: 2% of GMV (paid from gross, not platform margin)
 *   Domain + SSL + hosting: ~₹85/month total, amortized across all sellers
 *
 * The guard is a SINGLE SOURCE OF TRUTH for "what does this cost?" — every
 * caller goes through it. No bypasses.
 */

// ════════════════════════════════════════════════════════════
// PRICING MODEL — conservative paise figures
// ════════════════════════════════════════════════════════════

const INR_PER_USD = 84;

/** Claude Opus 4 worst-case pricing in paise per 1,000 tokens.
 *  We use these to estimate per-call cost. Haiku is much cheaper and used
 *  as a fallback when the platform is near-loss (the reroute_to_haiku
 *  runbook from src/operations.js fires when this happens). */
const INFERENCE_PRICING_PAISE = Object.freeze({
  opus_4: Object.freeze({
    input_per_1k_tokens_paise: Math.round(1500 / 1000 * INR_PER_USD),   // ~126 paise
    output_per_1k_tokens_paise: Math.round(7500 / 1000 * INR_PER_USD),  // ~630 paise
  }),
  sonnet_4: Object.freeze({
    input_per_1k_tokens_paise: Math.round(300 / 1000 * INR_PER_USD),    // ~25 paise
    output_per_1k_tokens_paise: Math.round(1500 / 1000 * INR_PER_USD),  // ~126 paise
  }),
  haiku_4_5: Object.freeze({
    input_per_1k_tokens_paise: Math.round(100 / 1000 * INR_PER_USD),    // ~8 paise
    output_per_1k_tokens_paise: Math.round(500 / 1000 * INR_PER_USD),   // ~42 paise
  }),
});

/** Per-tool token estimates. Real measurements would replace these — we
 *  start with conservative worst-case so the guard over-counts not under. */
const TOOL_COST_ESTIMATES = Object.freeze({
  // Read-only ops tools — small input, small output
  run_health_checks:         { input_tokens: 2000, output_tokens: 400 },
  recommended_runbooks:      { input_tokens: 2500, output_tokens: 600 },
  list_due_windows:          { input_tokens: 1500, output_tokens: 200 },
  list_products_by_seller:   { input_tokens: 3000, output_tokens: 800 },
  catalog_value_paise:       { input_tokens: 2000, output_tokens: 200 },
  list_open_returns:         { input_tokens: 3000, output_tokens: 800 },
  tier_profitability_report: { input_tokens: 2500, output_tokens: 1500 },
  runway_projection:         { input_tokens: 2000, output_tokens: 1000 },
  identify_underserved_verticals: { input_tokens: 4000, output_tokens: 1200 },

  // Marketing — creative generation needs more output tokens
  generate_ad_creative:      { input_tokens: 1500, output_tokens: 1500 },
  estimate_campaign_reach:   { input_tokens: 1200, output_tokens: 400 },
  guarded_ad_spend:          { input_tokens: 1500, output_tokens: 600 },

  // Mutating tools — large input (need context), small output (just status)
  transition_product:        { input_tokens: 3500, output_tokens: 500 },
  transition_return:         { input_tokens: 3500, output_tokens: 500 },
  execute_runbook:           { input_tokens: 4000, output_tokens: 1500 },

  // Legacy tools (still in aiTools.js)
  search_leads:              { input_tokens: 2500, output_tokens: 1000 },
  get_lead:                  { input_tokens: 2000, output_tokens: 800 },
  summarize_funnel:          { input_tokens: 2500, output_tokens: 1200 },
  check_scheme_eligibility:  { input_tokens: 3000, output_tokens: 1500 },
  transition_lead:           { input_tokens: 3000, output_tokens: 500 },

  // Plain founder chat (no tool call)
  _chat_turn:                { input_tokens: 8000, output_tokens: 1500 },
});

/** Default fallback if tool not in the estimates map. Worst case. */
const UNKNOWN_TOOL_ESTIMATE = Object.freeze({ input_tokens: 10000, output_tokens: 2000 });

/** Per-seller monthly revenue contribution (paise) by archetype.
 *  This is conservative — assumes seller hits the assumed_gmv from
 *  unitEconomics, not the upper bound. */
const ARCHETYPE_REVENUE_PAISE = Object.freeze({
  karigar:  { sub: 49900,   commission_at_gmv: 90000,   gmv_assumed: 3000000  },  // ₹499 + 3% of ₹30k = ₹1,399
  vyapari:  { sub: 249900,  commission_at_gmv: 1000000, gmv_assumed: 25000000 }, // ₹2,499 + 4% of ₹2.5L = ₹12,499
  niryatak: { sub: 799900,  commission_at_gmv: 6000000, gmv_assumed: 150000000 },// ₹7,999 + 4% of ₹15L = ₹67,999
  sansthan: { sub: 0,       commission_at_gmv: 1500000, gmv_assumed: 50000000 }, // 3% of ₹5L = ₹15,000
  pravasi:  { sub: 199900,  commission_at_gmv: 600000,  gmv_assumed: 15000000 },// ₹1,999 + 4% of ₹1.5L = ₹7,999
});

/** Decision verdicts. */
const VERDICT = Object.freeze({
  APPROVE: 'approve',
  WARN: 'warn',
  DENY: 'deny',
});

/** Safety thresholds — fraction of monthly revenue allocated to inference.
 *  At 30% of revenue we warn. At 60% we deny — beyond that, an active seller
 *  would consume so much inference that they erode platform margin below the
 *  30% floor that adGeneration.js also enforces. */
const WARN_THRESHOLD = 0.30;
const DENY_THRESHOLD = 0.60;

// ════════════════════════════════════════════════════════════
// COST ESTIMATION
// ════════════════════════════════════════════════════════════

/** Cost in paise to make one inference call with the given estimates. */
function estimateCallCostPaise(estimate, model = 'opus_4') {
  const pricing = INFERENCE_PRICING_PAISE[model] || INFERENCE_PRICING_PAISE.opus_4;
  const inputCost = (estimate.input_tokens / 1000) * pricing.input_per_1k_tokens_paise;
  const outputCost = (estimate.output_tokens / 1000) * pricing.output_per_1k_tokens_paise;
  return Math.ceil(inputCost + outputCost);
}

/** Cost in paise for a single tool call. */
function estimateToolCostPaise(toolName, model = 'opus_4') {
  const estimate = TOOL_COST_ESTIMATES[toolName] || UNKNOWN_TOOL_ESTIMATE;
  return estimateCallCostPaise(estimate, model);
}

/** Estimate the full revenue contribution from a single seller per month. */
function estimateMonthlyRevenuePaise(archetype) {
  const r = ARCHETYPE_REVENUE_PAISE[archetype];
  if (!r) return 0;
  return r.sub + r.commission_at_gmv;
}

// ════════════════════════════════════════════════════════════
// LEDGER — per-seller cumulative cost
// ════════════════════════════════════════════════════════════

/**
 * In-memory ledger of every cost incurred per seller per month.
 * Production: persist this to the store, partitioned by month.
 */
class CostLedger {
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    // sellerId → { month: 'YYYY-MM', cost_paise, calls: [...] }
    this._ledger = new Map();
    // Platform-wide costs (not seller-attributed)
    this._platform_overhead_paise_monthly = opts.platform_overhead_paise_monthly || 8500; // domain+SSL
  }

  _currentMonth() {
    const d = new Date(this.now());
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  _key(sellerId) {
    return `${sellerId}:${this._currentMonth()}`;
  }

  /** Record a cost. Returns the new running total for the seller-month. */
  recordCost(sellerId, costPaise, reason) {
    const key = this._key(sellerId);
    const existing = this._ledger.get(key) || { sellerId, month: this._currentMonth(), cost_paise: 0, calls: [] };
    existing.cost_paise += costPaise;
    existing.calls.push({ at: this.now(), cost_paise: costPaise, reason });
    // Cap call history to last 100 to bound memory
    if (existing.calls.length > 100) existing.calls = existing.calls.slice(-100);
    this._ledger.set(key, existing);
    return existing.cost_paise;
  }

  /** Get the current month's total cost for a seller (paise). */
  getMonthlyCostPaise(sellerId) {
    const key = this._key(sellerId);
    return this._ledger.get(key)?.cost_paise || 0;
  }

  /** Full record for inspection. */
  getRecord(sellerId) {
    const key = this._key(sellerId);
    return this._ledger.get(key) || null;
  }

  /** Snapshot all sellers for the founder dashboard. */
  snapshot() {
    return [...this._ledger.values()];
  }

  /** Reset (for tests). */
  reset() {
    this._ledger.clear();
  }
}

// ════════════════════════════════════════════════════════════
// PROFIT GUARD
// ════════════════════════════════════════════════════════════

/**
 * canAfford — the gatekeeper.
 *
 * @param {object} args
 * @param {string} args.toolName       — for cost estimation
 * @param {string} args.sellerId       — for revenue lookup; may be null for platform-wide ops
 * @param {string} [args.archetype]    — overrides seller lookup
 * @param {CostLedger} args.ledger     — the running ledger
 * @param {object} [args.sellerLookup] — { getSeller(id) } returning {archetype, ...}
 * @param {string} [args.model]        — opus_4|sonnet_4|haiku_4_5; defaults to opus_4
 * @returns {object} { verdict, reason, projected_cost_paise, current_cost_paise, monthly_revenue_paise, headroom_paise, recommended_model? }
 */
function canAfford(args) {
  const {
    toolName,
    sellerId,
    archetype: archetypeOverride,
    ledger,
    sellerLookup,
    model = 'opus_4',
  } = args;

  if (!ledger) throw new Error('canAfford requires a CostLedger instance');

  const callCost = estimateToolCostPaise(toolName, model);

  // Platform-wide call (no seller) — always approve but record to platform budget
  if (!sellerId) {
    return {
      verdict: VERDICT.APPROVE,
      reason: 'Platform-wide operation (no seller attribution)',
      projected_cost_paise: callCost,
      current_cost_paise: 0,
      monthly_revenue_paise: null,
      headroom_paise: null,
    };
  }

  // Resolve archetype
  let archetype = archetypeOverride;
  if (!archetype && sellerLookup && typeof sellerLookup.getSeller === 'function') {
    const seller = sellerLookup.getSeller(sellerId);
    archetype = seller?.archetype;
  }
  if (!archetype) {
    return {
      verdict: VERDICT.WARN,
      reason: `Unknown archetype for seller ${sellerId} — proceeding but cost not attributed`,
      projected_cost_paise: callCost,
      current_cost_paise: 0,
      monthly_revenue_paise: 0,
      headroom_paise: 0,
    };
  }

  const monthlyRevenue = estimateMonthlyRevenuePaise(archetype);
  const currentCost = ledger.getMonthlyCostPaise(sellerId);
  const projectedTotal = currentCost + callCost;
  const utilization = monthlyRevenue > 0 ? projectedTotal / monthlyRevenue : Infinity;

  // Determine verdict
  if (utilization >= DENY_THRESHOLD) {
    // Try a cheaper model — if Haiku brings us back under, suggest reroute
    const haikuCost = estimateToolCostPaise(toolName, 'haiku_4_5');
    const haikuProjected = currentCost + haikuCost;
    const haikuUtilization = monthlyRevenue > 0 ? haikuProjected / monthlyRevenue : Infinity;
    if (haikuUtilization < DENY_THRESHOLD) {
      return {
        verdict: VERDICT.WARN,
        reason: `Opus would push cost to ${(utilization * 100).toFixed(1)}% of revenue — reroute to Haiku to stay profitable`,
        projected_cost_paise: haikuCost,
        current_cost_paise: currentCost,
        monthly_revenue_paise: monthlyRevenue,
        headroom_paise: monthlyRevenue - haikuProjected,
        recommended_model: 'haiku_4_5',
      };
    }
    return {
      verdict: VERDICT.DENY,
      reason: `This call would push monthly cost to ${(utilization * 100).toFixed(1)}% of revenue (deny threshold ${DENY_THRESHOLD * 100}%). Platform would be at loss on this seller.`,
      projected_cost_paise: callCost,
      current_cost_paise: currentCost,
      monthly_revenue_paise: monthlyRevenue,
      headroom_paise: monthlyRevenue - currentCost,
    };
  }

  if (utilization >= WARN_THRESHOLD) {
    return {
      verdict: VERDICT.WARN,
      reason: `Cost utilization ${(utilization * 100).toFixed(1)}% of revenue — approaching deny threshold`,
      projected_cost_paise: callCost,
      current_cost_paise: currentCost,
      monthly_revenue_paise: monthlyRevenue,
      headroom_paise: monthlyRevenue - projectedTotal,
    };
  }

  return {
    verdict: VERDICT.APPROVE,
    reason: `Profitable. Cost utilization ${(utilization * 100).toFixed(1)}% of monthly revenue.`,
    projected_cost_paise: callCost,
    current_cost_paise: currentCost,
    monthly_revenue_paise: monthlyRevenue,
    headroom_paise: monthlyRevenue - projectedTotal,
  };
}

/** Per-seller profit-and-loss summary. */
function sellerPnL(sellerId, archetype, ledger) {
  const cost = ledger.getMonthlyCostPaise(sellerId);
  const revenue = estimateMonthlyRevenuePaise(archetype);
  const profit = revenue - cost;
  const marginPct = revenue > 0 ? (profit / revenue) : null;
  return {
    seller_id: sellerId,
    archetype,
    month: ledger._currentMonth(),
    revenue_paise: revenue,
    cost_paise: cost,
    profit_paise: profit,
    margin_pct: marginPct != null ? Number((marginPct * 100).toFixed(2)) : null,
    in_loss: profit < 0,
  };
}

/** Aggregate profitability across all sellers — for the founder dashboard. */
function platformPnL(ledger, sellerLookup) {
  let totalRevenue = 0, totalCost = 0;
  const inLoss = [];
  const sellers = sellerLookup && typeof sellerLookup.listSellers === 'function'
    ? sellerLookup.listSellers()
    : [];
  for (const seller of sellers) {
    const pnl = sellerPnL(seller.id, seller.archetype, ledger);
    totalRevenue += pnl.revenue_paise;
    totalCost += pnl.cost_paise;
    if (pnl.in_loss) inLoss.push(pnl);
  }
  return {
    month: ledger._currentMonth(),
    seller_count: sellers.length,
    total_revenue_paise: totalRevenue,
    total_cost_paise: totalCost,
    platform_overhead_paise: ledger._platform_overhead_paise_monthly,
    net_profit_paise: totalRevenue - totalCost - ledger._platform_overhead_paise_monthly,
    margin_pct: totalRevenue > 0
      ? Number((((totalRevenue - totalCost - ledger._platform_overhead_paise_monthly) / totalRevenue) * 100).toFixed(2))
      : null,
    sellers_in_loss: inLoss,
  };
}

module.exports = {
  INR_PER_USD,
  INFERENCE_PRICING_PAISE,
  TOOL_COST_ESTIMATES,
  ARCHETYPE_REVENUE_PAISE,
  VERDICT,
  WARN_THRESHOLD,
  DENY_THRESHOLD,
  estimateCallCostPaise,
  estimateToolCostPaise,
  estimateMonthlyRevenuePaise,
  CostLedger,
  canAfford,
  sellerPnL,
  platformPnL,
};
