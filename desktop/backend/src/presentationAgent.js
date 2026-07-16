'use strict';

/**
 * presentationAgent.js
 *
 * The platform should be able to present ITSELF on demand — and to the right
 * person in the right words. An artisan cares that she keeps her money and her
 * dignity; an investor cares about the model and the moat; a showroom cares
 * about zero sourcing risk; a regulator cares about formalisation and tax. Same
 * truth, seven front doors.
 *
 * This agent composes the platform's REAL facts into an audience-tailored
 * narrative: what it is, how it helps YOU specifically, how it grows (the
 * compounding flywheel), and — always — its honest current stage. It does not
 * invent traction; if there are no customers yet, it says so. A pitch that
 * lies is a liability, not an asset.
 *
 * Read-only and safe (like self-audit) — it presents, it never acts. Facts are
 * injectable so it can pull live numbers; honest defaults otherwise.
 */

const AUDIENCE = Object.freeze({
  INVESTOR: 'investor', SELLER: 'seller', BUYER: 'buyer',
  PARTNER_SHOWROOM: 'showroom', PARTNER_TRAVEL: 'travel_agent',
  PARTNER_CREATOR: 'creator', PARTNER_SOCIAL: 'social_platform',
  GOVERNMENT: 'government',
});

const DEFAULT_FACTS = Object.freeze({
  verticals: 7, commission_pct: 3, marketplace_take_pct: '20\u201340',
  payout_days: 2, blended_margin_pct: 81, languages: 13,
  stage: 'pre-revenue, pilot-ready', customers: 0,
  tests: 3584, ondc_ready: true,
});

// How it grows — the compounding network moat, shared across audiences.
function flywheel() {
  return 'More verified makers attract more buyers; more buyers attract more partners (showrooms, agents, creators); every transaction adds provenance + reputation data that makes matching and trust better — which attracts more makers. Reputation is portable onto ONDC, so it compounds across the network and can\u2019t easily be copied.';
}

function honestStatus(f) {
  return f.customers > 0
    ? `Live with ${f.customers} customer(s). Engine verified by ${f.tests} automated tests.`
    : `Pre-revenue and pilot-ready: the full engine is built and verified (${f.tests} tests, invariants self-audited), but no pilot has run yet. The next milestone is proof with real makers and buyers, not more features.`;
}

function present(audienceKey, factsIn = {}) {
  // Normalize common aliases so the agent is robust to how people ask.
  const ALIASES = { artisan: 'seller', maker: 'seller', karigar: 'seller', weaver: 'seller', customer: 'buyer', shop: 'showroom', reseller: 'showroom', blogger: 'creator', influencer: 'creator', social: 'social_platform', regulator: 'government', vc: 'investor' };
  if (typeof audienceKey === 'string' && ALIASES[audienceKey.toLowerCase()]) audienceKey = ALIASES[audienceKey.toLowerCase()];
  const f = { ...DEFAULT_FACTS, ...factsIn };
  const brand = f.brand || 'NEXUS';
  const base = {
    what_it_is: `${brand} is the trust & compliance operating system for India\u2019s craft economy. It lets a verified maker \u2014 even with no paperwork \u2014 sell across ${f.verticals} verticals to buyers anywhere, with the platform acting as Merchant of Record: it carries the tax and legal weight, verifies provenance, and settles money to the maker\u2019s bank in ~${f.payout_days} days. The platform is never in loss, and consent + child-safety are inviolable.`,
    how_it_grows: flywheel(),
    honest_status: honestStatus(f),
  };

  const byAudience = {
    [AUDIENCE.INVESTOR]: {
      headline: 'A trust layer for a $40B+ craft economy that no marketplace serves.',
      how_it_helps_you: [
        `Software economics on a commerce problem: ~${f.blended_margin_pct}% blended gross margin, modelled per vertical.`,
        `Revenue is diversified: ${f.commission_pct}% commission (vs ${f.marketplace_take_pct}% at marketplaces) + seller subscriptions + facilitation fees + a fair share of value the platform uniquely creates (verified green premium, CSR matchmaking).`,
        'Defensible: provenance data + a cross-vertical flywheel + ONDC-portable reputation compound into a moat.',
        'Capital-efficient: AI-operated, solo-founded, with the engine already built and verified.',
      ],
      cta: 'The ask is not more product \u2014 it\u2019s one funded pilot + legal sign-off to turn a verified engine into a proven business.',
    },
    [AUDIENCE.SELLER]: {
      headline: 'Keep your craft, your language, and almost all of your money.',
      how_it_helps_you: [
        `You keep ~${100 - f.commission_pct}% of the sale \u2014 the platform takes only ${f.commission_pct}%, not the ${f.marketplace_take_pct}% marketplaces take.`,
        'No GST number, no company, no export licence needed \u2014 the platform handles tax and legal as Merchant of Record, so the liability is never yours.',
        `You\u2019re paid to your bank in ~${f.payout_days} days.`,
        `List in your own language (${f.languages} supported), by voice if you can\u2019t read.`,
        'Verified provenance lets you charge what your work is truly worth; the platform also matches you to government schemes you qualify for.',
      ],
      cta: 'Join a pilot cluster and sell your first verified piece to a buyer abroad.',
    },
    [AUDIENCE.BUYER]: {
      headline: 'Real makers, real provenance \u2014 verified, not promised.',
      how_it_helps_you: [
        'Every maker and product is verified \u2014 a real GI-tagged Banarasi is provably real, not a knock-off.',
        'Reviews are verified-purchase only, so ratings you read are from real buyers.',
        'Buyer protection + insurance on high-value items, and a clear returns/grievance path.',
        'Your money reaches the maker fairly \u2014 you\u2019re buying ethically, with the story and provenance attached.',
      ],
      cta: 'Browse verified craft and meet the maker behind each piece.',
    },
    [AUDIENCE.PARTNER_SHOWROOM]: {
      headline: 'Stock verified, story-backed craft with zero sourcing risk.',
      how_it_helps_you: [
        'Source authenticated, provenance-verified craft on consignment or wholesale \u2014 no vetting burden.',
        'Compliance, tax, and provenance are handled by the platform, not you.',
        'Each piece comes with a verifiable story your customers will pay a premium for.',
      ],
      cta: 'Become a stocking partner and add a verified-craft line.',
    },
    [AUDIENCE.PARTNER_TRAVEL]: {
      headline: 'Offer authentic craft experiences your travellers can\u2019t find elsewhere.',
      how_it_helps_you: [
        'Sell safety-gated, verified craft journeys (the tourism vertical) to your travellers for commission.',
        'The platform handles the maker, the verification, and the safety checks \u2014 you bring the guest.',
        'Differentiate your itineraries with genuine, ethical, on-the-ground craft.',
      ],
      cta: 'List craft experiences for your travellers.',
    },
    [AUDIENCE.PARTNER_CREATOR]: {
      headline: 'Tell a real maker\u2019s story your audience will love \u2014 and earn from it.',
      how_it_helps_you: [
        'Feature verified makers and journeys to your audience for an affiliate share.',
        'Verified provenance gives you a story you can stand behind, not a sponsored claim.',
        'Content that does good \u2014 your audience supports real artisans.',
      ],
      cta: 'Join the creator programme and share a maker\u2019s story.',
    },
    [AUDIENCE.PARTNER_SOCIAL]: {
      headline: 'Plug verified Indian craft into your storefront via one feed.',
      how_it_helps_you: [
        'Syndicate verified listings onto your surface \u2014 you bring the audience, the platform brings trusted supply.',
        'Listings arrive with provenance and fulfilment handled.',
        'ONDC-aligned, so it slots into the open network.',
      ],
      cta: 'Integrate the verified-craft feed.',
    },
    [AUDIENCE.GOVERNMENT]: {
      headline: 'Formalises informal artisans \u2014 compliant, GI-protected, on the open network.',
      how_it_helps_you: [
        'Brings undocumented artisans into the tax-compliant economy (GST/TCS handled correctly as Merchant of Record).',
        'Protects GI heritage with verified provenance and authorised-user checks.',
        'ONDC-aligned and drives uptake of artisan welfare schemes (TRIFED, KVIC, CSR Sec-135).',
        'Supports rural and women-led livelihoods and export earnings \u2014 with auditable, honest reporting.',
      ],
      cta: 'Pilot with one craft cluster under a state handicraft board.',
    },
  };

  const a = byAudience[audienceKey];
  if (!a) return { error: `Unknown audience: ${audienceKey}`, audiences: Object.values(AUDIENCE) };
  return { audience: audienceKey, ...a, ...base };
}

/** deck — a quick multi-audience overview (e.g. for a general landing). */
function deck(factsIn = {}) {
  return Object.values(AUDIENCE).map((aud) => {
    const p = present(aud, factsIn);
    return { audience: aud, headline: p.headline };
  });
}

module.exports = { AUDIENCE, DEFAULT_FACTS, flywheel, present, deck };
