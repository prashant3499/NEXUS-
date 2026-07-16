'use strict';

/**
 * growthAgent.js
 *
 * The agent that grows sales — for the platform AND its makers. It exists
 * because the hard, scarce side of this business is DEMAND, not supply. It does
 * the parts of demand-generation that software genuinely can: match a maker to
 * the channels that fit, surface the government/ONDC programs built for exactly
 * this, and produce a prioritized growth plan.
 *
 * THE HONEST BOUNDARY (consistent with every agent here): it SURFACES and
 * ROUTES; it does not fabricate demand. It cannot make a buyer appear. Joining
 * GeM, enrolling on ONDC, or applying to a scheme needs real registration and
 * credentials the founder/maker holds — the agent prepares and tracks, the
 * human completes. A growth agent that pretended to "generate sales" would be
 * the dishonest thing this platform refuses to be.
 *
 * Composes the existing demand infrastructure: customerSourcing (private
 * partners), schemes (eligibility), and ondc (open-network publishing). Adds the
 * GOVERNMENT-PLATFORM partnering catalog, which is the highest-leverage,
 * lowest-cost demand channel for Indian craft.
 *
 * Pure + dependency-free (composes injected/required pure modules).
 */

const customerSourcing = require('./customerSourcing');
const ondc = require('./ondc');

// Government & institutional demand channels — built for craft, underused.
// Each: what it is, who it suits, what it requires, the demand it brings.
const GOV_CHANNELS = Object.freeze({
  ondc: {
    label: 'ONDC (Open Network for Digital Commerce)',
    suits: ['all'],
    brings: 'Exposure to every buyer app on the open network — the widest demand reach, and reputation that stays portable.',
    requires: 'ONDC participant onboarding + a real gateway key (human/credential task).',
    leverage: 'highest',
    action: 'enroll_and_publish_catalog',
  },
  gem: {
    label: 'GeM (Government e-Marketplace)',
    suits: ['handicraft', 'gi', 'naturals', 'services'],
    brings: 'Government & PSU procurement demand — large, recurring, less price-sensitive orders.',
    requires: 'Seller registration on GeM with entity + GST (human task).',
    leverage: 'high',
    action: 'register_as_gem_seller',
  },
  trifed: {
    label: 'TRIFED / Tribes India',
    suits: ['handicraft', 'gi', 'naturals'],
    brings: 'Tribal-craft buyer demand + government emporium and exhibition channels.',
    requires: 'Artisan/SHG empanelment with TRIFED (human task).',
    leverage: 'high',
    action: 'empanel_with_trifed',
  },
  odop: {
    label: 'ODOP (One District One Product)',
    suits: ['gi', 'handicraft', 'naturals'],
    brings: 'State-backed promotion + buyer events for a district\u2019s signature craft.',
    requires: 'District product alignment + state ODOP cell contact (human task).',
    leverage: 'medium',
    action: 'align_with_district_odop',
  },
  epch: {
    label: 'EPCH (Export Promotion Council for Handicrafts)',
    suits: ['handicraft', 'gi', 'jewellery'],
    brings: 'Export buyer demand via IHGF fairs + international buyer-seller meets.',
    requires: 'EPCH membership + IEC for export (human task).',
    leverage: 'high',
    action: 'join_epch_and_fairs',
  },
  emporium: {
    label: 'State Emporiums & Craft Melas',
    suits: ['handicraft', 'gi', 'naturals', 'jewellery'],
    brings: 'Footfall demand at government emporiums, Dilli Haat, and craft fairs.',
    requires: 'Stall/consignment arrangement with the state handicrafts board (human task).',
    leverage: 'medium',
    action: 'arrange_emporium_consignment',
  },
});

function govChannelsFor(vertical) {
  return Object.entries(GOV_CHANNELS)
    .filter(([, c]) => c.suits.includes('all') || c.suits.includes(vertical))
    .map(([key, c]) => ({ key, ...c }));
}

const LEVERAGE_RANK = { highest: 0, high: 1, medium: 2, low: 3 };

/**
 * growthPlan — a prioritized demand-growth plan for a maker (or the platform).
 * @param ctx { vertical, archetype?, isExport?, hasEntity?, hasIEC? }
 */
function growthPlan(ctx = {}) {
  const vertical = ctx.vertical || 'handicraft';
  // Government / open-network channels (the high-leverage, low-cost demand).
  const gov = govChannelsFor(vertical).sort((a, b) => LEVERAGE_RANK[a.leverage] - LEVERAGE_RANK[b.leverage]);
  // Private partner channels from the existing sourcing engine.
  const partners = (customerSourcing.allPartnerPlans ? customerSourcing.allPartnerPlans() : []);
  // ONDC publishing readiness (the single widest reach).
  const ondcReady = !!(ctx.ondcGatewayKey);

  // Honest gating: which actions the agent can prep vs which need the human.
  const steps = [];
  steps.push({ priority: 1, channel: 'ondc', action: 'Enroll + publish catalog to ONDC', who: ondcReady ? 'agent_can_prepare' : 'founder', note: ondcReady ? 'Catalog can be built now; activation needs the live gateway.' : 'Needs ONDC participant onboarding + gateway key (founder).' });
  for (const g of gov.filter((x) => x.key !== 'ondc').slice(0, 3)) {
    steps.push({ priority: 2, channel: g.key, action: g.label + ' \u2014 ' + g.action.replace(/_/g, ' '), who: 'founder', note: g.requires });
  }
  steps.push({ priority: 3, channel: 'private_partners', action: 'Activate a creator + a boutique partner for the demand niche', who: 'agent_can_prepare', note: 'Agent drafts outreach + affiliate terms; founder closes the relationship.' });

  return {
    for: ctx.archetype || 'maker',
    vertical,
    headline: 'Demand is the scarce side. These are the channels that bring buyers — government and open-network first (highest leverage, lowest cost), private partners second.',
    government_and_network_channels: gov,
    private_partner_channels: partners.map((p) => ({ segment: p.segment, who: p.who, hook: p.hook })),
    prioritized_steps: steps,
    honest_note: 'This agent surfaces and routes demand; it cannot manufacture it. Enrolling on these platforms needs real registration + credentials the founder/maker holds. The first proof is still a pilot: real buyers paying a premium become the story that powers every channel above.',
  };
}

/**
 * salesLift — for a single maker, the concrete levers to lift THEIR sales,
 * using only what the platform genuinely provides.
 */
function salesLift(maker = {}) {
  return {
    maker: maker.name || 'this maker',
    levers: [
      { lever: 'Verified provenance', effect: 'Lets the maker charge a premium proven authenticity commands.' },
      { lever: 'AI listing + photo guidance', effect: 'Turns a non-literate maker\u2019s few words into a listing that converts.' },
      { lever: 'Verified-purchase reviews', effect: 'Real ratings convert browsers; fake ones can\u2019t exist here.' },
      { lever: 'ONDC reach', effect: 'One catalog, visible across the open network\u2019s buyer apps.' },
      { lever: 'Government channels', effect: 'GeM / TRIFED / EPCH bring institutional + export demand the maker can\u2019t reach alone.' },
    ],
    honest_note: 'These lift conversion and reach for demand that exists. None create demand from nothing — the maker\u2019s craft and a real buyer niche still have to meet.',
  };
}

module.exports = { GOV_CHANNELS, govChannelsFor, growthPlan, salesLift };
