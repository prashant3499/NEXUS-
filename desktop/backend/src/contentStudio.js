'use strict';

/**
 * contentStudio.js
 *
 * "What can the AI content agent actually build?" This is the single answer: a
 * map of every content type the platform can generate, who it's for, the
 * generator behind it, and — honestly — whether it runs on a real model now or
 * is a seam waiting for a key.
 *
 * It does not re-implement the generators; it catalogs and routes to them
 * (listingAssistant, presentationAgent, growthAgent, governmentLiaisonAgent),
 * so there is one place to see and exercise the AI's content capability.
 *
 * Honest boundaries it surfaces:
 *   • Generators that write copy (listings, presentations, outreach) work now
 *     via a deterministic mock and become richer on a real model key.
 *   • It NEVER fabricates claims (the listing assistant turns claim-words into
 *     evidence prompts) and NEVER overstates stage (presentations carry the
 *     honest-status slide). Those guarantees are inherited, not bypassed.
 *   • It does NOT generate images, audio, or video — only structured text/copy.
 *     Honest about what it cannot do.
 *
 * Pure orchestration over the required generators.
 */

const listingAssistant = require('./listingAssistant');
const presentationAgent = require('./presentationAgent');
const growthAgent = require('./growthAgent');
const governmentLiaison = require('./governmentLiaisonAgent');

// FOR = who the content serves.
const FOR = Object.freeze({ MAKER: 'maker', BUYER: 'buyer', PLATFORM: 'platform', GOVERNMENT: 'government', PARTNER: 'partner' });

const CATALOG = Object.freeze([
  { type: 'product_listing', for: FOR.MAKER, builds: 'A complete listing (title, description, tags, price band, photo guidance) from a maker\u2019s few spoken words, in any of 13 languages.', generator: 'listingAssistant.draftListing', live_on: 'Sarvam/Anthropic key + Bhashini', guarantee: 'Never fabricates claims \u2014 claim words become evidence prompts.' },
  { type: 'listing_translation', for: FOR.MAKER, builds: 'The listing rendered in the maker\u2019s language + English.', generator: 'listingAssistant.localize', live_on: 'Bhashini key' },
  { type: 'photo_guidance', for: FOR.MAKER, builds: 'Concrete shooting tips so a non-photographer makes sellable images.', generator: 'listingAssistant (within draft)', live_on: 'works now (rule-based + AI on key)' },
  { type: 'presentation', for: FOR.PLATFORM, builds: 'An audience-tailored deck (customer, maker, government, investor, partner) \u2014 brand-aware, instant.', generator: 'presentationAgent.present / deck', live_on: 'works now', guarantee: 'Always ends on an honest-status slide \u2014 never overstates.' },
  { type: 'growth_plan', for: FOR.PLATFORM, builds: 'A prioritized demand-channel plan (ONDC + government first), per vertical.', generator: 'growthAgent.growthPlan', live_on: 'works now' },
  { type: 'government_outreach', for: FOR.GOVERNMENT, builds: 'A tailored engagement package + draft outreach note for a specific body.', generator: 'governmentLiaison.prepareEngagement', live_on: 'works now', guarantee: 'Honest that the founder builds the relationship \u2014 not the AI.' },
  { type: 'sales_lift', for: FOR.MAKER, builds: 'The concrete levers to raise a maker\u2019s sales, using only real platform features.', generator: 'growthAgent.salesLift', live_on: 'works now' },
]);

// What it deliberately does NOT generate (honest).
const NOT_SUPPORTED = Object.freeze([
  'Images / product photos (it guides the maker to shoot; it does not generate fake product images).',
  'Audio or video.',
  'Any claim it cannot substantiate (no invented "organic"/"GI"/impact numbers).',
  'Legal documents as final (drafts only, marked for counsel).',
]);

function capabilities() {
  return {
    can_build: CATALOG,
    for_summary: {
      maker: CATALOG.filter((c) => c.for === FOR.MAKER).map((c) => c.type),
      platform: CATALOG.filter((c) => c.for === FOR.PLATFORM).map((c) => c.type),
      government: CATALOG.filter((c) => c.for === FOR.GOVERNMENT).map((c) => c.type),
    },
    cannot_build: NOT_SUPPORTED,
    note: 'Text/copy generation across maker, platform, and government needs \u2014 honest about claims, stage, and what it cannot produce (no images/audio/video).',
  };
}

/**
 * generate — route a content request to the right generator.
 * @param type   one of CATALOG.type
 * @param input  the generator's input
 * @param deps   { listingAI, translateRouter, brand }
 */
function generate(type, input = {}, deps = {}) {
  switch (type) {
    case 'product_listing':
      return listingAssistant.draftListing({ trade: input.trade, phrase: input.phrase, language: input.language }, deps.listingAI);
    case 'photo_guidance': {
      const r = listingAssistant.draftListing({ trade: input.trade, phrase: input.phrase || 'item' }, deps.listingAI);
      return r.ok ? { ok: true, photo_guidance: r.draft.photo_guidance } : r;
    }
    case 'presentation':
      return { ok: true, presentation: presentationAgent.present(input.audience || 'customer', { brand: deps.brand }) };
    case 'growth_plan':
      return { ok: true, plan: growthAgent.growthPlan({ vertical: input.vertical, archetype: input.archetype }) };
    case 'government_outreach':
      return { ok: true, package: governmentLiaison.prepareEngagement(input) };
    case 'sales_lift':
      return { ok: true, lift: growthAgent.salesLift(input.maker || {}) };
    default:
      return { ok: false, reason: `Unknown content type: ${type}. Options: ${CATALOG.map((c) => c.type).join(', ')}` };
  }
}

module.exports = { FOR, CATALOG, NOT_SUPPORTED, capabilities, generate };
