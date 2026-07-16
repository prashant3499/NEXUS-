'use strict';

/**
 * sellerAds.js
 *
 * Sellers get the SAME ad-generation capability the platform uses for its own
 * marketing — they design ads for their products and their own maker story,
 * right from the platform. The cost is INCLUDED in their subscription, not a
 * surcharge.
 *
 * The catch that protects the platform: a monthly QUOTA per tier. Ad generation
 * costs real AI inference; unbounded "free" generation would be an open-ended
 * cost and therefore a risk. The quota bounds it, so this feature can NEVER put
 * the platform in loss — the per-seller inference cost of their ads stays well
 * under the margin their subscription already earns. That is the whole point:
 * generous to the seller, zero risk to the platform.
 *
 * This module is the quota + entitlement layer; the actual creative is produced
 * by the shared adGeneration engine (the platform's own), injected in, so a
 * seller's ad and the platform's ad come from one code path.
 *
 * Pure + dependency-free.
 */

// Monthly included ad-generation quota by tier. Higher tiers pay more, so they
// get more — but every number is bounded (never-in-loss).
const AD_QUOTA_BY_TIER = Object.freeze({
  karigar: 8,     // ₹499/mo plan
  pravasi: 15,    // ₹1,999/mo
  vyapari: 30,    // ₹2,499/mo
  niryatak: 80,   // ₹7,999/mo
  sansthan: 50,   // cooperative umbrella
});

// What a seller can advertise: their products, AND themselves (maker story).
const AD_SUBJECT = Object.freeze({ PRODUCT: 'product', MAKER: 'maker' });

// Inference cost per generated ad (paise) — used to prove the quota is safe.
const COST_PER_AD_PAISE = 56;

/**
 * quotaFor — the monthly entitlement for a tier.
 */
function quotaFor(tier) {
  return AD_QUOTA_BY_TIER[tier] != null ? AD_QUOTA_BY_TIER[tier] : 0;
}

/**
 * quotaStatus — where a seller stands this month.
 * @param {string} tier
 * @param {number} usedThisMonth
 * @returns { tier, quota, used, remaining, exhausted }
 */
function quotaStatus(tier, usedThisMonth = 0) {
  const quota = quotaFor(tier);
  const used = Math.max(0, usedThisMonth);
  const remaining = Math.max(0, quota - used);
  return { tier, quota, used, remaining, exhausted: remaining <= 0 };
}

/**
 * costExposure — the platform's maximum monthly inference cost if a seller uses
 * their ENTIRE quota. Used to confirm the feature is never-in-loss against the
 * subscription margin.
 */
function costExposure(tier) {
  return { tier, max_ads: quotaFor(tier), max_cost_paise: quotaFor(tier) * COST_PER_AD_PAISE };
}

/**
 * generateSellerAd — produce an ad for a seller, enforcing the quota. The
 * actual creative comes from the shared platform ad engine (`engine`), so the
 * seller gets exactly what the platform makes for itself.
 *
 * @param {object} args
 *   - seller        { id, archetype, name, cluster }
 *   - subject       'product' | 'maker'
 *   - product       { title, vertical, price_paise, gi_tag, ... } (for product ads)
 *   - channel, tone
 *   - usedThisMonth number
 * @param {object} engine  the adGeneration module (injected)
 * @returns { ok, ad?, quota, reason? }
 */
function generateSellerAd(args = {}, engine) {
  const { seller = {}, subject = AD_SUBJECT.PRODUCT, product, channel = 'instagram', tone = 'artisan_story', usedThisMonth = 0 } = args;
  const tier = seller.archetype;
  const status = quotaStatus(tier, usedThisMonth);

  // QUOTA GATE — the never-in-loss control.
  if (status.exhausted) {
    return {
      ok: false, quota: status,
      reason: `You've used all ${status.quota} ad designs included in your plan this month. Your quota resets next month, or upgrade your plan for more.`,
    };
  }
  if (status.quota === 0) {
    return { ok: false, quota: status, reason: 'Your plan does not include ad generation. Upgrade to design ads from the platform.' };
  }

  if (!engine || typeof engine.generateAdCreative !== 'function') {
    return { ok: false, quota: status, reason: 'Ad engine unavailable.' };
  }

  // Build the ad subject. For a MAKER ad, the "product" is the maker's story.
  let adProduct;
  if (subject === AD_SUBJECT.MAKER) {
    adProduct = {
      title: `${seller.name || 'This artisan'} — ${seller.cluster || 'India'}`,
      vertical: product && product.vertical,
      maker: seller.name, cluster: seller.cluster,
      description: `Meet the maker: ${seller.name || 'a verified artisan'} from ${seller.cluster || 'India'}.`,
    };
  } else {
    if (!product || !product.title) return { ok: false, quota: status, reason: 'A product with a title is required for a product ad.' };
    adProduct = product;
  }

  let creative;
  try {
    creative = engine.generateAdCreative({ product: adProduct, channel, audience: 'general', tone });
  } catch (e) {
    return { ok: false, quota: status, reason: e.message };
  }

  const newUsed = status.used + 1;
  return {
    ok: true,
    ad: { subject, channel, tone, creative },
    quota: quotaStatus(tier, newUsed),     // reflects this generation
    included_in_subscription: true,
  };
}

module.exports = {
  AD_QUOTA_BY_TIER, AD_SUBJECT, COST_PER_AD_PAISE,
  quotaFor, quotaStatus, costExposure, generateSellerAd,
};
