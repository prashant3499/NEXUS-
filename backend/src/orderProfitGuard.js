'use strict';

/**
 * orderProfitGuard.js
 *
 * Closes the loop on the "platform never in loss" constraint at the order
 * boundary, not just the AI-co-founder boundary.
 *
 *   AI co-founder side  (already done in profitGuard.js):
 *     → every Claude tool call is gated; deny if cost would push the
 *       seller's month above 60% of monthly revenue.
 *
 *   Order side  (this module):
 *     → every BUYER order is gated; deny (or warn) if the platform's
 *       net contribution from the order doesn't cover the seller's
 *       remaining marginal cost of service this month.
 *
 * What "covers the seller's marginal cost" means in practice:
 *   - The slicer splits the gross order. NEXUS keeps `platform_commission`
 *     (the GST on commission is the government's, gateway fee is the
 *     PSP's). That's the *platform contribution* per order.
 *   - The seller has already burned some inference cost this month (from
 *     profitGuard.CostLedger). Call this `unfunded_cost`.
 *   - If the platform's contribution from this single order is less than
 *     a per-order share of the unfunded cost, NEXUS would lose money on
 *     this seller. We refuse the order.
 *
 * Three verdicts:
 *   APPROVE — contribution comfortably covers expected marginal cost
 *   WARN    — contribution covers it but margin is thin (under 30%)
 *   DENY    — contribution is below marginal cost; platform would lose
 *             money on this seller this month
 *
 * As with profitGuard, every check is integer-paise and conservative. We
 * never under-count cost; we never over-count revenue.
 */

const slicer = require('./slicer');
const profitGuard = require('./profitGuard');

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

/** Margin floor on platform contribution per order. Below this, even if
 *  the contribution covers marginal cost, the order is too thin to be
 *  worth running. 30% mirrors the ad-spend floor in adGeneration.js. */
const ORDER_MARGIN_FLOOR_PCT = 0.30;

/** Minimum order size to bother running through the guard at all.
 *  Tiny orders (a ₹50 sticker) aren't worth the platform's time
 *  but we don't want to deny them either — we just stamp them OK. */
const TINY_ORDER_PAISE = 5000;  // ₹50

/** Verdicts. */
const ORDER_VERDICT = Object.freeze({
  APPROVE: 'approve',
  WARN: 'warn',
  DENY: 'deny',
});

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

/** Compute the platform's net contribution per order in paise.
 *  - platform_commission goes to NEXUS
 *  - gst_on_commission is owed to the government (passes through)
 *  - payment_gateway_fee goes to Razorpay/PSP (deducted from platform)
 *  Real net = platform_commission - payment_gateway_fee */
function platformNetContributionPaise(slice) {
  const commission = slice?.slices?.platform_commission || 0;
  const gateway = slice?.slices?.payment_gateway_fee || 0;
  return commission - gateway;
}

/** Project how many orders a seller is likely to place this month
 *  given their archetype's assumed GMV and the order size. */
function projectedMonthlyOrders(archetype, orderTotalPaise) {
  const rev = profitGuard.ARCHETYPE_REVENUE_PAISE[archetype];
  if (!rev || !rev.gmv_assumed || orderTotalPaise <= 0) return 1;
  return Math.max(1, Math.round(rev.gmv_assumed / orderTotalPaise));
}

// ════════════════════════════════════════════════════════════
// THE GUARD
// ════════════════════════════════════════════════════════════

/**
 * canAcceptOrder — gates a single buyer order.
 *
 * @param {object} args
 * @param {number} args.orderTotalRupees   — gross order total
 * @param {string} args.sellerId            — for ledger lookup
 * @param {string} args.archetype           — for revenue + cost projection
 * @param {object} args.ledger              — CostLedger from profitGuard
 * @param {object} [args.sliceOpts]         — passed through to slicer
 * @returns {object} {
 *   verdict, reason,
 *   order_total_paise,
 *   platform_contribution_paise,    // what NEXUS actually keeps
 *   contribution_margin_pct,         // contribution as % of gross
 *   seller_unfunded_cost_paise,      // running cost the seller hasn't yet paid for
 *   marginal_cost_per_order_paise,   // unfunded cost amortized over projected orders
 *   slice,                           // the full slicer output for audit
 *   recommended_action?              // e.g. raise_price, refuse, reroute_to_haiku
 * }
 */
function canAcceptOrder(args) {
  const { orderTotalRupees, sellerId, archetype, ledger, sliceOpts } = args;
  if (!ledger) throw new Error('canAcceptOrder requires a CostLedger');
  if (!sellerId) throw new Error('canAcceptOrder requires a sellerId');
  if (!archetype) throw new Error('canAcceptOrder requires an archetype');

  // 1. Slice the order to know what the platform keeps
  let slice;
  try {
    slice = slicer.sliceTransaction(orderTotalRupees, sliceOpts || {});
  } catch (e) {
    return {
      verdict: ORDER_VERDICT.DENY,
      reason: `Slicer rejected the order: ${e.message}`,
      order_total_paise: 0,
      slice: null,
    };
  }

  const orderTotalPaise = slice.order_total;
  const platformContribution = platformNetContributionPaise(slice);
  const contributionMarginPct = orderTotalPaise > 0 ? platformContribution / orderTotalPaise : 0;

  // 2. Tiny orders: stamp OK without further checks. The slicer math
  // already produced a viable split — denying a ₹50 sticker is silly.
  if (orderTotalPaise < TINY_ORDER_PAISE) {
    return {
      verdict: ORDER_VERDICT.APPROVE,
      reason: 'Order below tiny-order threshold — no profit gate applied',
      order_total_paise: orderTotalPaise,
      platform_contribution_paise: platformContribution,
      contribution_margin_pct: Number((contributionMarginPct * 100).toFixed(2)),
      seller_unfunded_cost_paise: 0,
      marginal_cost_per_order_paise: 0,
      slice,
    };
  }

  // 3. Look up the seller's running cost this month
  const monthlyCost = ledger.getMonthlyCostPaise(sellerId);
  const monthlyRevenue = profitGuard.estimateMonthlyRevenuePaise(archetype);

  // The seller's monthly revenue comes from sub + commission. Sub is
  // paid; commission accumulates with orders. So "unfunded cost" is the
  // running inference cost MINUS the portion expected to be covered by
  // the monthly subscription. If sub already > cost, nothing is unfunded.
  const rev = profitGuard.ARCHETYPE_REVENUE_PAISE[archetype];
  const subRevenue = rev ? rev.sub : 0;
  const unfundedCost = Math.max(0, monthlyCost - subRevenue);

  // 4. Project how many more orders this seller is likely to place this
  // month, so we can amortize unfunded cost across them.
  const projectedOrdersPerMonth = projectedMonthlyOrders(archetype, orderTotalPaise);
  const marginalCostPerOrder = projectedOrdersPerMonth > 0
    ? Math.ceil(unfundedCost / projectedOrdersPerMonth)
    : unfundedCost;

  // 5. Verdict
  if (platformContribution < marginalCostPerOrder) {
    return {
      verdict: ORDER_VERDICT.DENY,
      reason: `Platform contribution ₹${(platformContribution/100).toFixed(2)} would not cover this seller's unfunded marginal cost per order ₹${(marginalCostPerOrder/100).toFixed(2)}. Accepting would put the platform in loss on this seller.`,
      order_total_paise: orderTotalPaise,
      platform_contribution_paise: platformContribution,
      contribution_margin_pct: Number((contributionMarginPct * 100).toFixed(2)),
      seller_unfunded_cost_paise: unfundedCost,
      marginal_cost_per_order_paise: marginalCostPerOrder,
      slice,
      recommended_action: 'reroute_to_haiku',  // cheaper inference for future calls
    };
  }

  if (contributionMarginPct < ORDER_MARGIN_FLOOR_PCT) {
    return {
      verdict: ORDER_VERDICT.WARN,
      reason: `Contribution margin ${(contributionMarginPct*100).toFixed(2)}% is below the ${(ORDER_MARGIN_FLOOR_PCT*100).toFixed(0)}% floor. Order will be accepted but is thin.`,
      order_total_paise: orderTotalPaise,
      platform_contribution_paise: platformContribution,
      contribution_margin_pct: Number((contributionMarginPct * 100).toFixed(2)),
      seller_unfunded_cost_paise: unfundedCost,
      marginal_cost_per_order_paise: marginalCostPerOrder,
      slice,
    };
  }

  return {
    verdict: ORDER_VERDICT.APPROVE,
    reason: `Platform contribution ₹${(platformContribution/100).toFixed(2)} (margin ${(contributionMarginPct*100).toFixed(2)}%) comfortably exceeds marginal cost.`,
    order_total_paise: orderTotalPaise,
    platform_contribution_paise: platformContribution,
    contribution_margin_pct: Number((contributionMarginPct * 100).toFixed(2)),
    seller_unfunded_cost_paise: unfundedCost,
    marginal_cost_per_order_paise: marginalCostPerOrder,
    slice,
  };
}

/** Bulk-classify a list of orders. For founder dashboards: "show me which
 *  pending orders would be denied if accepted today." */
function classifyOrders(orders, { ledger, sellerLookup }) {
  return orders.map(order => {
    const seller = sellerLookup.getSeller(order.seller_id);
    if (!seller) {
      return {
        order_id: order.id,
        verdict: ORDER_VERDICT.DENY,
        reason: 'Seller not found',
      };
    }
    return {
      order_id: order.id,
      ...canAcceptOrder({
        orderTotalRupees: order.total_rupees,
        sellerId: order.seller_id,
        archetype: seller.archetype,
        ledger,
      }),
    };
  });
}

module.exports = {
  ORDER_MARGIN_FLOOR_PCT,
  TINY_ORDER_PAISE,
  ORDER_VERDICT,
  platformNetContributionPaise,
  projectedMonthlyOrders,
  canAcceptOrder,
  classifyOrders,
};
