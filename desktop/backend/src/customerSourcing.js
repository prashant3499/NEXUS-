'use strict';

/**
 * customerSourcing.js
 *
 * "Source customers across all verticals and add them." The platform already
 * has autoSource (finds candidate SELLERS) and prospectDb (the CRM pipeline).
 * What was missing is the strategy layer: for each of the seven verticals, WHO
 * the customers are (buyers AND sellers), WHERE to find them, and the CHANNEL
 * + MESSAGE that actually lands — then a way to turn that into prospect records
 * the pipeline can work.
 *
 * Each vertical reaches a different customer through a different door. This
 * module encodes that so sourcing is targeted, not generic spray.
 *
 * Pure + dependency-free. The server feeds generated prospects into prospectDb
 * and keeps the founder in the loop before any outreach is sent.
 */

// Per-vertical sourcing playbook. For each vertical:
//   buyer / seller — who the customer is
//   channels       — where to actually reach them
//   hook           — the message that lands for this audience
const SOURCING = Object.freeze({
  gems: {
    seller_where: ['GJEPC member directory', 'Jaipur/Surat gem clusters', 'certified-lab partner referrals'],
    buyer_where: ['B2B gem-trade networks', 'high-intent search', 'jeweller wholesalers'],
    channel: 'b2b_directory', hook: 'Verifiable, escrow-safe, lab-graded stones — sell abroad with zero compliance burden.',
  },
  jewellery: {
    seller_where: ['BIS-hallmark jewellers', 'Jaipur/Delhi clusters', 'craft fairs'],
    buyer_where: ['Instagram/Pinterest', 'festive & wedding moments', 'diaspora gifting'],
    channel: 'social_visual', hook: 'Beautiful, hallmark-assured pieces — buy with confidence, return with ease.',
  },
  gi: {
    seller_where: ['GI Registry holders', 'cluster cooperatives', 'state handicraft boards'],
    buyer_where: ['diaspora associations', 'conscious-shopper communities', 'origin-story content'],
    channel: 'provenance_story', hook: 'The real thing, from the real place, from the named maker — verified.',
  },
  handicraft: {
    seller_where: ['EPCH member directory', 'cluster artisans', 'self-help groups'],
    buyer_where: ['marketplaces + ONDC', 'home-decor editorial', 'gifting'],
    channel: 'marketplace_editorial', hook: 'Handmade, affordable, alive — shop the room, support the maker.',
  },
  naturals: {
    seller_where: ['FPO database', 'tribal cooperatives (TRIFED)', 'organic-certified growers'],
    buyer_where: ['wellness & eco communities', 'sustainability content', 'D2C subscription'],
    channel: 'values_community', hook: 'Good for you, good for the earth, good for the maker.',
  },
  tourism: {
    seller_where: ['heritage-craft hosts', 'homestay networks', 'tour operators'],
    buyer_where: ['diaspora', 'experience-seeker travel creators', 'tourism boards', 'heritage hotels'],
    channel: 'experiential_partner', hook: "Don't just buy the craft — sit at the loom with the maker.",
  },
  environment: {
    seller_where: ['regenerative-material makers', 'upcycling collectives', 'eco-certified producers'],
    buyer_where: ['CSR officers (Sec 135)', 'ESG-mandated corporate buyers', 'impact investors'],
    channel: 'institutional_esg', hook: 'Verified green, carbon-attributed, audit-ready — meet your ESG/CSR goals through craft.',
  },
});

const AUDIENCE = Object.freeze({ SELLER: 'seller', BUYER: 'buyer', PARTNER: 'partner' });

// Partner / channel segments — not sellers or end-buyers, but the distribution
// and demand partners that bring the platform reach. Each is a real go-to-market
// channel with its own hook and economics.
const PARTNERS = Object.freeze({
  showroom: {
    who: 'Physical craft shops, boutiques, hotel & airport retail, museum stores',
    where: ['craft retail associations', 'boutique-hotel groups', 'airport/duty-free retail', 'museum & heritage-site stores'],
    channel: 'b2b2c_reseller', model: 'They stock verified-provenance craft on consignment or wholesale; the platform supplies catalog + provenance + fulfilment.',
    hook: 'Stock verified, story-backed craft with zero sourcing risk — provenance and compliance handled.',
  },
  travel_agent: {
    who: 'Travel agents, tour operators, DMCs, experience planners',
    where: ['IATA/TAAI agent directories', 'inbound tour operators', 'destination management companies', 'luxury travel networks'],
    channel: 'tourism_distribution', model: 'They sell the craft-journey experiences (the tourism vertical) to their travellers; the platform supplies the verified, safety-gated experiences and pays commission.',
    hook: 'Offer authentic, safety-verified craft experiences your travellers can\u2019t find elsewhere — we handle the maker, you bring the guest.',
  },
  creator: {
    who: 'Bloggers, travel/craft creators, influencers, niche publishers',
    where: ['craft & travel content creators', 'diaspora community pages', 'sustainability publishers', 'regional-language creators'],
    channel: 'affiliate_social', model: 'They feature makers and journeys to their audience for an affiliate share; verified provenance gives them a story worth telling.',
    hook: 'Tell a real maker\u2019s story your audience will love — earn a share, with provenance you can stand behind.',
  },
  social_platform: {
    who: 'Social commerce surfaces (WhatsApp/Instagram shops, marketplaces, ONDC apps)',
    where: ['WhatsApp Business catalog', 'Instagram/Facebook Shops', 'ONDC buyer apps', 'regional marketplaces'],
    channel: 'social_commerce', model: 'The platform syndicates verified listings onto these surfaces; they bring the audience, the platform brings trusted supply.',
    hook: 'Plug verified Indian craft into your storefront — listings, provenance, and fulfilment via one feed.',
  },
});

/**
 * sourcingPlan — for a vertical, the where/channel/hook for an audience.
 */
function sourcingPlan(vertical, audience = AUDIENCE.SELLER) {
  const s = SOURCING[vertical];
  if (!s) return null;
  return {
    vertical, audience,
    where: audience === AUDIENCE.BUYER ? s.buyer_where : s.seller_where,
    channel: s.channel, hook: s.hook,
  };
}

/**
 * allVerticalPlans — the complete sourcing map across every vertical, for an
 * audience. This is the "source across all verticals" overview.
 */
function allVerticalPlans(audience = AUDIENCE.SELLER) {
  return Object.keys(SOURCING).map((v) => sourcingPlan(v, audience));
}

/**
 * generateProspects — turn a sourcing plan into prospect records ready for the
 * CRM pipeline. Honest: these are SOURCING TARGETS (where to look), not real
 * contacts — the platform cannot invent real people. Each is a lead to pursue,
 * tagged with the vertical, channel, and the hook to open with. Nothing is
 * contacted until the founder approves.
 */
function generateProspects(vertical, audience = AUDIENCE.SELLER, now = Date.now()) {
  const plan = sourcingPlan(vertical, audience);
  if (!plan) return { ok: false, error: `unknown vertical: ${vertical}` };
  const prospects = plan.where.map((source, i) => ({
    id: `src_${vertical}_${audience}_${i}_${now}`,
    vertical, audience, source,
    channel: plan.channel, opening_hook: plan.hook,
    stage: 'sourced',
    is_target_not_contact: true,           // honest flag: a place to look, not a person
    note: `${audience === 'buyer' ? 'Buyer' : 'Seller'} sourcing target for ${vertical} via ${source}.`,
    created_at: now,
  }));
  return { ok: true, vertical, audience, count: prospects.length, prospects };
}

/**
 * partnerPlan — the go-to-market plan for a distribution/demand partner segment.
 */
function partnerPlan(segment) {
  const p = PARTNERS[segment];
  if (!p) return null;
  return { segment, who: p.who, where: p.where, channel: p.channel, model: p.model, hook: p.hook };
}

/** allPartnerPlans — every partner segment (the reach-expansion map). */
function allPartnerPlans() { return Object.keys(PARTNERS).map(partnerPlan); }

module.exports = { SOURCING, AUDIENCE, PARTNERS, sourcingPlan, allVerticalPlans, generateProspects, partnerPlan, allPartnerPlans };
