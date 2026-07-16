'use strict';

/**
 * platformSettings.js
 *
 * The founder's no-code control surface. The platform is run by one person
 * who must be able to change commercial terms WITHOUT touching code — this is
 * where those knobs live. Today it governs subscription pricing per archetype;
 * it's structured to grow (commission rates, ad budgets, feature flags).
 *
 * Two hard rules, enforced here so the founder can't accidentally break the
 * business model from the settings screen:
 *
 *   1. NEVER IN LOSS — a subscription price cannot be set below the platform's
 *      monthly cost-to-serve that tier. The platform refuses to sell a plan
 *      that loses money on day one. (This mirrors the profit guard at the AI
 *      and order boundaries — same invariant, third boundary.)
 *
 *   2. SANSTHAN STAYS CUSTOM — the cooperative umbrella tier is negotiated
 *      per-deal (one onboarding can be 400 weavers), so its price is null by
 *      design and cannot be set to a fixed number here.
 *
 * Settings are persisted (founder changes survive restarts) and versioned with
 * an audit trail so every price change is attributable.
 */

// Monthly cost-to-serve floor per tier (paise). These are the platform's own
// costs for carrying a seller on that tier for a month: inference budget,
// compliance handling, support load, payment infra share. A price below this
// means the platform loses money on the subscription itself.
//
// Derived conservatively; the founder sees these as the floor in the UI.
const COST_TO_SERVE_PAISE = Object.freeze({
  karigar:  20000,   // ₹200 — heaviest AI/compliance load (undocumented, MoR, multilingual hand-holding)
  vyapari:  50000,   // ₹500 — registered, lighter compliance, more catalog volume
  niryatak: 150000,  // ₹1500 — export docs, GI/gem compliance, AD-code reconciliation
  pravasi:  40000,   // ₹400 — tourism agent, itinerary + operator coordination
  // sansthan has no fixed floor — custom-negotiated
});

// Factory defaults — the prices the platform ships with (paise/month).
const DEFAULT_PRICES_PAISE = Object.freeze({
  karigar:  79900,    // ₹799 — raised, but kept accessible for undocumented artisans (mission tier)
  vyapari:  399900,   // ₹3,999
  niryatak: 1199900,  // ₹11,999
  pravasi:  299900,   // ₹2,999
  sansthan: null,     // custom-negotiated
});

const FIXED_PRICE_TIERS = ['karigar', 'vyapari', 'niryatak', 'pravasi'];

// Charity / giving — a transparent, founder-controlled donation taken as a
// small % of each order and directed to a named cause. Off by default until
// the founder names a cause and enables it; capped so it can never erode the
// maker's payout unreasonably.
const CHARITY_MAX_PCT = 0.05;            // hard ceiling: 5% of order
const DEFAULT_CHARITY = Object.freeze({
  enabled: false,
  pct: 0.002,                            // 0.2% suggested starting rate
  cause: null,                           // e.g. "Artisan children's education fund"
  borne_by: 'platform',                  // 'platform' (from commission) or 'buyer' (added on top)
});

/**
 * Validate a proposed price for a tier. Returns { ok, error?, floor? }.
 * Enforces the never-in-loss floor and the sansthan-is-custom rule.
 */
function validatePrice(tier, pricePaise) {
  if (tier === 'sansthan') {
    if (pricePaise !== null && pricePaise !== undefined) {
      return { ok: false, error: 'Sansthan (cooperative) pricing is custom-negotiated per deal — leave it unset.' };
    }
    return { ok: true };
  }
  if (!FIXED_PRICE_TIERS.includes(tier)) {
    return { ok: false, error: `Unknown tier "${tier}".` };
  }
  if (!Number.isInteger(pricePaise) || pricePaise < 0) {
    return { ok: false, error: 'Price must be a non-negative integer (paise).' };
  }
  const floor = COST_TO_SERVE_PAISE[tier];
  if (pricePaise < floor) {
    return {
      ok: false,
      error: `₹${(pricePaise / 100).toFixed(0)} is below the cost-to-serve floor of ₹${(floor / 100).toFixed(0)} for this tier — the platform would lose money on every ${tier} on day one. The platform never operates at a loss.`,
      floor,
    };
  }
  return { ok: true, floor };
}

/**
 * PlatformSettings — holds the founder-editable settings + an audit trail.
 * Construct from a persisted snapshot or with defaults.
 */
class PlatformSettings {
  constructor(snapshot = null, opts = {}) {
    this.now = opts.now || (() => Date.now());
    if (snapshot && snapshot.prices) {
      this.prices = { ...DEFAULT_PRICES_PAISE, ...snapshot.prices };
      this.charity = { ...DEFAULT_CHARITY, ...(snapshot.charity || {}) };
      this.audit = Array.isArray(snapshot.audit) ? [...snapshot.audit] : [];
      this.updated_at = snapshot.updated_at || this.now();
    } else {
      this.prices = { ...DEFAULT_PRICES_PAISE };
      this.charity = { ...DEFAULT_CHARITY };
      this.audit = [];
      this.updated_at = this.now();
    }
  }

  /** Current price for a tier (paise), or null for custom tiers. */
  priceFor(tier) {
    return this.prices[tier] !== undefined ? this.prices[tier] : null;
  }

  /** All prices, with floors + display, for the founder settings screen. */
  pricingTable() {
    const out = {};
    for (const tier of [...FIXED_PRICE_TIERS, 'sansthan']) {
      const price = this.prices[tier];
      out[tier] = {
        tier,
        price_paise: price,
        price_display: price == null ? 'Custom' : `₹${(price / 100).toLocaleString('en-IN')}/mo`,
        floor_paise: COST_TO_SERVE_PAISE[tier] || null,
        floor_display: COST_TO_SERVE_PAISE[tier] ? `₹${(COST_TO_SERVE_PAISE[tier] / 100).toLocaleString('en-IN')}/mo` : null,
        editable: tier !== 'sansthan',
      };
    }
    return out;
  }

  /**
   * Set a tier's price. Founder-only (enforced at the route). Validates the
   * never-in-loss floor before applying. Records an audit entry.
   * @returns { ok, error?, settings? }
   */
  setPrice(tier, pricePaise, meta = {}) {
    const v = validatePrice(tier, pricePaise);
    if (!v.ok) return { ok: false, error: v.error, floor: v.floor };
    const previous = this.prices[tier];
    this.prices[tier] = pricePaise;
    this.updated_at = this.now();
    this.audit.push({
      at: this.updated_at,
      tier,
      from_paise: previous,
      to_paise: pricePaise,
      by: meta.by || 'founder',
      note: meta.note || null,
    });
    // Bound the audit trail
    if (this.audit.length > 500) this.audit = this.audit.slice(-500);
    return { ok: true, settings: this.snapshot() };
  }

  /** Current charity config, with a display + the order-time fields. */
  charityConfig() {
    return {
      enabled: !!this.charity.enabled,
      pct: this.charity.pct,
      pct_display: `${(this.charity.pct * 100).toFixed(2)}%`,
      cause: this.charity.cause || null,
      borne_by: this.charity.borne_by || 'platform',
      max_pct: CHARITY_MAX_PCT,
    };
  }

  /**
   * Set the charity config. Founder-only. Enabling requires a named cause (no
   * anonymous "charity" line — buyers must see where it goes). Rate is capped.
   * @returns { ok, error?, charity? }
   */
  setCharity(input = {}, meta = {}) {
    const next = { ...this.charity };
    if (input.pct !== undefined) {
      const pct = Number(input.pct);
      if (!Number.isFinite(pct) || pct < 0) return { ok: false, error: 'charity pct must be a non-negative number' };
      if (pct > CHARITY_MAX_PCT) return { ok: false, error: `charity pct cannot exceed ${(CHARITY_MAX_PCT * 100)}% — giving must never erode the maker's payout` };
      next.pct = pct;
    }
    if (input.cause !== undefined) next.cause = input.cause ? String(input.cause).slice(0, 120) : null;
    if (input.borne_by !== undefined) {
      if (!['platform', 'buyer'].includes(input.borne_by)) return { ok: false, error: "borne_by must be 'platform' or 'buyer'" };
      next.borne_by = input.borne_by;
    }
    if (input.enabled !== undefined) next.enabled = !!input.enabled;
    // Enabling demands a named cause for transparency.
    if (next.enabled && !next.cause) {
      return { ok: false, error: 'name the cause before enabling charity — buyers must see exactly where donations go' };
    }
    this.charity = next;
    this.updated_at = this.now();
    this.audit.push({ at: this.updated_at, charity: { ...next }, by: meta.by || 'founder', note: meta.note || 'charity updated' });
    if (this.audit.length > 500) this.audit = this.audit.slice(-500);
    return { ok: true, charity: this.charityConfig() };
  }

  /** Serializable snapshot for persistence. */
  snapshot() {
    return { prices: { ...this.prices }, charity: { ...this.charity }, audit: [...this.audit], updated_at: this.updated_at };
  }
}

module.exports = {
  COST_TO_SERVE_PAISE,
  DEFAULT_PRICES_PAISE,
  FIXED_PRICE_TIERS,
  CHARITY_MAX_PCT,
  DEFAULT_CHARITY,
  validatePrice,
  PlatformSettings,
};
