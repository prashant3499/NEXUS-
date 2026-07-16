'use strict';

/**
 * reviews.js
 *
 * The missing buyer-trust signal. A marketplace where buyers can't see what
 * other buyers experienced is asking for blind faith. This adds reviews +
 * ratings — but with a rule that makes them trustworthy:
 *
 *   ONLY A VERIFIED PURCHASER CAN REVIEW.
 *
 * A review must reference a real, delivered order by this buyer for this
 * product. That kills fake reviews (paid 5-stars, competitor 1-stars) at the
 * root — the same verified-real philosophy the rest of the platform runs on.
 *
 * Ratings roll up into a maker reputation score that can travel onto ONDC, so a
 * maker's earned trust becomes portable — a real moat.
 *
 * Pure + dependency-free.
 */

const MIN_RATING = 1, MAX_RATING = 5;

/**
 * createReview — record a review. Requires proof of a delivered purchase.
 * @param {object} input { product_id, seller_id, buyer_id, rating, text, order }
 *   order: { buyer_id, items:[{product_id}], status } — the buyer's own order
 * @returns { ok, review } | { ok:false, reason }
 */
function createReview(input = {}, now = Date.now()) {
  const { product_id, rating, order } = input;
  if (!product_id) return { ok: false, reason: 'product_id required' };
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    return { ok: false, reason: `rating must be an integer ${MIN_RATING}\u2013${MAX_RATING}` };
  }
  // VERIFIED-PURCHASE GATE: the buyer must have a delivered order for this product.
  if (!order || order.buyer_id !== input.buyer_id) {
    return { ok: false, reason: 'A review requires the buyer\u2019s own order — verified purchasers only.' };
  }
  const boughtThis = Array.isArray(order.items) && order.items.some((it) => it.product_id === product_id);
  if (!boughtThis) return { ok: false, reason: 'This order does not include the product being reviewed.' };
  if (order.status !== 'delivered' && order.status !== 'settled') {
    return { ok: false, reason: 'You can review once the order is delivered.' };
  }
  const text = (input.text || '').toString().slice(0, 2000);
  return {
    ok: true,
    review: {
      id: 'rev_' + now + '_' + Math.random().toString(36).slice(2, 7),
      product_id, seller_id: input.seller_id, buyer_id: input.buyer_id,
      rating, text, verified_purchase: true, order_id: order.id || null,
      created_at: now,
    },
  };
}

/**
 * productRating — aggregate a product's reviews into a score.
 */
function productRating(reviews = []) {
  const valid = reviews.filter((r) => r.rating >= MIN_RATING && r.rating <= MAX_RATING);
  if (!valid.length) return { count: 0, average: null, distribution: {} };
  const sum = valid.reduce((s, r) => s + r.rating, 0);
  const distribution = {};
  for (let i = MIN_RATING; i <= MAX_RATING; i++) distribution[i] = valid.filter((r) => r.rating === i).length;
  return { count: valid.length, average: Math.round((sum / valid.length) * 10) / 10, distribution };
}

/**
 * makerReputation — roll a seller's reviews into a reputation score (0\u2013100),
 * weighted by volume so one 5-star doesn't equal a hundred. Portable to ONDC.
 */
function makerReputation(reviews = []) {
  const r = productRating(reviews);
  if (!r.count) return { score: null, count: 0, tier: 'new', note: 'No verified reviews yet.' };
  // Bayesian-ish: pull toward a neutral 3.5 prior until volume builds.
  const prior = 3.5, priorWeight = 10;
  const adjusted = ((r.average * r.count) + (prior * priorWeight)) / (r.count + priorWeight);
  const score = Math.round((adjusted / MAX_RATING) * 100);
  const tier = score >= 85 ? 'excellent' : score >= 70 ? 'trusted' : score >= 55 ? 'established' : 'building';
  return { score, count: r.count, average: r.average, tier, portable_to_ondc: true };
}

module.exports = { MIN_RATING, MAX_RATING, createReview, productRating, makerReputation };
