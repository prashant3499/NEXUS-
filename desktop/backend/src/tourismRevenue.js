'use strict';

/**
 * tourismRevenue.js
 *
 * Turns the tourism vertical from a safety-gated booking feature into a real
 * revenue engine. Craft commerce and tourism have different economics: tourism
 * is perishable inventory (an empty room tonight is lost forever), seasonal,
 * and sells best as packages. This module adds the three levers that drive
 * tourism revenue:
 *
 *   1. YIELD — price by season + lead time + occupancy (fill the off-season,
 *      capture the peak), never below a floor.
 *   2. PACKAGING — bundle stay + workshop + transport for a price that beats
 *      buying separately for the traveller yet raises total revenue + basket.
 *   3. COMMISSION — the platform's agent commission on the booking.
 *
 * All pure functions over rupees-in-paise. The safety gate (tourism.js) still
 * governs whether a booking may proceed; this governs what it earns.
 */

// India tourism seasons by month (1=Jan…12=Dec). Most heritage/craft circuits
// peak Oct–Mar (cool, dry), shoulder in Apr & Sep, off during the monsoon.
const SEASON = Object.freeze({ PEAK: 'peak', SHOULDER: 'shoulder', OFF: 'off' });
const MONTH_SEASON = Object.freeze({
  1: SEASON.PEAK, 2: SEASON.PEAK, 3: SEASON.PEAK,
  4: SEASON.SHOULDER, 5: SEASON.OFF, 6: SEASON.OFF,
  7: SEASON.OFF, 8: SEASON.OFF, 9: SEASON.SHOULDER,
  10: SEASON.PEAK, 11: SEASON.PEAK, 12: SEASON.PEAK,
});
const SEASON_MULTIPLIER = Object.freeze({ peak: 1.35, shoulder: 1.0, off: 0.75 });

// Don't sell below this fraction of base even in deep off-season (protects the
// operator + the platform from a race to the bottom).
const PRICE_FLOOR_FRACTION = 0.6;

const r = (n) => Math.round(n);

/** The season for a month (1–12). */
function seasonForMonth(month) {
  return MONTH_SEASON[month] || SEASON.SHOULDER;
}

/**
 * priceExperience — dynamic yield price for one experience/stay.
 * @param {number} basePaise   the operator's list price
 * @param {object} ctx
 *   - month        1–12 (default: current)
 *   - leadTimeDays days until the experience (last-minute → discount to fill;
 *                  far-out early-bird → small discount to lock demand)
 *   - occupancyPct 0–100 current occupancy (high → price up; low → price down)
 * @returns { price_paise, season, multiplier, floor_paise, breakdown }
 */
function priceExperience(basePaise, ctx = {}) {
  const month = ctx.month || (new Date().getMonth() + 1);
  const season = seasonForMonth(month);
  let mult = SEASON_MULTIPLIER[season];

  // Lead-time: last-minute (<3 days) fills perishable inventory at a discount;
  // very early (>60 days) gets a small early-bird to lock it in.
  let leadAdj = 1;
  if (ctx.leadTimeDays != null) {
    if (ctx.leadTimeDays < 3) leadAdj = 0.9;
    else if (ctx.leadTimeDays > 60) leadAdj = 0.95;
  }

  // Occupancy: scarcity pricing. >80% full → +10%; <30% → -10%.
  let occAdj = 1;
  if (ctx.occupancyPct != null) {
    if (ctx.occupancyPct > 80) occAdj = 1.1;
    else if (ctx.occupancyPct < 30) occAdj = 0.9;
  }

  const raw = basePaise * mult * leadAdj * occAdj;
  const floor = basePaise * PRICE_FLOOR_FRACTION;
  const price = Math.max(raw, floor);
  return {
    price_paise: r(price),
    season,
    multiplier: Math.round(mult * leadAdj * occAdj * 100) / 100,
    floor_paise: r(floor),
    floored: raw < floor,
    breakdown: { season_mult: mult, lead_adj: leadAdj, occupancy_adj: occAdj },
  };
}

/**
 * buildPackage — bundle components (stay, workshop, transport, guide…) into
 * one sellable package. The traveller gets a discount vs buying separately,
 * but because packages lift attach-rate + basket size, total revenue rises.
 * @param {object[]} components — [{ label, price_paise }]
 * @param {number} [bundleDiscountPct=10]
 * @returns { components, list_total_paise, package_price_paise, traveller_saving_paise, discount_pct }
 */
function buildPackage(components = [], bundleDiscountPct = 10) {
  const listTotal = components.reduce((s, c) => s + (c.price_paise || 0), 0);
  const disc = Math.min(Math.max(bundleDiscountPct, 0), 40) / 100;
  const pkg = r(listTotal * (1 - disc));
  return {
    components,
    component_count: components.length,
    list_total_paise: listTotal,
    package_price_paise: pkg,
    traveller_saving_paise: listTotal - pkg,
    discount_pct: Math.round(disc * 100),
  };
}

// Platform agent commission on a tourism booking, by operator tier. Tourism
// commissions are higher than goods (the platform does demand-gen + trust).
const BOOKING_COMMISSION_PCT = Object.freeze({ default: 0.12, hotel: 0.15, homestay: 0.18, experience: 0.20, event: 0.10, transport: 0.08 });

/**
 * bookingCommission — the platform's earn on a booking. Never erodes the
 * operator below their floor (never-in-loss applies to them too).
 */
function bookingCommission(bookingPaise, kind = 'default') {
  const pct = BOOKING_COMMISSION_PCT[kind] != null ? BOOKING_COMMISSION_PCT[kind] : BOOKING_COMMISSION_PCT.default;
  const commission = r(bookingPaise * pct);
  return {
    booking_paise: bookingPaise,
    commission_pct: Math.round(pct * 100),
    commission_paise: commission,
    operator_payout_paise: bookingPaise - commission,
    kind,
  };
}

/**
 * revenueProjection — project tourism platform revenue over a set of expected
 * bookings across months. Each booking: { basePaise, month, kind, occupancyPct }.
 * Applies yield pricing then commission. Honest: it's a projection from inputs.
 */
function revenueProjection(bookings = []) {
  let gmv = 0, commission = 0, operatorPayout = 0;
  const bySeason = { peak: 0, shoulder: 0, off: 0 };
  for (const b of bookings) {
    const priced = priceExperience(b.basePaise || 0, { month: b.month, occupancyPct: b.occupancyPct, leadTimeDays: b.leadTimeDays });
    const comm = bookingCommission(priced.price_paise, b.kind);
    gmv += priced.price_paise;
    commission += comm.commission_paise;
    operatorPayout += comm.operator_payout_paise;
    bySeason[priced.season] += priced.price_paise;
  }
  return {
    bookings: bookings.length,
    gmv_paise: gmv,
    platform_revenue_paise: commission,
    operator_payout_paise: operatorPayout,
    gmv_rupees: r(gmv / 100),
    platform_revenue_rupees: r(commission / 100),
    by_season_gmv_paise: bySeason,
  };
}

module.exports = {
  SEASON, MONTH_SEASON, SEASON_MULTIPLIER, PRICE_FLOOR_FRACTION, BOOKING_COMMISSION_PCT,
  seasonForMonth, priceExperience, buildPackage, bookingCommission, revenueProjection,
};
