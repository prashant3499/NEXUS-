'use strict';

/**
 * founderControlCentre.js
 *
 * One place where the founder sees and directly changes every lever of the
 * platform — platform fee, subscription fees, charity, autonomy, agent toggles —
 * with no code change, each guarded by its invariant. This is the "direct
 * command centre" the founder operates; the embedded AI can drive it too, but
 * the founder always can, directly.
 *
 * Design principle: every lever is (a) readable (current value), (b) writable
 * via one guarded path, and (c) honest about its floor/ceiling. A change that
 * would break a hard invariant (never-in-loss, consent, child-safety) is
 * REFUSED at the boundary — the command centre cannot be used to harm the
 * platform's guarantees, even by the founder.
 *
 * Composes slicer (commission) + platformSettings (subscriptions, charity).
 * Pure orchestration over those guarded setters.
 */

const slicer = require('./slicer');

/**
 * snapshot — read every lever and its current value + bounds. @param settings a
 * PlatformSettings instance (for subscriptions/charity), optional.
 */
function snapshot(settings) {
  const commissionPct = slicer.getCommissionPct();
  const tiers = {};
  if (settings && typeof settings.priceFor === 'function') {
    for (const t of ['karigar', 'vyapari', 'niryatak', 'pravasi', 'sansthan']) {
      const paise = settings.priceFor(t);
      tiers[t] = paise == null ? 'custom' : { paise, display: `₹${(paise / 100).toLocaleString('en-IN')}/mo` };
    }
  }
  return {
    levers: {
      platform_fee: {
        type: 'percent', current: commissionPct, display: `${(commissionPct * 100).toFixed(2)}%`,
        floor: slicer.COMMISSION_FLOOR_PCT, ceiling: slicer.COMMISSION_CEILING_PCT,
        change_via: 'set_platform_fee', note: 'Maker-first: the base fee is the moat. Floor + ceiling guarded.',
      },
      subscription_fees: {
        type: 'tiered_rupees_per_month', current: tiers,
        change_via: 'set_subscription', note: 'Per-tier; never below cost-to-serve (never-in-loss floor).',
      },
      charity_pct: {
        type: 'percent', change_via: 'set_charity', note: 'Buyer opt-in; never deducted from the maker.',
      },
      autonomy: { type: 'enum', options: ['manual', 'assisted', 'autonomous'], change_via: 'set_autonomy', note: 'How much the AI may do without asking.' },
      agents: { type: 'toggles', change_via: 'toggle_agent', note: 'Enable/pause individual agents.' },
    },
    invariants_protected: ['never_in_loss', 'consent_before_sale', 'child_safety'],
    note: 'Every change is guarded. A value that would break an invariant is refused here — the command centre cannot harm the platform\u2019s guarantees.',
  };
}

/**
 * change — apply a lever change directly. Routes to the right guarded setter.
 * @param lever  e.g. 'platform_fee', 'subscription'
 * @param value  the new value (pct, or { tier, paise })
 * @param deps   { settings } for subscription/charity changes
 */
function change(lever, value, deps = {}) {
  switch (lever) {
    case 'platform_fee':
    case 'set_platform_fee': {
      const r = slicer.setCommissionPct(value);
      return r.ok
        ? { ok: true, lever: 'platform_fee', applied: r.display, from: `${(r.from_pct * 100).toFixed(2)}%`, note: 'Platform fee changed live — takes effect on the next transaction.' }
        : { ok: false, lever: 'platform_fee', reason: r.reason };
    }
    case 'subscription':
    case 'set_subscription': {
      const { tier, paise } = value || {};
      if (!deps.settings || typeof deps.settings.setPrice !== 'function') return { ok: false, reason: 'Subscription settings not available.' };
      const r = deps.settings.setPrice(tier, paise);
      return r && r.ok !== false
        ? { ok: true, lever: 'subscription', tier, applied: `₹${(paise / 100).toLocaleString('en-IN')}/mo`, note: 'Subscription fee changed live (floor-guarded).' }
        : { ok: false, lever: 'subscription', reason: (r && r.reason) || 'Rejected (likely below cost-to-serve floor).' };
    }
    case 'reset_platform_fee': {
      slicer.resetCommissionPct();
      return { ok: true, lever: 'platform_fee', applied: `${(slicer.getCommissionPct() * 100).toFixed(2)}% (default)` };
    }
    default:
      return { ok: false, reason: `Unknown lever: ${lever}. Use the embedded console for charity/autonomy/agent toggles.` };
  }
}

module.exports = { snapshot, change };
