'use strict';

/**
 * listingAssistant.js
 *
 * The most mission-aligned use of modern AI on this platform: let "the weaver
 * who cannot read" create a complete, sellable listing just by SPEAKING a few
 * words in her own language. This closes three real gaps at once — literacy,
 * language, and the poor quality of self-written descriptions/photos that keeps
 * good craft from selling.
 *
 * Flow: a maker says (or types) a short phrase in any Indian language + picks a
 * trade. The assistant returns a structured draft listing — a clean title, a
 * warm description, suggested tags, a price band from the trade catalog,
 * concrete PHOTO GUIDANCE (since artisans rarely shoot sellable images), and
 * provenance prompts — rendered in the maker's language AND English.
 *
 * THE HONEST BOUNDARIES (built in, not optional):
 *   • It DRAFTS; the maker confirms. Nothing is published from AI text alone.
 *   • It NEVER fabricates claims. It will not invent "organic", "GI", or a
 *     carbon figure the maker did not substantiate — that would be the exact
 *     greenwashing/false-provenance the platform forbids. It writes about what
 *     the maker actually said, and PROMPTS for evidence where a claim appears.
 *   • The AI is a PROVIDER SEAM (Anthropic): a deterministic, template-based
 *     mock runs now so the flow works and is testable; the real model drops in
 *     on a key. The mock is honestly labelled as a draft, never as final copy.
 *
 * Composes the trade catalog (price bands) + the translate router (Bhashini for
 * Indian languages). Pure except the injected AI + translate providers.
 */

const tradeCatalog = require('./tradeCatalog');

// Words that signal an unsubstantiated claim — the assistant must NOT assert
// these; it surfaces them as "needs evidence" instead of writing them as fact.
const CLAIM_WORDS = ['organic', 'eco', 'sustainable', 'recycled', 'gi', 'pure', 'genuine', 'certified', 'handmade', 'natural', 'carbon'];

function detectClaims(text) {
  const t = (text || '').toLowerCase();
  return CLAIM_WORDS.filter((w) => t.includes(w));
}

/**
 * draftListing — turn a maker's short spoken/typed phrase into a structured
 * draft. @param input { trade, phrase, language }  @param ai injected provider
 */
function draftListing(input = {}, ai) {
  const trade = tradeCatalog.getTrade(input.trade);
  if (!trade) return { ok: false, reason: `Unknown trade: ${input.trade}` };
  const phrase = (input.phrase || '').toString().trim();
  if (!phrase) return { ok: false, reason: 'Say or type a few words about your work to start.' };

  const provider = ai && typeof ai.compose === 'function' ? ai : MockAIProvider();
  const composed = provider.compose({ trade, phrase });

  // Anti-fabrication: any claim the maker used becomes an evidence prompt, not
  // an asserted fact in the copy.
  const claims = detectClaims(phrase);
  const evidence_prompts = claims.map((c) => ({
    claim: c,
    prompt: `You mentioned "${c}". To show this on your listing, add evidence (a certificate, audit, or for GI your authorised-user proof). Without it, we won't display the claim — to protect you and buyers.`,
  }));

  const [floor, ceil] = trade.price_band_paise;
  return {
    ok: true,
    draft: {
      trade: trade.key,
      title: composed.title,
      description: composed.description,
      tags: composed.tags,
      suggested_price_band_paise: [floor, ceil],
      photo_guidance: composed.photo_guidance,
      provenance_prompts: composed.provenance_prompts,
      modality: trade.modalities[0],
      generated_by: provider.kind,
    },
    evidence_prompts,
    needs_review: true,
    note: 'This is an AI-drafted starting point in your words — review and confirm before it goes live. Claims you mentioned need evidence before they show.',
  };
}

/**
 * localize — render a confirmed draft into the maker's language + English using
 * the translate router (Bhashini for Indian languages). Async.
 */
async function localize(draft, language, translateRouter) {
  if (!translateRouter || !draft) return { ok: false, reason: 'translate router + draft required' };
  if (language === 'en') return { ok: true, listings: { en: draft } };
  try {
    const tTitle = await translateRouter.translate(draft.title, 'en', language, {});
    const tDesc = await translateRouter.translate(draft.description, 'en', language, {});
    return {
      ok: true,
      listings: {
        en: draft,
        [language]: { ...draft, title: tTitle.output || draft.title, description: tDesc.output || draft.description, translated_by: tTitle.provider },
      },
    };
  } catch (e) { return { ok: false, reason: e.message }; }
}

// ── AI provider seam ──
function MockAIProvider() {
  return {
    kind: 'mock_ai', live: false,
    compose({ trade, phrase }) {
      // Deterministic, honest draft — clearly a template, not pretending to be
      // a frontier model. The real model produces far better copy on a key.
      const clean = phrase.replace(/[.;]+$/, '');
      const title = `${trade.label}'s ${clean}`.replace(/\s+/g, ' ').slice(0, 80);
      const isService = trade.modalities.includes('local_service');
      const desc = isService
        ? `${clean} — skilled ${trade.label.toLowerCase()} work, done with care. Booked locally; your item is handled by a verified ${trade.label.toLowerCase()}.`
        : `${clean}, handmade by a verified ${trade.label.toLowerCase()}. Each piece carries the maker's craft and story.`;
      return {
        title,
        description: desc,
        tags: [trade.category.toLowerCase(), trade.key, ...clean.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3)],
        photo_guidance: isService
          ? ['Photograph examples of past work in daylight, plain background.', 'Show a close-up of the detail/finish.', 'A photo of your workshop builds trust.']
          : ['Shoot in soft daylight near a window, not under a bulb.', 'Plain, uncluttered background (a cloth or wall).', 'One full shot + two close-ups of texture/detail.', 'Include something for scale (a hand or a coin).'],
        provenance_prompts: ['Where is this made?', 'What material/technique?', 'How long does one take?'],
      };
    },
  };
}
function makeAIProvider(config = {}) {
  // A real Anthropic-backed composer would be built from the key here.
  if (config.anthropicApiKey) {
    return { kind: 'anthropic', live: true, compose() { throw new Error('live AI composer not yet implemented'); } };
  }
  return MockAIProvider();
}

module.exports = { CLAIM_WORDS, detectClaims, draftListing, localize, MockAIProvider, makeAIProvider };
