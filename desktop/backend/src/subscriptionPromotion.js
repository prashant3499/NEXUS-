/**
 * NEXUS — Subscription Promotion Intelligence.
 *
 * Detects when a seller has outgrown their current tier and is ready for
 * promotion to a higher one. Produces concrete offers (target tier, unlocks,
 * price delta, evidence) and ranks them across the seller base into cohorts
 * the founder can act on.
 *
 * This is BEHAVIORAL, not static. The input is usage over time — GMV,
 * exports, modality adoption, friction events. The output is timed:
 * promotions surface after a sustained signal AND a wins moment, not
 * after a single spike or in the middle of a dispute.
 *
 * NOT to be confused with "which tier fits this seller's profile" (a
 * static recommendation). This module answers: "is this seller behaving
 * like they're ready to upgrade, and what's the right offer right now."
 */

'use strict';

// ────────────────────────────────────────────────────────────
// TIER DEFINITIONS — capacity bounds, modalities, price
// ────────────────────────────────────────────────────────────

const TIERS = {
  karigar: {
    name: 'Karigar', order: 0, pricePaise: 49900,
    gmvCeilingPaise: 5000000,        // ₹50k/mo
    monthlyExportCeiling: 0,
    modalities: ['D2C', 'POS'],
    unlocks: ['Voice onboarding · 22 languages', 'D2C storefront', 'UPI checkout', 'In-person POS'],
  },
  vyapari: {
    name: 'Vyapari', order: 1, pricePaise: 249900,
    gmvCeilingPaise: 25000000,       // ₹2.5L/mo
    monthlyExportCeiling: 5,
    modalities: ['D2C', 'POS', 'B2B'],
    unlocks: ['B2B catalog & RFQ', 'Bulk pricing ladders', 'GST invoicing in your name', 'Net-30 payment terms'],
  },
  pravasi: {
    name: 'Pravasi', order: 2, pricePaise: 199900,
    gmvCeilingPaise: 30000000,
    monthlyExportCeiling: 50,        // diaspora-facing, light EXIM
    modalities: ['D2C', 'EXIM'],
    unlocks: ['Diaspora-facing D2C in USD', 'Lightweight customs flow', 'FX quoting'],
  },
  niryatak: {
    name: 'Niryatak', order: 3, pricePaise: 799900,
    gmvCeilingPaise: 100000000,      // ₹10L/mo
    monthlyExportCeiling: Infinity,
    modalities: ['D2C', 'POS', 'B2B', 'B2B2C', 'EXIM'],
    unlocks: ['Full EXIM stack · IRP e-invoicing · FEMA paperwork', 'B2B2C partner feed & commission', 'Shipping bills auto-generated', 'Adventure insurance referrals'],
  },
  sansthan: {
    name: 'Sansthan', order: 4, pricePaise: null,  // custom
    gmvCeilingPaise: Infinity,
    monthlyExportCeiling: Infinity,
    modalities: ['ALL'],
    unlocks: ['Cooperative umbrella KYC', 'Member-level payouts', 'Bespoke compliance support'],
  },
};

const DAY = 86400 * 1000;
const SUSTAINED_DAYS = 30;          // a signal must be visible for at least this long
const COOLDOWN_DAYS = 14;           // after a declined offer
const HIGH_VALUE_PAISE = 20000000;  // ₹2L, the "wins moment" threshold

// ────────────────────────────────────────────────────────────
// USAGE AGGREGATION — turn raw history into tier-relevant numbers
// ────────────────────────────────────────────────────────────

/**
 * Aggregate a seller's recent history. Returns rolling 30-day usage in the
 * shape promotion logic operates on.
 *
 * @param {Array<{at:number, sellPricePaise?:number, isExport?:boolean, modality?:string, status?:string}>} events
 * @param {number} now
 */
function aggregateUsage(events = [], now = Date.now()) {
  const cutoff30 = now - 30 * DAY;
  const cutoff90 = now - 90 * DAY;
  const recent30 = events.filter(e => (e.at || 0) >= cutoff30);
  const recent90 = events.filter(e => (e.at || 0) >= cutoff90);

  const gmvPaise30 = recent30.reduce((s, e) => s + (e.sellPricePaise || 0), 0);
  const gmvPaise90 = recent90.reduce((s, e) => s + (e.sellPricePaise || 0), 0);
  const orderCount30 = recent30.length;
  const exportCount30 = recent30.filter(e => e.isExport).length;
  const modalitiesUsed = [...new Set(recent90.map(e => (e.modality || 'D2C').toUpperCase()))];

  // The "wins moment" — did they settle a big one recently?
  const biggestRecent = recent30.reduce((m, e) => Math.max(m, e.sellPricePaise || 0), 0);

  // Sustained vs spike — are the events spread out, or one big day?
  const days = new Set(recent30.map(e => Math.floor((e.at || 0) / DAY))).size;
  const sustained = days >= 5; // active on 5+ separate days in the last 30

  return { gmvPaise30, gmvPaise90, orderCount30, exportCount30, modalitiesUsed, biggestRecent, sustained, eventCount: recent30.length };
}

// ────────────────────────────────────────────────────────────
// SIGNAL DETECTION — what triggers a promotion event
// ────────────────────────────────────────────────────────────

/**
 * Detect whether a seller's behavior signals readiness to upgrade.
 * Returns null if no signal, or {signal, evidence, suggestedTier}.
 */
function detectUpgradeSignal(seller = {}, usage = {}) {
  const currentTier = seller.tier || 'karigar';
  const cur = TIERS[currentTier];
  if (!cur) return null;

  // 1) Export adoption — adopting EXIM is the strongest architectural signal.
  //    Check this BEFORE GMV ceiling, because Pravasi has a higher GMV ceiling
  //    than Vyapari and could otherwise win a GMV-based promotion incorrectly.
  if (usage.exportCount30 > 0 && usage.exportCount30 > cur.monthlyExportCeiling) {
    const target = usage.exportCount30 >= 20 ? 'niryatak' : 'pravasi';
    if (TIERS[target].order > cur.order) {
      return {
        signal: 'export_modality',
        evidence: `${usage.exportCount30} export order${usage.exportCount30>1?'s':''} this month — current ${cur.name} tier doesn't include the full EXIM stack`,
        suggestedTier: target,
      };
    }
  }

  // 2) Modality adoption — B2B activity from a tier that doesn't include it
  if (usage.modalitiesUsed?.includes('B2B') && !cur.modalities.includes('B2B')) {
    return {
      signal: 'b2b_modality',
      evidence: 'You completed B2B orders — RFQ flows, bulk pricing, and GST-in-your-name invoicing unlock at Vyapari',
      suggestedTier: 'vyapari',
    };
  }

  // 3) GMV ceiling — sustained activity at or above the tier ceiling
  if (usage.gmvPaise30 >= cur.gmvCeilingPaise && usage.sustained) {
    const target = nextTierForGmv(usage.gmvPaise30);
    if (target && TIERS[target].order > cur.order) {
      return {
        signal: 'gmv_ceiling',
        evidence: `30-day GMV ₹${(usage.gmvPaise30/100).toLocaleString('en-IN')} crossed the ${cur.name} ceiling, sustained across multiple days`,
        suggestedTier: target,
      };
    }
  }

  // 4) Friction event recorded externally (a tier limit was hit)
  if (seller.frictionEvent && seller.frictionEvent.tierLimited) {
    const target = seller.frictionEvent.requiredTier;
    if (target && TIERS[target] && TIERS[target].order > cur.order) {
      return {
        signal: 'friction',
        evidence: `Hit a ${cur.name} tier limit: ${seller.frictionEvent.what}`,
        suggestedTier: target,
      };
    }
  }

  return null;
}

function nextTierForGmv(gmvPaise) {
  // The standard GMV ladder: Karigar → Vyapari → Niryatak.
  // Pravasi is a diaspora-EXIM lane, reached via export signal, not GMV.
  const ladder = ['karigar', 'vyapari', 'niryatak'];
  for (const key of ladder) {
    if (gmvPaise < TIERS[key].gmvCeilingPaise) return key;
  }
  return 'niryatak';
}

// ────────────────────────────────────────────────────────────
// READINESS — combines signal + timing + account standing
// ────────────────────────────────────────────────────────────

/**
 * Score 0..100 how ready a seller is to upgrade right now.
 * Higher = better moment to surface the offer.
 *
 * Pieces:
 *   +50 if there's an upgrade signal at all
 *   +20 if sustained (not a spike)
 *   +20 if there's a wins moment (just settled a big one)
 *   −40 if blocked: open dispute, cooldown active, KYC issue
 */
function readinessScore(seller = {}, usage = {}, now = Date.now()) {
  const sig = detectUpgradeSignal(seller, usage);
  if (!sig) return { score: 0, ready: false, signal: null, blockers: [] };

  let score = 50;
  const blockers = [];
  if (usage.sustained) score += 20;
  if ((usage.biggestRecent || 0) >= HIGH_VALUE_PAISE) score += 20;

  // Account standing
  if (seller.openDispute) { score -= 40; blockers.push('Open dispute — wait until resolved'); }
  if (seller.kycLapsed)   { score -= 30; blockers.push('KYC lapsed — re-verify first'); }

  // Cooldown after a declined offer
  if (seller.lastOfferDeclinedAt && (now - seller.lastOfferDeclinedAt) < COOLDOWN_DAYS * DAY) {
    const daysLeft = Math.ceil((COOLDOWN_DAYS * DAY - (now - seller.lastOfferDeclinedAt)) / DAY);
    score -= 40;
    blockers.push(`Cooldown — declined offer ${daysLeft} day${daysLeft>1?'s':''} ago`);
  }

  score = Math.max(0, Math.min(100, score));
  return { score, ready: score >= 60 && blockers.length === 0, signal: sig, blockers };
}

// ────────────────────────────────────────────────────────────
// OFFER — the concrete promotion package
// ────────────────────────────────────────────────────────────

/**
 * Build the full promotion offer for a seller. Returns null if not ready.
 * The offer contains everything needed to surface it both to the seller
 * (their portal card) and to the founder (the cohort row).
 */
function promotionOffer(seller = {}, usage = {}, now = Date.now()) {
  const r = readinessScore(seller, usage, now);
  if (!r.signal) return null;
  const from = TIERS[seller.tier || 'karigar'];
  const to = TIERS[r.signal.suggestedTier];
  if (!to) return null;

  const newUnlocks = to.unlocks.filter(u => !from.unlocks.includes(u));
  const priceDeltaPaise = (to.pricePaise || 0) - (from.pricePaise || 0);

  // ROI hint: a Vyapari upgrade pays for itself if even a small share of GMV
  // crosses the new tier's bulk-pricing or invoicing capabilities. Honest
  // estimate based on the seller's own 30-day GMV, not a marketing number.
  const monthlyGmvPaise = usage.gmvPaise30 || 0;
  const roiNote = priceDeltaPaise > 0 && monthlyGmvPaise > 0
    ? `The ₹${(priceDeltaPaise/100).toLocaleString('en-IN')}/mo delta is ${Math.round(priceDeltaPaise / monthlyGmvPaise * 100 * 100) / 100}% of your last 30-day GMV`
    : null;

  return {
    fromTier: seller.tier || 'karigar',
    toTier: r.signal.suggestedTier,
    fromName: from.name,
    toName: to.name,
    signal: r.signal.signal,
    evidence: r.signal.evidence,
    newUnlocks,
    priceDeltaPaise,
    roiNote,
    readiness: r.score,
    ready: r.ready,
    blockers: r.blockers,
  };
}

// ────────────────────────────────────────────────────────────
// COHORT — ranked across all sellers, for the founder
// ────────────────────────────────────────────────────────────

/**
 * Build a promotion cohort: every seller with a ready offer, ranked by
 * readiness score and expected MRR lift. The founder can take this as a
 * list to message, with the right content per seller already computed.
 */
function promotionCohort(sellers = [], usageBySeller = {}, now = Date.now()) {
  const offers = [];
  for (const s of sellers) {
    const usage = usageBySeller[s.id] || {};
    const offer = promotionOffer(s, usage, now);
    if (offer && offer.ready) offers.push({ seller: s, offer });
  }
  // Rank: high readiness first; tie-break by larger MRR lift
  offers.sort((a, b) =>
    (b.offer.readiness - a.offer.readiness) ||
    (b.offer.priceDeltaPaise - a.offer.priceDeltaPaise)
  );
  const expectedMrrLiftPaise = offers.reduce((s, o) => s + (o.offer.priceDeltaPaise || 0), 0);
  return {
    cohortSize: offers.length,
    offers,
    expectedMrrLiftPaise,
  };
}

module.exports = {
  TIERS, SUSTAINED_DAYS, COOLDOWN_DAYS, HIGH_VALUE_PAISE,
  aggregateUsage, detectUpgradeSignal, readinessScore,
  promotionOffer, promotionCohort, nextTierForGmv,
};
