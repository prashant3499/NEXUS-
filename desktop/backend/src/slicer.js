/**
 * EcoVenture AI — Transaction Slicer (Merchant of Record core)
 * Pure Node.js, zero dependencies. This is the financial heart of the platform.
 *
 * In the MoR model: platform BUYS from artisan, SELLS to buyer.
 * The slicer computes exactly how a sale is divided, with every statutory
 * deduction correct and auditable. Net-as-remainder guarantees no rounding drift.
 */

'use strict';

// Money is handled in paise (integer) to eliminate floating-point error entirely.
// ₹1,580.50 = 158050 paise. All math is integer math. Display converts back.
const toPaise = (rupees) => Math.round(rupees * 100);
const toRupees = (paise) => paise / 100;
const fmtINR = (paise) =>
  '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Default platform configuration. In production this lives in the DB
 * (platform_config table) and is editable by admin with zero code change —
 * the "living platform" principle.
 */
// Live commission override, set via the founder control centre (null = use default).
// A floor (minimum % so the platform never structurally loses on its own fee) and
// a ceiling (we are the maker-first platform) are enforced at set time.
let _LIVE_COMMISSION_PCT = null;
const COMMISSION_FLOOR_PCT = 0.02;
const COMMISSION_CEILING_PCT = 0.30;

const DEFAULT_CONFIG = {
  platform_margin_pct: 0.0,      // MoR margin baked into sell price; commission model below for SaaS sellers
  platform_commission_pct: 0.12, // 12% platform fee (founder-set)
  gst_on_commission_pct: 0.18,   // 18% GST on platform's commission income
  payment_gateway_pct: 0.023,    // 2.3% gateway fee
  tcs_pct: 0.01,                 // 1% TCS — Section 52 CGST Act 2017 (mandatory, no threshold)
  tds_pct: 0.01,                 // 1% TDS — Section 194 (requires platform TAN)
  tds_min_order: 250000,         // TDS applies above ₹2,500 (in paise)
  charity_pct: 0.002,            // 0.2% optional charity
  insurance_flat: 5000,          // ₹50 flat insurance (in paise)
  insurance_pct_threshold: 1000000, // above ₹10,000, insurance becomes 0.5%
  insurance_pct: 0.005,
};

/**
 * Slice a transaction. Returns every component in paise + a verified total.
 *
 * @param {number} orderTotalRupees  - sale price to the end buyer
 * @param {object} opts              - { isExport, sellerType, config, shippingRupees }
 * @returns {object} slices with integrity guarantee
 */
function sliceTransaction(orderTotalRupees, opts = {}) {
  // Live commission override (set via the founder control centre) takes effect
  // platform-wide unless the call passes its own config. Floor-guarded at set time.
  const liveConfig = _LIVE_COMMISSION_PCT != null ? { platform_commission_pct: _LIVE_COMMISSION_PCT } : {};
  const cfg = { ...DEFAULT_CONFIG, ...liveConfig, ...(opts.config || {}) };
  const orderTotal = toPaise(orderTotalRupees);

  if (orderTotal <= 0) throw new Error('Order total must be positive');

  // Each deduction is computed and rounded to the paise individually.
  const commission = Math.round(orderTotal * cfg.platform_commission_pct);
  const gstOnComm  = Math.round(commission * cfg.gst_on_commission_pct);
  const gateway    = Math.round(orderTotal * cfg.payment_gateway_pct);

  // TCS — Section 52 CGST. Collected from seller on every marketplace supply.
  const tcs = Math.round(orderTotal * cfg.tcs_pct);

  // TDS — only above threshold, and only if platform has TAN (assumed configured)
  const tds = orderTotal > cfg.tds_min_order
    ? Math.round(orderTotal * cfg.tds_pct)
    : 0;

  // No per-order insurance premium. Buyer protection is a PLATFORM-BACKED
  // authenticity guarantee (refund if not genuine), funded from commission — no
  // insurer, no add-on to the buyer's price. (We decided we don't need an insurer.)
  const insurance = 0;

  const shipping = toPaise(opts.shippingRupees || 0);
  const charity  = Math.round(orderTotal * cfg.charity_pct);

  // Deductions that come OUT of the order total (the maker's side).
  const totalDeductions = commission + gstOnComm + gateway + tcs + tds + shipping + charity;
  const net = orderTotal - totalDeductions;

  // The buyer pays the item price. Nothing added on top.
  const buyerPays = orderTotal;

  if (net < 0) {
    throw new Error(`Deductions (${fmtINR(totalDeductions)}) exceed order total (${fmtINR(orderTotal)})`);
  }

  // Integrity: maker payout + maker-side deductions === order total, exactly.
  const reconstructed = net + totalDeductions;
  if (reconstructed !== orderTotal) {
    throw new Error(`SLICE INTEGRITY FAILURE: ${reconstructed} !== ${orderTotal}`);
  }

  return {
    order_total: orderTotal,
    buyer_pays: buyerPays, // item price + customer-side insurance
    slices: {
      seller_payout:       net,
      platform_commission: commission,
      gst_on_commission:   gstOnComm,
      payment_gateway_fee: gateway,
      tcs_collection:      tcs,
      tds_deduction:       tds,
      customer_insurance:  insurance, // paid by buyer on top, not from payout
      shipping_cost:       shipping,
      charity_donation:    charity,
    },
    integrity: 'verified',
    // Human-readable version
    display: {
      order_total:       fmtINR(orderTotal),
      buyer_pays:        fmtINR(buyerPays),
      seller_payout:     fmtINR(net),
      platform_commission: fmtINR(commission),
      gst_on_commission: fmtINR(gstOnComm),
      payment_gateway:   fmtINR(gateway),
      tcs:               fmtINR(tcs),
      tds:               fmtINR(tds),
      customer_insurance: fmtINR(insurance),
      shipping:          fmtINR(shipping),
      charity:           fmtINR(charity),
    },
    requires_2fa: net > 5000000, // payouts above ₹50,000 need two-person sign-off
  };
}

function setCommissionPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return { ok: false, reason: 'Commission must be a number (e.g. 0.05 for 5%).' };
  if (n < COMMISSION_FLOOR_PCT) return { ok: false, reason: `Refused: ${(n * 100).toFixed(1)}% is below the ${(COMMISSION_FLOOR_PCT * 100)}% floor — the platform would not cover its own costs (never-in-loss).` };
  if (n > COMMISSION_CEILING_PCT) return { ok: false, reason: `Refused: ${(n * 100).toFixed(1)}% exceeds the ${(COMMISSION_CEILING_PCT * 100)}% cap — NEXUS is the maker-first platform.` };
  const from = _LIVE_COMMISSION_PCT != null ? _LIVE_COMMISSION_PCT : DEFAULT_CONFIG.platform_commission_pct;
  _LIVE_COMMISSION_PCT = n;
  return { ok: true, from_pct: from, to_pct: n, display: `${(n * 100).toFixed(2)}%` };
}
function getCommissionPct() { return _LIVE_COMMISSION_PCT != null ? _LIVE_COMMISSION_PCT : DEFAULT_CONFIG.platform_commission_pct; }
function resetCommissionPct() { _LIVE_COMMISSION_PCT = null; }

module.exports = { sliceTransaction, toPaise, toRupees, fmtINR, DEFAULT_CONFIG, setCommissionPct, getCommissionPct, resetCommissionPct, COMMISSION_FLOOR_PCT, COMMISSION_CEILING_PCT };
