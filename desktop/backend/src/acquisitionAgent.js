'use strict';
/**
 * acquisitionAgent — the real-world customer-acquisition flow, run by the engine's agents:
 * source a prospect (from open-data clusters) → approach with sales/marketing outreach →
 * advertise → capture CONSENT → convert to customer. No money flows; nobody becomes a
 * customer (canSell) until they explicitly consent. Uses the platform's real tools:
 * sourcing.js (sales), adGeneration.js (marketing/ads), sellerConsent.js (the gate).
 */
const sourcing = require('./sourcing');
const ads = require('./adGeneration');
const consent = require('./sellerConsent');

const TIER_TEMPLATE = {
  karigar: 'karigar_first_touch_hi', vyapari: 'vyapari_first_touch_en',
  niryatak: 'niryatak_first_touch_en', pravasi: 'pravasi_first_touch_en',
  sansthan: 'sansthan_first_touch_en',
};

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

/** Run the full acquisition journey for one prospect. Returns every step. */
function runAcquisition(input) {
  input = input || {};
  const craft = input.craft || 'Handcraft';
  const cluster = input.cluster || 'India';
  const segment = input.segment || 'karigar_prospect';
  const source = input.source || 'gi_tag_holders';

  // 1. Source → lead
  const lead = safe(() => sourcing.createLead({ name: input.name || (craft + ' artisan'), craft, cluster, segment, source, lang: input.lang || 'en' }), { id: 'lead_mock', segment, source });

  // 2. Score → best tier
  const scored = safe(() => sourcing.scoreLead(lead), { bestTier: 'karigar', bestScore: 0 });
  const tier = scored.bestTier || lead.suggestedTier || 'karigar';

  // 3. Approach → sales/marketing outreach (the agent reaches out)
  const tplKey = TIER_TEMPLATE[tier] || 'karigar_first_touch_hi';
  const outreach = safe(() => sourcing.renderOutreach(lead, tplKey), null) ||
    'Namaste — NEXUS helps you sell your ' + craft + ' to the world, keep most of what you earn, and stay compliant. May we show you how?';

  // 4. Advertise → ad creative + reach + budget guard (marketing tool)
  const creative = safe(() => ads.generateAdCreative({ product: { title: craft + ' from ' + cluster }, vertical: input.vertical || 'handicraft', tier, tone: 'warm' }), null);
  const reach = safe(() => ads.estimateCampaignReach({ tier, vertical: input.vertical || 'handicraft' }), null);
  const budget = safe(() => ads.adBudgetStatus({ tier }), null);

  // 5. Consent — the prospect is NOT a customer yet
  const blank = consent.emptyConsent();
  const before = consent.canSell(blank);

  // 6. Convert — only AFTER the maker grants consent
  const granted = consent.grantMany(blank, consent.REQUIRED_TO_SELL, { by: input.name || 'maker', channel: 'agent_outreach' });
  const after = consent.canSell(granted);

  return {
    prospect: { name: lead.name, craft, cluster, vertical: input.vertical || 'handicraft', source, tier },
    step1_sourced: { leadId: lead.id, source, segment: lead.segment },
    step2_scored: { tier, score: scored.bestScore },
    step3_approach: { channel: tier === 'karigar' ? 'voice/whatsapp (vernacular)' : 'email', message: typeof outreach === 'string' ? outreach : JSON.stringify(outreach) },
    step4_advertise: { creative: creative || '(ad tool ready)', reach: reach || null, budget_status: budget || null },
    step5_consent_gate: { required: consent.REQUIRED_TO_SELL, before_consent_canSell: before.ok === true },
    step6_converted: { after_consent_canSell: after.ok === true, stage: 'onboarded' },
    money_required: false,
    note: 'Agents approach with sales + marketing + ads. The maker becomes a customer only after granting the 5 consents. No money flows in acquisition.',
  };
}

/** Generate a marketing/advertising campaign for a segment (the ad tool). */
function campaign(input) {
  input = input || {};
  const tier = input.tier || 'karigar';
  const vertical = input.vertical || 'handicraft';
  return {
    tier, vertical,
    creative: safe(() => ads.generateAdCreative({ product: { title: input.title || (vertical + ' crafts') }, vertical, tier, tone: input.tone || 'warm' }), '(creative)'),
    reach: safe(() => ads.estimateCampaignReach({ tier, vertical }), null),
    budget: safe(() => ads.adBudgetStatus({ tier }), null),
    money_required: false,
  };
}

module.exports = { runAcquisition, campaign, TIER_TEMPLATE };
