'use strict';

/**
 * verticalCost.js
 *
 * The base operationalCost model is by SCALE (0 / 100 / 1000 sellers). But the
 * five verticals don't cost the same to serve: tourism is inference- and
 * support-heavy (itineraries, safety checks, multilingual back-and-forth);
 * gems/jewellery and EXIM carry real compliance cost (certification, export
 * docs); GI-tagged needs provenance verification; handicrafts and naturals are
 * the lean, high-margin core. This module makes that explicit so the founder
 * can see cost-to-serve and margin per vertical, not just in aggregate.
 *
 * It's grounded in the real base model (operationalCost.ASSUMPTIONS) and layers
 * per-vertical MULTIPLIERS on the variable cost drivers (inference, support,
 * compliance). Multipliers are honest estimates, labelled as such — not
 * fabricated precision.
 *
 * Pure + dependency-free; the base assumptions are injected so this stays
 * decoupled and testable.
 */

// Per-vertical cost profile. Relative to the lean baseline (1.0):
//   inference  — AI calls per active seller (listings, Q&A, agents)
//   support    — human/AI support load (grievances, guidance)
//   compliance — fixed monthly compliance cost per active seller (paise)
// Revenue tier is the platform's monthly price for the typical seller there.
const VERTICAL_PROFILE = Object.freeze({
  gems: { name: 'Gems & Gemstones', inference: 1.4, support: 1.3, compliance_paise: 8000, tier: 'niryatak', note: 'Certification (GIA/IGI), Kimberley/CITES checks add compliance cost.' },
  jewellery: { name: 'Jewellery', inference: 1.2, support: 1.1, compliance_paise: 5000, tier: 'vyapari', note: 'Hallmarking (BIS) + higher-value disputes raise support.' },
  gi: { name: 'GI-Tagged Products', inference: 1.1, support: 1.0, compliance_paise: 3000, tier: 'vyapari', note: 'GI provenance verification; otherwise lean.' },
  handicraft: { name: 'Handicrafts & Home Decor', inference: 1.0, support: 1.0, compliance_paise: 1000, tier: 'karigar', note: 'The lean, high-margin core vertical.' },
  naturals: { name: 'Sustainable Naturals', inference: 1.0, support: 1.0, compliance_paise: 1500, tier: 'karigar', note: 'Light compliance (organic/eco claims).' },
  tourism: { name: 'Tourism', inference: 2.2, support: 1.8, compliance_paise: 6000, tier: 'pravasi', note: 'Itinerary AI + safety gating + insurance = highest cost-to-serve.' },
  environment: { name: 'Environment & Climate', inference: 1.3, support: 1.1, compliance_paise: 7000, tier: 'vyapari', note: 'Eco-claim substantiation + carbon methodology add compliance cost; unlocks ESG/CSR + carbon-credit revenue.' },
});

// Platform monthly price per tier (paise) — mirrors platformSettings defaults.
const TIER_PRICE_PAISE = Object.freeze({ karigar: 49900, vyapari: 249900, niryatak: 799900, pravasi: 199900 });

/**
 * verticalMonthlyCost — cost to serve ONE active seller in a vertical for a
 * month, broken into inference / support / compliance, grounded in the base
 * assumptions.
 */
function verticalMonthlyCost(verticalId, assumptions) {
  const p = VERTICAL_PROFILE[verticalId];
  if (!p) return null;
  const a = assumptions;
  // Variable inference: calls/day * 30 * cost/call * vertical multiplier.
  const inference_paise = Math.round(a.llm_active_calls_per_seller_per_day * 30 * a.llm_cost_per_call_paise * p.inference);
  // Support proxy: emails + a support-load multiplier on a small base.
  const support_paise = Math.round((a.emails_per_seller_per_mo * a.email_per_message_paise) * p.support + 2000 * (p.support - 1));
  const compliance_paise = p.compliance_paise;
  const total_paise = inference_paise + support_paise + compliance_paise;
  return { vertical: verticalId, name: p.name, inference_paise, support_paise, compliance_paise, total_paise, tier: p.tier, note: p.note };
}

/**
 * reportAllVerticals — cost-to-serve + margin for one active seller in EACH
 * vertical, plus a blended view. This is the "operational cost across all
 * verticals" answer.
 */
function reportAllVerticals(assumptions) {
  const rows = Object.keys(VERTICAL_PROFILE).map((id) => {
    const c = verticalMonthlyCost(id, assumptions);
    const revenue_paise = TIER_PRICE_PAISE[c.tier] || 0;
    const margin_paise = revenue_paise - c.total_paise;
    const margin_pct = revenue_paise ? Math.round((margin_paise / revenue_paise) * 1000) / 10 : null;
    return { ...c, revenue_paise, margin_paise, margin_pct };
  });
  // Blended (simple average of per-seller margin %).
  const withMargin = rows.filter((r) => r.margin_pct != null);
  const blended_margin_pct = withMargin.length
    ? Math.round((withMargin.reduce((s, r) => s + r.margin_pct, 0) / withMargin.length) * 10) / 10 : null;
  const total_cost_paise = rows.reduce((s, r) => s + r.total_paise, 0);
  return {
    per_vertical: rows.sort((a, b) => b.total_paise - a.total_paise),
    blended_margin_pct,
    avg_cost_to_serve_paise: Math.round(total_cost_paise / rows.length),
    cheapest: rows.reduce((m, r) => (r.total_paise < m.total_paise ? r : m)),
    costliest: rows.reduce((m, r) => (r.total_paise > m.total_paise ? r : m)),
    note: 'Per active seller, per month. Inference is the dominant variable cost; tourism is costliest to serve, handicrafts/naturals the leanest.',
  };
}

module.exports = { VERTICAL_PROFILE, TIER_PRICE_PAISE, verticalMonthlyCost, reportAllVerticals };
