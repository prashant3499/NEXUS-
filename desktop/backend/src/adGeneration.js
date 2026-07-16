/**
 * NEXUS — Ad Generation, with Margin Guarantee.
 *
 * The platform generates and runs advertisements on behalf of each seller.
 * The ad cost is INCLUDED in the seller's monthly subscription fee, not
 * billed separately. This module exists to make that promise sustainable:
 * we must always retain a positive platform margin after paying for the
 * ads we ran on the seller's behalf.
 *
 * Architecture:
 *   1) Each tier (Karigar / Vyapari / Pravasi / Niryatak / Sansthan) has
 *      a baked-in monthly ad budget — a slice of the subscription fee
 *      reserved for that seller's advertising spend.
 *   2) The platform generates ad creative for the seller's products on
 *      WhatsApp, Facebook, Google Shopping, Instagram, etc.
 *   3) Every rupee spent on a seller's behalf is logged to the cost ledger
 *      with that seller's ref, so per-seller economics stay honest.
 *   4) Before launching a campaign, guardedAdSpend() verifies the planned
 *      spend won't drop platform margin below the configured floor (default
 *      30%). Over-budget spends require founder approval (HITL).
 *
 * VISIBILITY:
 *   - Sellers see WHICH ads ran, on which channel, with what reach.
 *   - Sellers do NOT see the platform's margin math.
 *   - Founder sees both. The role check is enforced by the caller.
 *
 * This module is pure logic. Creative-generation prompts are emitted as
 * structured objects ready to send to an LLM in production; tests don't
 * call the LLM. The same pattern as bhashini.js / globalTranslate.js.
 */

'use strict';

const UE = require('./unitEconomics');

// ────────────────────────────────────────────────────────────
// IN-SUBSCRIPTION AD BUDGET PER TIER
// What fraction of each tier's monthly sub is reserved for ads.
// Numbers tuned so post-ad platform margin stays ≥30% (verified by tests).
// ────────────────────────────────────────────────────────────

const TIER_AD_BUDGETS = {
  karigar:  { allocationPct: 0.10, monthlyBudgetPaise:  4990 }, // ₹49.90/mo of ₹499
  vyapari:  { allocationPct: 0.15, monthlyBudgetPaise: 37485 }, // ₹374.85/mo of ₹2,499
  pravasi:  { allocationPct: 0.12, monthlyBudgetPaise: 23988 }, // ₹239.88/mo of ₹1,999
  niryatak: { allocationPct: 0.18, monthlyBudgetPaise:143982 }, // ₹1,439.82/mo of ₹7,999
  sansthan: { allocationPct: 0.20, monthlyBudgetPaise: null  }, // Custom — quoted per contract
};

// ────────────────────────────────────────────────────────────
// CHANNEL ECONOMICS — average cost-per-thousand-impressions in India, 2025-2026
// These are realistic baselines, not fictional. They feed budget planning.
// ────────────────────────────────────────────────────────────

const CHANNEL_ECONOMICS = {
  whatsapp:  { cpmPaise:  8000, reachPerRupee:  12, label: 'WhatsApp Business broadcast',
               strength: 'High open rate (98%), low cost, direct',
               weakness: '24-hour message window, opt-in required' },
  facebook:  { cpmPaise: 15000, reachPerRupee:   6, label: 'Facebook Ads',
               strength: 'Granular targeting, broad demographics',
               weakness: 'Declining organic, rising costs' },
  google:    { cpmPaise: 22000, reachPerRupee:   4, label: 'Google Shopping + Search',
               strength: 'High intent buyers, top-of-funnel',
               weakness: 'Expensive for high-competition keywords' },
  instagram: { cpmPaise: 14000, reachPerRupee:   7, label: 'Instagram Reels + Stories',
               strength: 'Strong for visual products, younger buyers',
               weakness: 'Lower conversion than Google' },
  youtube:   { cpmPaise: 12000, reachPerRupee:   8, label: 'YouTube Shorts + Display',
               strength: 'Storytelling, artisan video content',
               weakness: 'Longer production cycle' },
  pinterest: { cpmPaise:  9000, reachPerRupee:  10, label: 'Pinterest Promoted Pins',
               strength: 'Discovery for home/decor/craft, evergreen',
               weakness: 'Smaller Indian audience' },
};

// ────────────────────────────────────────────────────────────
// AD CREATIVE GENERATION
// Produces a structured prompt + creative skeleton. In production, the
// {prompt} field is sent to an LLM (Claude/etc.) which returns final copy.
// Tests don't call the LLM — they verify the structure and the prompt
// contains the right context.
// ────────────────────────────────────────────────────────────

const TONE_PRESETS = {
  artisan_story:  'warm, first-person, emphasises craft tradition and the maker',
  premium:        'refined, restrained, focuses on heritage and quality',
  festive:        'celebratory, references the occasion, action-oriented',
  educational:    'informative, explains the GI tag or craft technique',
  urgent:         'limited-time framing, scarcity, clear deadline',
};

const CHARACTER_LIMITS = {
  whatsapp:  { headline: 60,  body: 1024, cta: 24 },
  facebook:  { headline: 40,  body:  125, cta: 20 },
  google:    { headline: 30,  body:   90, cta: 15 },
  instagram: { headline: 50,  body: 2200, cta: 20 },
  youtube:   { headline: 100, body:  500, cta: 20 },
  pinterest: { headline: 100, body:  500, cta: 20 },
};

/**
 * Generate ad creative for a single product on a single channel.
 * Returns a structured object: headline+body+cta+image_prompt, plus the
 * LLM prompt used to generate them. In production the prompt goes to an
 * LLM. In tests we verify shape.
 */
function generateAdCreative({ product, channel, audience = 'general', tone = 'artisan_story' } = {}) {
  if (!product || !product.title) {
    throw new Error('product with at least { title } is required');
  }
  if (!CHANNEL_ECONOMICS[channel]) {
    throw new Error(`Unknown channel: ${channel}`);
  }
  if (!TONE_PRESETS[tone]) {
    throw new Error(`Unknown tone: ${tone}. Use one of ${Object.keys(TONE_PRESETS).join(', ')}.`);
  }

  const limits = CHARACTER_LIMITS[channel];
  const channelLabel = CHANNEL_ECONOMICS[channel].label;
  const toneDesc = TONE_PRESETS[tone];

  // Prompt to send to the LLM. The LLM returns headline / body / cta / image_prompt.
  // Tests don't run this — they verify the prompt contains the right context.
  const prompt = `You write advertising copy for NEXUS, a verified-real Indian craft commerce platform.
Product: ${product.title}
${product.artisan ? `Artisan: ${product.artisan}` : ''}
${product.region ? `Region: ${product.region}` : ''}
${product.craft ? `Craft technique: ${product.craft}` : ''}
${product.gi ? `GI tag: ${product.gi}` : ''}
${product.vertical ? `Vertical: ${product.vertical}` : ''}

Channel: ${channelLabel}
Target audience: ${audience}
Tone: ${toneDesc}

Constraints:
- Headline ≤ ${limits.headline} characters
- Body ≤ ${limits.body} characters
- CTA ≤ ${limits.cta} characters
- Must not make unverifiable claims
- Must not promise tax savings, health benefits, or guaranteed outcomes
- If GI tag is present, mention it factually (e.g. "GI-registered")
- Do NOT invent prices, sales, or discounts not provided

Return JSON exactly:
{ "headline": "...", "body": "...", "cta": "...", "image_prompt": "..." }`;

  return {
    channel,
    channel_label: channelLabel,
    tone,
    audience,
    product_ref: product.id || product.title,
    char_limits: limits,
    prompt,
    // Placeholder creative — production fills these from the LLM response.
    // Tests check that .prompt is well-formed; production validates the
    // LLM JSON output against char_limits before logging.
    creative: { headline: null, body: null, cta: null, image_prompt: null },
    generated_at: Date.now(),
  };
}

// ────────────────────────────────────────────────────────────
// CAMPAIGN COSTING — translate a budget into reach estimate
// ────────────────────────────────────────────────────────────

/**
 * Estimate reach + cost components for a planned ad spend on a channel.
 * Returns reach, cost-per-thousand-impressions (CPM), and the LLM creative
 * generation cost we incur per campaign.
 */
function estimateCampaignReach({ channel, budgetPaise, creativeCostPaise = 200 } = {}) {
  const ch = CHANNEL_ECONOMICS[channel];
  if (!ch) throw new Error(`Unknown channel: ${channel}`);
  if (!budgetPaise || budgetPaise <= 0) throw new Error('budgetPaise must be positive');

  const spendablePaise = Math.max(0, budgetPaise - creativeCostPaise);
  const estimatedReach = Math.floor(spendablePaise * ch.reachPerRupee / 100); // paise → rupees → reach
  const impressions    = estimatedReach;
  const cpmActual      = impressions > 0 ? Math.round((spendablePaise / impressions) * 1000) : 0;

  return {
    channel,
    channel_label: ch.label,
    budgetPaise,
    spendablePaise,
    creativeCostPaise,
    estimatedReach,
    impressions,
    cpmActualPaise: cpmActual,
    cpmBenchmarkPaise: ch.cpmPaise,
  };
}

// ────────────────────────────────────────────────────────────
// COST ATTRIBUTION — log ad spend to the seller's ledger entry
// ────────────────────────────────────────────────────────────

/**
 * Log a campaign spend against the seller. Uses the cost ledger from
 * unitEconomics.js, with category 'acquisition' and ref = sellerId so
 * costPerCustomer(sellerId) sums correctly.
 */
function attributeAdCost(ledger, { sellerId, channel, amountPaise, campaignId = null, at = Date.now() } = {}) {
  if (!ledger || typeof ledger.logCost !== 'function') {
    throw new Error('ledger must be a unitEconomics ledger instance');
  }
  if (!sellerId) throw new Error('sellerId required');
  if (!CHANNEL_ECONOMICS[channel]) throw new Error(`Unknown channel: ${channel}`);
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer');
  }
  return ledger.logCost({
    category: UE.CATEGORIES.ACQUISITION,
    amountPaise,
    ref: sellerId,
    at,
    meta: { channel, campaignId, source: 'adGeneration' },
  });
}

// ────────────────────────────────────────────────────────────
// SELLER MARGIN AFTER ADS — the heart of the margin-guarantee
// ────────────────────────────────────────────────────────────

/**
 * Compute platform margin for a single seller after subtracting the ad
 * spend we incurred on their behalf, given their tier and GMV.
 *
 * This is the math that lets us promise "ads included in subscription"
 * without losing money on any individual seller.
 */
function sellerMarginAfterAds({ tier, gmvPaise, adSpendPaise }) {
  const baseline = UE.tierProfit(tier, gmvPaise !== undefined ? { gmvPaise } : {});
  const adjustedCost = baseline.costPaise + (adSpendPaise || 0);
  const adjustedMargin = baseline.revenuePaise - adjustedCost;
  const adjustedMarginPct = baseline.revenuePaise > 0
    ? Math.round((adjustedMargin / baseline.revenuePaise) * 1000) / 10 : 0;
  return {
    tier,
    revenuePaise: baseline.revenuePaise,
    baselineCostPaise: baseline.costPaise,
    adSpendPaise: adSpendPaise || 0,
    adjustedCostPaise: adjustedCost,
    adjustedMarginPaise: adjustedMargin,
    adjustedMarginPct,
    healthy: adjustedMargin > 0 && adjustedMarginPct >= 30,
  };
}

// ────────────────────────────────────────────────────────────
// GUARDED AD SPEND — the HITL gate
// ────────────────────────────────────────────────────────────

const DEFAULT_GUARD = {
  marginFloorPct: 30,        // never let post-ad margin drop below 30%
  hitlAboveBudgetPct: 1.0,   // spending > 100% of in-sub budget = HITL
  hardCapMultiplier: 2.0,    // spending > 200% of in-sub budget = REJECTED
};

/**
 * Decide whether a planned ad spend is allowed for this seller, given:
 *   - their tier (determines in-sub budget + assumed revenue)
 *   - their GMV (determines true revenue from commission)
 *   - the planned spend (the proposed campaign budget)
 *   - the margin floor (default 30%)
 *
 * Returns { approved, reason, requiresHITL, marginAfter }.
 *
 *   approved=true,  requiresHITL=false  → auto-launch
 *   approved=true,  requiresHITL=true   → launch only after founder OK
 *   approved=false                       → reject with reason
 */
function guardedAdSpend({ sellerId, tier, gmvPaise, plannedSpendPaise, alreadySpentPaise = 0, opts = {} } = {}) {
  const cfg = { ...DEFAULT_GUARD, ...opts };
  const tierBudget = TIER_AD_BUDGETS[tier];
  if (!tierBudget) {
    return { approved: false, requiresHITL: false, reason: `Unknown tier: ${tier}`, marginAfter: null };
  }
  if (!Number.isInteger(plannedSpendPaise) || plannedSpendPaise <= 0) {
    return { approved: false, requiresHITL: false, reason: 'plannedSpendPaise must be positive integer', marginAfter: null };
  }
  if (alreadySpentPaise < 0 || !Number.isInteger(alreadySpentPaise)) {
    return { approved: false, requiresHITL: false, reason: 'alreadySpentPaise must be non-negative integer', marginAfter: null };
  }

  const totalSpend = alreadySpentPaise + plannedSpendPaise;
  const inSubBudget = tierBudget.monthlyBudgetPaise; // null for sansthan
  const margin = sellerMarginAfterAds({ tier, gmvPaise, adSpendPaise: totalSpend });

  // 1. Margin floor check
  if (margin.adjustedMarginPaise < 0) {
    return {
      approved: false, requiresHITL: false,
      reason: `Total spend ₹${(totalSpend/100).toLocaleString('en-IN')} would make this seller unprofitable (margin ₹${(margin.adjustedMarginPaise/100).toLocaleString('en-IN')})`,
      marginAfter: margin,
    };
  }
  if (margin.adjustedMarginPct < cfg.marginFloorPct) {
    // Below floor but still positive → founder approval required
    return {
      approved: true, requiresHITL: true,
      reason: `Margin would fall to ${margin.adjustedMarginPct}% (floor ${cfg.marginFloorPct}%) — founder approval required`,
      marginAfter: margin,
    };
  }

  // 2. In-subscription budget check (Sansthan exempted — custom contract)
  if (inSubBudget !== null) {
    if (totalSpend > inSubBudget * cfg.hardCapMultiplier) {
      return {
        approved: false, requiresHITL: false,
        reason: `Total spend ₹${(totalSpend/100).toLocaleString('en-IN')} exceeds ${(cfg.hardCapMultiplier*100).toFixed(0)}% of in-subscription budget ₹${(inSubBudget/100).toLocaleString('en-IN')}`,
        marginAfter: margin,
      };
    }
    if (totalSpend > inSubBudget * cfg.hitlAboveBudgetPct) {
      return {
        approved: true, requiresHITL: true,
        reason: `Total spend ₹${(totalSpend/100).toLocaleString('en-IN')} exceeds in-subscription budget ₹${(inSubBudget/100).toLocaleString('en-IN')} — founder approval required`,
        marginAfter: margin,
      };
    }
  }

  return {
    approved: true, requiresHITL: false,
    reason: `Within in-subscription budget and margin (${margin.adjustedMarginPct}%) above floor`,
    marginAfter: margin,
  };
}

// ────────────────────────────────────────────────────────────
// COHORT-LEVEL: ranked cohort of sellers, their margin headroom, who to push
// ────────────────────────────────────────────────────────────

/**
 * For a list of sellers (each {id, tier, gmvPaise, alreadySpentPaise}), return
 * who has the most headroom under their margin floor — i.e., where we have
 * room to spend more on ads without breaking the guarantee. Founder uses this
 * to decide which sellers to push harder.
 */
function rankAdHeadroom(sellers, opts = {}) {
  const cfg = { ...DEFAULT_GUARD, ...opts };
  return sellers
    .map(s => {
      const tierBudget = TIER_AD_BUDGETS[s.tier];
      if (!tierBudget) return null;
      const margin = sellerMarginAfterAds({ tier: s.tier, gmvPaise: s.gmvPaise, adSpendPaise: s.alreadySpentPaise || 0 });
      const inSubBudget = tierBudget.monthlyBudgetPaise; // may be null
      const remainingBudget = inSubBudget === null ? null : Math.max(0, inSubBudget - (s.alreadySpentPaise || 0));
      // Headroom: paise we could spend before hitting margin floor
      const minRevenueAtFloor = margin.revenuePaise * (cfg.marginFloorPct / 100);
      const maxTotalCost = margin.revenuePaise - minRevenueAtFloor;
      const headroomBeforeFloor = Math.max(0, maxTotalCost - margin.baselineCostPaise - (s.alreadySpentPaise || 0));
      return {
        sellerId: s.id,
        tier: s.tier,
        baselineMarginPct: Math.round(((margin.revenuePaise - margin.baselineCostPaise) / margin.revenuePaise) * 1000) / 10,
        currentMarginPct: margin.adjustedMarginPct,
        alreadySpentPaise: s.alreadySpentPaise || 0,
        remainingInSubBudgetPaise: remainingBudget,
        headroomBeforeFloorPaise: headroomBeforeFloor,
      };
    })
    .filter(x => x !== null)
    .sort((a, b) => b.headroomBeforeFloorPaise - a.headroomBeforeFloorPaise);
}

module.exports = {
  TIER_AD_BUDGETS, CHANNEL_ECONOMICS, TONE_PRESETS, CHARACTER_LIMITS, DEFAULT_GUARD,
  generateAdCreative,
  estimateCampaignReach,
  attributeAdCost,
  sellerMarginAfterAds,
  guardedAdSpend,
  rankAdHeadroom,
  includedAdBudget,
  adBudgetStatus,
};

/**
 * includedAdBudget — the monthly ad allowance that is INCLUDED in a seller's
 * subscription (not billed separately). Computed from the live subscription
 * price × the tier's allocation %, so when the founder changes a price the
 * included budget moves with it. Falls back to the static TIER_AD_BUDGETS
 * figure if no live price is supplied.
 *
 * @param {string} tier
 * @param {number|null} [subscriptionPricePaise] — live price from platformSettings
 * @returns {number|null} included monthly budget in paise (null for custom tiers)
 */
function includedAdBudget(tier, subscriptionPricePaise = null) {
  const cfg = TIER_AD_BUDGETS[tier];
  if (!cfg) return 0;
  if (cfg.monthlyBudgetPaise === null && subscriptionPricePaise == null) return null; // custom
  if (subscriptionPricePaise != null && Number.isFinite(subscriptionPricePaise)) {
    return Math.round(subscriptionPricePaise * cfg.allocationPct);
  }
  return cfg.monthlyBudgetPaise;
}

/**
 * adBudgetStatus — a seller-facing view of their INCLUDED ad allowance:
 * how much of this month's budget is used and what remains. The seller never
 * pays extra; spend is capped at the included allowance.
 *
 * @returns { tier, included_paise, spent_paise, remaining_paise, pct_used, included_in_subscription:true }
 */
function adBudgetStatus(tier, spentThisMonthPaise = 0, subscriptionPricePaise = null) {
  const included = includedAdBudget(tier, subscriptionPricePaise);
  if (included === null) {
    return { tier, included_paise: null, spent_paise: spentThisMonthPaise, remaining_paise: null, pct_used: null, custom: true, included_in_subscription: true };
  }
  const remaining = Math.max(0, included - spentThisMonthPaise);
  return {
    tier,
    included_paise: included,
    spent_paise: spentThisMonthPaise,
    remaining_paise: remaining,
    pct_used: included > 0 ? Math.min(100, Math.round((spentThisMonthPaise / included) * 100)) : 0,
    included_in_subscription: true,
  };
}
