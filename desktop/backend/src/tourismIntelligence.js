/**
 * NEXUS — Tourism Intelligence.
 *
 * Two pure functions:
 *   1. scoreOperator(operator, history) — a 0–100 trust score with a tier
 *      classification, used to gate booking visibility and surface operator
 *      quality issues to the founder.
 *   2. seasonalSignals(date) — what categories of experience to push this
 *      week, given India's seasons (monsoon, winter, festival, etc.).
 *
 * Both are rule-based, calibrated against real Indian tourism patterns.
 * They are kept separate from `tourism.js` (which handles the safety
 * gate — risk-KYC link, operator-bound insurance). This module is the
 * intelligence layer that suggests *what to push and who to trust*,
 * not what to allow.
 */

'use strict';

const TIER = {
  PREFERRED:    'preferred',     // ≥ 80 — surface first, low friction
  STANDARD:     'standard',      // 60–79 — standard listing
  PROBATIONARY: 'probationary',  // 40–59 — operator must improve
  BLOCKED:      'blocked',       // < 40 — do not surface
};

/**
 * Score an operator. Combines documentation (license, insurance), incident
 * history, and review scores. Returns the score, tier, and the reasoning
 * chain so a founder can see *why* an operator is rated where they are.
 *
 * @param {{licenseVerified?:boolean, cglIndemnity?:boolean, adventureInsuranceBound?:boolean, categories?:string[]}} operator
 * @param {{incidents?:number, avgReview?:number, completedBookings?:number}} history
 * @returns {{score:number, tier:string, reasons:Array<{ok:boolean,text:string}>}}
 */
function scoreOperator(operator = {}, history = {}) {
  const reasons = [];
  let score = 0;

  // Licensing — non-negotiable foundation
  if (operator.licenseVerified) {
    score += 35;
    reasons.push({ ok: true, text: 'License verified by regulator' });
  } else {
    reasons.push({ ok: false, text: 'Operator license not verified' });
  }

  // Insurance — platform never fronts premium, but operator must carry it
  if (operator.cglIndemnity) {
    score += 20;
    reasons.push({ ok: true, text: 'CGL (commercial general liability) active' });
  } else {
    reasons.push({ ok: false, text: 'No commercial liability indemnity on file' });
  }
  // Adventure operators must additionally bind adventure insurance
  const runsHighRisk = Array.isArray(operator.categories) &&
                       operator.categories.some(c => c === 'adventure' || c === 'sports');
  if (runsHighRisk) {
    if (operator.adventureInsuranceBound) {
      score += 15;
      reasons.push({ ok: true, text: 'Adventure insurance bound (required for high-risk categories)' });
    } else {
      score -= 20;
      reasons.push({ ok: false, text: 'Runs adventure/sports categories WITHOUT adventure insurance — high liability gap' });
    }
  }

  // Incident history — each past incident weighs heavy
  const incidents = history.incidents || 0;
  if (incidents === 0 && (history.completedBookings || 0) > 0) {
    score += 10;
    reasons.push({ ok: true, text: 'Clean incident history across past bookings' });
  } else if (incidents > 0) {
    score -= incidents * 15;
    reasons.push({ ok: false, text: `${incidents} past incident${incidents>1?'s':''} on record` });
  }

  // Reviews — 0..5 scale
  const r = history.avgReview || 0;
  if (r >= 4.5) {
    score += 15;
    reasons.push({ ok: true, text: `Excellent review average (${r.toFixed(1)}/5)` });
  } else if (r >= 4) {
    score += 8;
    reasons.push({ ok: true, text: `Solid review average (${r.toFixed(1)}/5)` });
  } else if (r >= 3 && r > 0) {
    // neutral — no points either way
  } else if (r > 0 && r < 3) {
    score -= 10;
    reasons.push({ ok: false, text: `Low review average (${r.toFixed(1)}/5)` });
  }

  // Volume tiebreaker — established operators with clean records edge up
  const vol = history.completedBookings || 0;
  if (vol >= 100 && incidents === 0) {
    score += 5;
    reasons.push({ ok: true, text: `${vol}+ bookings completed without incident` });
  }

  score = Math.max(0, Math.min(100, score));

  const tier = score >= 80 ? TIER.PREFERRED :
               score >= 60 ? TIER.STANDARD :
               score >= 40 ? TIER.PROBATIONARY :
                             TIER.BLOCKED;

  return { score, tier, reasons };
}

/**
 * Seasonal signals for India. Returns categories that should be pushed
 * given the current date, with priority and a human-readable reason.
 *
 * Indian seasons used:
 *   Winter (peak):     Nov, Dec, Jan, Feb  — Rajasthan, desert, Himalaya
 *   Spring/pre-summer: Mar, Apr            — Hill stations gaining
 *   Summer:            May                 — Hill stations peak, plains hot
 *   Monsoon:           Jun, Jul, Aug, Sep  — Western Ghats, Kerala
 *   Post-monsoon:      Oct                 — Festival season opens
 *
 * Festival overlay: Diwali (Oct/Nov), Holi (Mar), Christmas (Dec), Eid (varies)
 *
 * @param {Date|number} when
 * @returns {Array<{category:string, priority:'high'|'med'|'low', why:string, window:string}>}
 */
function seasonalSignals(when = new Date()) {
  const d = (when instanceof Date) ? when : new Date(when);
  const m = d.getMonth() + 1; // 1..12
  const out = [];

  // Winter peak — Nov to Feb
  if ([11, 12, 1, 2].includes(m)) {
    out.push({ category: 'heritage',  priority: 'high', window: 'winter peak',
      why: 'Peak winter — Rajasthan heritage circuits, desert camps, fort-stays at maximum demand' });
    out.push({ category: 'cultural',  priority: 'high', window: 'winter peak',
      why: 'Cool-weather culture tours — Old Delhi, Lucknow walks, Banaras ghats' });
  }
  // Festival season — Oct, Nov, Dec
  if ([10, 11, 12].includes(m)) {
    out.push({ category: 'cultural',  priority: 'high', window: 'festival season',
      why: 'Diwali, Eid-e-Milad, Christmas markets — premium cultural experiences sell out 3 weeks ahead' });
  }
  // Monsoon — Jun to Sep
  if ([6, 7, 8, 9].includes(m)) {
    out.push({ category: 'eco',       priority: 'med',  window: 'monsoon',
      why: 'Monsoon — Western Ghats, Kerala backwaters, tea-estate stays at peak greenery' });
    out.push({ category: 'natural',   priority: 'low',  window: 'monsoon',
      why: 'Most Himalayan trails closed; coastal Kerala and Goa accessible' });
  }
  // Pre-monsoon / hill season — Mar to May
  if ([3, 4, 5].includes(m)) {
    out.push({ category: 'natural',   priority: 'med',  window: 'hill season',
      why: 'Plains heat drives demand for Himalayan hill stations — Shimla, Manali, Mussoorie, Ooty' });
  }
  // Adventure winter window — Dec, Jan, Feb (winter sports)
  if ([12, 1, 2].includes(m)) {
    out.push({ category: 'adventure', priority: 'high', window: 'winter sports',
      why: 'Skiing season — Gulmarg, Auli, Solang' });
  }
  // Adventure trekking window — Apr–Jun and Sep–Oct
  if ([4, 5, 6, 9, 10].includes(m)) {
    out.push({ category: 'adventure', priority: 'med',  window: 'trekking',
      why: 'Pre-monsoon and post-monsoon — peak trekking windows for Himalayan routes' });
  }
  // Sports — match Olympic / cricket calendars roughly (skipping for simplicity)
  // Spiritual — year-round but with festival amplification
  if ([10, 11].includes(m)) {
    out.push({ category: 'spiritual', priority: 'med',  window: 'pilgrimage',
      why: 'Char Dham closes mid-Nov — final pilgrimage window; Diwali pilgrim demand spikes' });
  }

  return out;
}

/**
 * Aggregate intelligence across an operator pool. Surfaces who to promote,
 * who to coach, who to remove, and seasonal pushes timed to now.
 */
function tourismPortfolio(operators = [], when = new Date()) {
  const scored = operators.map(o => ({
    operator: o,
    rating: scoreOperator(o.spec || o, o.history || {}),
  }));
  const buckets = { preferred: [], standard: [], probationary: [], blocked: [] };
  scored.forEach(s => buckets[s.rating.tier].push(s));
  const season = seasonalSignals(when);
  // Top seasonal push: highest priority signal, with at least one preferred operator running it
  const topPush = season.find(sig =>
    sig.priority === 'high' &&
    buckets.preferred.some(s => (s.operator.spec?.categories || s.operator.categories || []).includes(sig.category))
  ) || season[0] || null;

  return {
    total: operators.length,
    buckets,
    season,
    topPush,
  };
}

module.exports = { scoreOperator, seasonalSignals, tourismPortfolio, TIER };
