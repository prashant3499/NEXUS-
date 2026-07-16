'use strict';

/**
 * saasMetrics.js
 *
 * The numbers that tell you whether this is a real business: MRR/ARR, churn,
 * CAC, LTV, and the golden ratio (LTV:CAC). Computed from real platform data —
 * the seller base, their tiers/prices, acquisition spend, and lifespan — never
 * vanity figures.
 *
 * Benchmarks used for the verdicts (standard SaaS rules of thumb):
 *   - LTV:CAC  >= 3 is healthy; < 1 means you lose money on every customer.
 *   - CAC payback <= 12 months is healthy for SMB SaaS.
 *   - Monthly logo churn <= ~3-5% is healthy for SMB; lower is better.
 *   - Net revenue retention >= 100% means the base grows without new logos.
 */

const BENCHMARKS = Object.freeze({
  GOLDEN_LTV_CAC: 3,        // the "golden ratio"
  CAC_PAYBACK_MONTHS: 12,
  HEALTHY_MONTHLY_CHURN: 0.05,
  GROSS_MARGIN_TARGET: 0.7,
});

const r2 = (n) => Math.round(n * 100) / 100;
const rupees = (paise) => Math.round((paise || 0) / 100);

/**
 * mrr — Monthly Recurring Revenue from active subscriptions.
 * @param {object[]} subscriptions — [{ tier, price_paise, active }]
 * @returns { mrr_paise, arr_paise, by_tier, active_count }
 */
function mrr(subscriptions = []) {
  const active = subscriptions.filter((s) => s.active !== false && (s.price_paise || 0) > 0);
  const byTier = {};
  let total = 0;
  for (const s of active) {
    total += s.price_paise;
    byTier[s.tier] = (byTier[s.tier] || 0) + s.price_paise;
  }
  return {
    mrr_paise: total,
    arr_paise: total * 12,
    mrr_rupees: rupees(total),
    arr_rupees: rupees(total * 12),
    by_tier: byTier,
    active_count: active.length,
    arpa_paise: active.length ? Math.round(total / active.length) : 0,  // avg revenue per account
  };
}

/**
 * churn — logo + revenue churn over a period.
 * @param {object} p — { startCount, churnedCount, startMrrPaise, churnedMrrPaise, expansionMrrPaise }
 * @returns { logo_churn_rate, revenue_churn_rate, net_revenue_retention, verdict }
 */
function churn(p = {}) {
  const startCount = p.startCount || 0;
  const logoChurn = startCount > 0 ? (p.churnedCount || 0) / startCount : 0;
  const startMrr = p.startMrrPaise || 0;
  const revChurn = startMrr > 0 ? (p.churnedMrrPaise || 0) / startMrr : 0;
  // Net revenue retention: (start - churned + expansion) / start
  const nrr = startMrr > 0
    ? (startMrr - (p.churnedMrrPaise || 0) + (p.expansionMrrPaise || 0)) / startMrr
    : null;
  return {
    logo_churn_rate: r2(logoChurn),
    revenue_churn_rate: r2(revChurn),
    net_revenue_retention: nrr == null ? null : r2(nrr),
    verdict: logoChurn <= BENCHMARKS.HEALTHY_MONTHLY_CHURN ? 'healthy' : (logoChurn <= 0.08 ? 'watch' : 'high'),
  };
}

/**
 * cac — Customer Acquisition Cost.
 * @param {object} p — { salesMarketingSpendPaise, customersAcquired }
 */
function cac(p = {}) {
  const spend = p.salesMarketingSpendPaise || 0;
  const acquired = p.customersAcquired || 0;
  const cacPaise = acquired > 0 ? Math.round(spend / acquired) : null;
  return { cac_paise: cacPaise, cac_rupees: cacPaise == null ? null : rupees(cacPaise), customers_acquired: acquired, spend_paise: spend };
}

/**
 * ltv — Lifetime Value. LTV = ARPA × gross margin × average lifespan (months).
 * Lifespan is derived from churn when not given (1 / monthly churn).
 * @param {object} p — { arpaPaise, grossMargin, monthlyChurnRate, lifespanMonths }
 */
function ltv(p = {}) {
  const arpa = p.arpaPaise || 0;
  const margin = p.grossMargin != null ? p.grossMargin : BENCHMARKS.GROSS_MARGIN_TARGET;
  let lifespan = p.lifespanMonths;
  if (lifespan == null) {
    lifespan = p.monthlyChurnRate && p.monthlyChurnRate > 0 ? (1 / p.monthlyChurnRate) : 24; // default 24mo if unknown
  }
  const ltvPaise = Math.round(arpa * margin * lifespan);
  return { ltv_paise: ltvPaise, ltv_rupees: rupees(ltvPaise), lifespan_months: r2(lifespan), gross_margin: margin };
}

/**
 * goldenRatio — the LTV:CAC ratio + CAC payback, with a verdict. This is the
 * single most important health signal for a subscription business.
 */
function goldenRatio({ ltvPaise, cacPaise, arpaPaise, grossMargin = BENCHMARKS.GROSS_MARGIN_TARGET } = {}) {
  if (!cacPaise || cacPaise <= 0) {
    return { ratio: null, verdict: 'no_cac', note: 'No acquisition cost recorded yet — organic/founder-led acquisition. Ratio is undefined until you spend to acquire.' };
  }
  const ratio = ltvPaise && cacPaise ? r2(ltvPaise / cacPaise) : null;
  // CAC payback (months) = CAC / (ARPA × gross margin)
  const monthlyGrossPerAccount = (arpaPaise || 0) * grossMargin;
  const paybackMonths = monthlyGrossPerAccount > 0 ? r2(cacPaise / monthlyGrossPerAccount) : null;
  let verdict = 'unknown';
  if (ratio != null) {
    if (ratio >= BENCHMARKS.GOLDEN_LTV_CAC) verdict = 'healthy';
    else if (ratio >= 1) verdict = 'marginal';
    else verdict = 'unprofitable';
  }
  return {
    ratio,
    benchmark: BENCHMARKS.GOLDEN_LTV_CAC,
    verdict,
    cac_payback_months: paybackMonths,
    payback_healthy: paybackMonths == null ? null : paybackMonths <= BENCHMARKS.CAC_PAYBACK_MONTHS,
    note: verdict === 'healthy' ? 'LTV:CAC at or above 3 — efficient growth; you can invest to scale.'
      : verdict === 'marginal' ? 'LTV:CAC between 1 and 3 — you recover cost but growth is inefficient; improve retention or lower CAC before scaling spend.'
      : verdict === 'unprofitable' ? 'LTV:CAC below 1 — you lose money on every customer. Do not scale acquisition; fix the model first.'
      : 'Ratio undefined.',
  };
}

/**
 * report — the full SaaS scorecard from raw inputs. Ties the pieces together
 * and produces one set of headline numbers + a single overall verdict.
 */
function report(input = {}) {
  const m = mrr(input.subscriptions || []);
  const c = churn(input.churn || {});
  const ac = cac(input.acquisition || {});
  const lt = ltv({ arpaPaise: m.arpa_paise, grossMargin: input.grossMargin, monthlyChurnRate: c.logo_churn_rate || undefined, lifespanMonths: input.lifespanMonths });
  const gr = goldenRatio({ ltvPaise: lt.ltv_paise, cacPaise: ac.cac_paise, arpaPaise: m.arpa_paise, grossMargin: input.grossMargin });

  // Overall verdict: prioritise the worst signal.
  let overall = 'healthy';
  if (gr.verdict === 'unprofitable' || c.verdict === 'high') overall = 'act_now';
  else if (gr.verdict === 'marginal' || c.verdict === 'watch' || gr.verdict === 'no_cac' || m.active_count === 0) overall = 'watch';

  return {
    overall,
    mrr: m,
    churn: c,
    cac: ac,
    ltv: lt,
    golden_ratio: gr,
    headline: m.active_count === 0
      ? 'Pre-revenue — no active paid subscriptions yet.'
      : `MRR ₹${m.mrr_rupees.toLocaleString('en-IN')} (ARR ₹${m.arr_rupees.toLocaleString('en-IN')}) across ${m.active_count} accounts; LTV:CAC ${gr.ratio == null ? 'n/a' : gr.ratio}.`,
    benchmarks: BENCHMARKS,
    generated_at: (input.now || Date.now)(),
  };
}

module.exports = {
  BENCHMARKS,
  mrr, churn, cac, ltv, goldenRatio, report,
};
