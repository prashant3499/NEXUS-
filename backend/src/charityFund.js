'use strict';

/**
 * charityFund.js
 *
 * Charity on NEXUS has a deliberate two-sided design:
 *
 *   • TRANSPARENT to customers — a buyer can see that their purchase
 *     contributed to artisan welfare, and the total the community has raised.
 *     Visibility builds trust and makes the contribution feel real.
 *
 *   • The SPENDING PLAN is the FOUNDER's alone — how the accumulated fund is
 *     allocated across causes, and when it is disbursed, is a founder decision,
 *     not a public vote or an automatic split. Customers see THAT it is spent
 *     well; the founder decides HOW.
 *
 * The money model is unchanged: charity is borne by the platform (carved from
 * its own commission, capped at 5%), never added as a surprise cost to the
 * buyer or taken from the maker's payout. This module is the LEDGER + the
 * founder's allocation plan on top of that slice.
 *
 * Pure + dependency-free. The server persists the fund state and gates the
 * allocation endpoints to the founder.
 */

// Causes the fund can support. Extensible.
const CAUSES = Object.freeze({
  artisan_welfare: 'Artisan welfare & emergencies',
  cluster_development: 'Craft cluster development',
  next_gen_skilling: 'Next-generation skilling',
  womens_collectives: "Women's craft collectives",
  heritage_revival: 'Endangered-craft revival',
});

function emptyFund() {
  return {
    raised_paise: 0,            // total contributed (from transaction slices)
    disbursed_paise: 0,         // total actually paid out to causes
    contributions: 0,           // count of contributing transactions
    allocation_plan: [],        // founder-set: [{ cause, pct }]  (must sum <= 100)
    disbursements: [],          // founder-recorded payouts: [{ cause, amount_paise, at, note }]
    updated_at: null,
  };
}

/**
 * checkoutAsk — the prompt shown at the PAYMENT GATEWAY, just before payment.
 * Charity is not a stored preference; the customer is simply asked once, at the
 * moment of paying, whether to round up / add a small contribution. Their
 * answer at that moment is what `recordContribution({ optedIn })` receives.
 *
 * @param {number} orderTotalPaise
 * @param {number} ratePct  suggested contribution rate (default 0.2%)
 * @returns { ask, suggested_paise, suggested_display, message, default }
 */
function checkoutAsk(orderTotalPaise, ratePct = 0.002) {
  const suggested = Math.max(100, Math.round((orderTotalPaise || 0) * ratePct)); // min ₹1
  const rupees = (suggested / 100).toLocaleString('en-IN', { minimumFractionDigits: suggested % 100 ? 2 : 0 });
  return {
    ask: true,
    suggested_paise: suggested,
    suggested_display: '₹' + rupees,
    message: `Add ₹${rupees} to support artisan welfare? The platform matches it — it costs the maker nothing.`,
    default: false,               // asked, never pre-checked
    note: 'Optional. Asked once at payment; your answer applies to this order only.',
  };
}

/**
 * recordContribution — add a charity slice from a settled transaction. The
 * `optedIn` flag is the customer's answer to the payment-gateway ask for THIS
 * order. No answer / declined → nothing recorded.
 */
function recordContribution(fund, amount_paise, opts = {}, now = Date.now()) {
  if (opts.optedIn !== true) return fund;        // optional — opt-in required
  if (!(amount_paise > 0)) return fund;
  fund.raised_paise += Math.round(amount_paise);
  fund.contributions += 1;
  fund.updated_at = now;
  return fund;
}

/**
 * publicTransparency — what a CUSTOMER sees. Aggregate, honest, no allocation
 * controls. Shows the total raised, what it supports, and how much is still
 * available to deploy. Never exposes founder-only spending decisions in a way
 * that implies the customer controls them.
 */
function publicTransparency(fund) {
  const balance = Math.max(0, fund.raised_paise - fund.disbursed_paise);
  const causesSupported = [...new Set(fund.disbursements.map((d) => d.cause))]
    .map((c) => ({ cause: c, label: CAUSES[c] || c }));
  return {
    total_raised_paise: fund.raised_paise,
    total_disbursed_paise: fund.disbursed_paise,
    available_paise: balance,
    contributing_purchases: fund.contributions,
    causes_supported: causesSupported,
    borne_by: 'platform',
    note: 'Your purchase contributes to artisan welfare at no extra cost — the platform funds this from its own commission.',
  };
}

/**
 * setAllocationPlan — FOUNDER ONLY. Define how the fund is intended to be
 * split across causes. Validates the split sums to <= 100% and uses known
 * causes. Does not move money; it's the plan.
 * @returns { ok, plan } | { ok:false, error }
 */
function setAllocationPlan(fund, plan, now = Date.now()) {
  if (!Array.isArray(plan)) return { ok: false, error: 'plan must be an array of { cause, pct }' };
  let sum = 0;
  for (const p of plan) {
    if (!CAUSES[p.cause]) return { ok: false, error: `unknown cause: ${p.cause}` };
    if (!(p.pct >= 0 && p.pct <= 100)) return { ok: false, error: `pct out of range for ${p.cause}` };
    sum += p.pct;
  }
  if (sum > 100.0001) return { ok: false, error: `allocation sums to ${sum}% — cannot exceed 100%` };
  fund.allocation_plan = plan.map((p) => ({ cause: p.cause, label: CAUSES[p.cause], pct: p.pct }));
  fund.updated_at = now;
  return { ok: true, plan: fund.allocation_plan, unallocated_pct: Math.round((100 - sum) * 10) / 10 };
}

/**
 * recordDisbursement — FOUNDER ONLY. Record that fund money was actually paid
 * out to a cause. Cannot disburse more than is available.
 * @returns { ok, fund } | { ok:false, error }
 */
function recordDisbursement(fund, cause, amount_paise, note, now = Date.now()) {
  if (!CAUSES[cause]) return { ok: false, error: `unknown cause: ${cause}` };
  const available = fund.raised_paise - fund.disbursed_paise;
  if (!(amount_paise > 0)) return { ok: false, error: 'amount must be positive' };
  if (amount_paise > available) return { ok: false, error: `only ₹${Math.round(available / 100)} available to disburse` };
  fund.disbursed_paise += Math.round(amount_paise);
  fund.disbursements.push({ cause, label: CAUSES[cause], amount_paise: Math.round(amount_paise), note: note || null, at: now });
  fund.updated_at = now;
  return { ok: true, fund };
}

/**
 * founderView — the full picture for the FOUNDER: everything in transparency,
 * plus the allocation plan and disbursement history (the spending controls).
 */
function founderView(fund) {
  return {
    ...publicTransparency(fund),
    allocation_plan: fund.allocation_plan,
    disbursements: fund.disbursements,
    causes_available: Object.entries(CAUSES).map(([id, label]) => ({ id, label })),
    founder_only: true,
  };
}

module.exports = {
  CAUSES, emptyFund, recordContribution, checkoutAsk,
  publicTransparency, setAllocationPlan, recordDisbursement, founderView,
};
