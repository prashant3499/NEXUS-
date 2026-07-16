'use strict';

/**
 * fraudDetection.js
 *
 * The platform moves real money to real artisans, so it is a target — for
 * stolen-card buyers, for fake sellers harvesting payouts, for account
 * takeover. This is the risk engine: it scores a transaction or an account
 * against known fraud signals and returns a verdict.
 *
 * Two principles, both deliberate:
 *   1. HUMAN-IN-THE-LOOP. High risk does NOT silently auto-block. It HOLDS the
 *      transaction for review, because a false block on a genuine artisan's
 *      first sale is its own kind of harm. Only unambiguous signals (a hard
 *      blocklist hit) block outright.
 *   2. EXPLAINABLE. Every score comes with the signals that produced it, so a
 *      human reviewer (or the founder) can see WHY — never a black-box number.
 *
 * Pure + dependency-free: the server passes in the context (recent order
 * history, device, account age) and this scores it. It decides risk; the order
 * pipeline decides what to do with the verdict.
 */

const VERDICT = Object.freeze({ ALLOW: 'allow', REVIEW: 'review', BLOCK: 'block' });

// Score thresholds. Tuned conservative — review before block.
const REVIEW_THRESHOLD = 40;
const BLOCK_THRESHOLD = 80;

// Each signal: a points weight + a human-readable reason when it fires.
const SIGNAL_WEIGHTS = Object.freeze({
  velocity_orders: 40,        // many orders in a short window from one actor
  velocity_amount: 25,        // unusually high spend velocity
  new_account_high_value: 20, // brand-new account + large first order
  address_device_mismatch: 20,// many shipping addresses from one device
  payment_retry: 25,          // repeated failed payments then a success
  geo_mismatch: 15,           // billing/shipping/IP countries disagree
  disposable_contact: 15,     // throwaway email / invalid phone shape
  blocklist_hit: 100,         // known-bad actor → hard block
});

function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * scoreTransaction — risk-score a single order in context.
 * @param {object} order   { amount_paise, buyer_id, device_id, ship_country, bill_country, ip_country, contact }
 * @param {object} ctx
 *   - recentOrders   [{ at, amount_paise, buyer_id }]   last orders by this buyer/device
 *   - accountAgeDays number
 *   - failedPayments number   recent failed attempts before this
 *   - deviceAddresses number  distinct ship addresses seen from this device
 *   - blocklist      Set/array of blocked buyer_ids / devices
 *   - now            timestamp
 * @returns { score, verdict, signals[], recommendation }
 */
function scoreTransaction(order = {}, ctx = {}) {
  const now = ctx.now || Date.now();
  const signals = [];
  let score = 0;
  const add = (key, reason) => { score += SIGNAL_WEIGHTS[key]; signals.push({ signal: key, weight: SIGNAL_WEIGHTS[key], reason }); };

  // Hard blocklist — unambiguous, blocks outright.
  const bl = ctx.blocklist instanceof Set ? ctx.blocklist : new Set(ctx.blocklist || []);
  if (bl.has(order.buyer_id) || bl.has(order.device_id)) {
    add('blocklist_hit', 'Buyer or device is on the blocklist.');
  }

  // Order velocity — >3 orders in the last hour from this actor.
  const recent = (ctx.recentOrders || []).filter((o) => now - (o.at || 0) < 3600 * 1000);
  if (recent.length >= 3) add('velocity_orders', `${recent.length} orders in the last hour.`);

  // Amount velocity — total in the last hour far exceeds a normal basket.
  const hourSpend = recent.reduce((a, o) => a + (o.amount_paise || 0), 0) + (order.amount_paise || 0);
  if (hourSpend > 5000000) add('velocity_amount', `\u20b9${Math.round(hourSpend / 100).toLocaleString('en-IN')} attempted in the last hour.`);

  // New account + high-value first order.
  if ((ctx.accountAgeDays != null && ctx.accountAgeDays < 1) && (order.amount_paise || 0) > 2000000) {
    add('new_account_high_value', 'New account placing a high-value order.');
  }

  // One device, many shipping addresses.
  if ((ctx.deviceAddresses || 0) >= 4) add('address_device_mismatch', `${ctx.deviceAddresses} shipping addresses from one device.`);

  // Repeated failed payments before this attempt (card testing).
  if ((ctx.failedPayments || 0) >= 3) add('payment_retry', `${ctx.failedPayments} failed payment attempts before this.`);

  // Geography disagreement across billing / shipping / IP.
  const geos = [order.ship_country, order.bill_country, order.ip_country].filter(Boolean);
  if (geos.length >= 2 && new Set(geos).size > 1) add('geo_mismatch', 'Billing, shipping, and IP countries disagree.');

  // Disposable / malformed contact.
  if (order.contact && _looksDisposable(order.contact)) add('disposable_contact', 'Throwaway or malformed contact details.');

  score = _clamp(score, 0, 100);
  let verdict = VERDICT.ALLOW;
  if (bl.has(order.buyer_id) || bl.has(order.device_id) || score >= BLOCK_THRESHOLD) verdict = VERDICT.BLOCK;
  else if (score >= REVIEW_THRESHOLD) verdict = VERDICT.REVIEW;

  return {
    score, verdict, signals,
    recommendation: verdict === VERDICT.BLOCK
      ? 'Block this transaction — strong fraud signals or a blocklist hit.'
      : verdict === VERDICT.REVIEW
        ? 'Hold for human review before settlement — do not auto-reject a possibly-genuine buyer.'
        : 'Allow — no significant risk signals.',
  };
}

function _looksDisposable(contact) {
  const s = String(contact).toLowerCase();
  if (/@(mailinator|guerrillamail|10minutemail|tempmail|trashmail)\./.test(s)) return true;
  // a phone-like contact that isn't a plausible length
  const digits = s.replace(/\D/g, '');
  if (/^\+?\d+$/.test(s.replace(/[\s-]/g, '')) && (digits.length < 8 || digits.length > 15)) return true;
  return false;
}

/**
 * scoreAccount — risk-score a seller/buyer account itself (onboarding-time or
 * periodic). Catches payout-harvesting seller fraud.
 * @returns { score, verdict, signals[] }
 */
function scoreAccount(account = {}, ctx = {}) {
  const signals = [];
  let score = 0;
  const add = (key, w, reason) => { score += w; signals.push({ signal: key, weight: w, reason }); };

  if (account.payoutAccount && ctx.sharedPayoutCount && ctx.sharedPayoutCount > 1) {
    add('shared_payout', 35, `Payout bank account shared by ${ctx.sharedPayoutCount} sellers.`);
  }
  if (ctx.sameDeviceSellers && ctx.sameDeviceSellers >= 3) {
    add('device_cluster', 30, `${ctx.sameDeviceSellers} seller accounts from one device.`);
  }
  if (account.idVerified === false) add('unverified_id', 20, 'Identity not yet verified.');
  if (ctx.rapidListings && ctx.rapidListings > 20) add('listing_flood', 20, 'Unusually many listings created very fast.');

  score = _clamp(score, 0, 100);
  const verdict = score >= BLOCK_THRESHOLD ? VERDICT.BLOCK : score >= REVIEW_THRESHOLD ? VERDICT.REVIEW : VERDICT.ALLOW;
  return { score, verdict, signals };
}

module.exports = {
  VERDICT, REVIEW_THRESHOLD, BLOCK_THRESHOLD, SIGNAL_WEIGHTS,
  scoreTransaction, scoreAccount,
};
