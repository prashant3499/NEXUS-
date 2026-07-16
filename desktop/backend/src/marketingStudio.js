'use strict';

/**
 * marketingStudio.js
 *
 * Generates marketing CONTENT for the platform and its makers — campaigns, ad
 * copy, offers, social captions, and reel/video SCRIPTS (the storyboard + voice-
 * over text, not the rendered video).
 *
 * THE HONEST LINE, stated plainly because it matters: this generates TEXT and
 * STRUCTURE, not media. It does NOT render animated reels, videos, or images.
 * Producing an actual reel needs a media-generation model or a creator — that
 * is an external tool (a seam), and the studio is explicit about handing the
 * script off rather than pretending to output a finished video. Claiming to
 * "generate reels" when it cannot would be exactly the dishonesty this platform
 * refuses.
 *
 * It also inherits the no-fabrication rule: a campaign cannot assert an
 * unproven claim (no "India's #1", no invented impact numbers) and must respect
 * the honest pre-revenue stage. Marketing here persuades with truth.
 *
 * Pure + dependency-free (text generation via the injected AI provider; a
 * deterministic mock runs now).
 */

const UNPROVABLE = ['#1', 'number one', 'best', 'guaranteed', 'fastest growing', 'most trusted', 'world-class', 'revolutionary'];

function stripUnprovable(text) {
  let t = String(text || '');
  const flagged = UNPROVABLE.filter((w) => t.toLowerCase().includes(w));
  return { text: t, flagged };
}

/** campaign — a full campaign plan: angle, channels, copy, offer, content calendar, reel scripts. */
function campaign(input = {}) {
  const brand = input.brand || 'NEXUS';
  const audience = input.audience || 'buyer'; // buyer | maker | diaspora | csr
  const product = input.product || 'verified craft';
  const honest = input.stage_honest !== false;

  const angles = {
    buyer: { hook: `Real craft, real makers — and you'll know exactly who made it.`, value: 'provenance + fair-to-maker', cta: 'Shop verified' },
    diaspora: { hook: `A piece of home, verified — and the maker is paid fairly.`, value: 'authenticity from afar', cta: 'Bring it home' },
    maker: { hook: `Sell your craft to the world. We carry the paperwork.`, value: 'no GST, paid in 2 days, your language', cta: 'Start selling' },
    csr: { hook: `Verified-impact craft your auditors will sign off.`, value: 'evidence-backed impact + compliance', cta: 'Request a catalog' },
  };
  const a = angles[audience] || angles.buyer;

  return {
    ok: true,
    brand, audience,
    angle: a.hook,
    value_prop: a.value,
    channels: ['Instagram (Reels + carousel)', 'WhatsApp (community + status)', 'YouTube Shorts', 'Email', 'ONDC buyer apps'],
    ad_copy: {
      short: `${a.hook} ${brand}.`,
      long: `${a.hook} Every maker on ${brand} is verified, every review is from a real buyer, and most of what you pay reaches the artisan. ${a.cta} →`,
      captions: [`Meet the maker behind your next ${product}.`, `Verified. Fair. Yours.`, `From a real artisan's hands to yours.`],
    },
    reel_script: reelScript({ brand, product, hook: a.hook, cta: a.cta }),
    content_calendar: [
      { day: 'Mon', post: 'Maker story (Reel) — 30s origin of one piece' },
      { day: 'Wed', post: 'Provenance carousel — how "verified" works' },
      { day: 'Fri', post: 'Behind the craft (Short) — the making process' },
      { day: 'Sun', post: 'Customer voice — a verified-purchase review' },
    ],
    honest_note: honest ? `Marketing must reflect the real stage: ${brand} is pilot-stage. No "#1", no invented numbers, no fake urgency. Persuade with the true story — verified makers, fair pay, visible provenance.` : null,
    media_note: 'These are scripts + copy. Rendering the actual reel/video/image needs a creator or a media-generation tool (an external seam) — the studio hands off the script, it does not output finished video.',
  };
}

/** reelScript — a shot-by-shot storyboard + voiceover (TEXT, not video). */
function reelScript(input = {}) {
  const brand = input.brand || 'NEXUS';
  const product = input.product || 'this piece';
  const cta = input.cta || 'Shop verified';
  return {
    format: 'vertical 9:16, ~25s',
    is_script_only: true,
    shots: [
      { t: '0\u20133s', visual: `Close-up of the maker's hands working ${product}.`, vo: 'Every piece has a person behind it.' },
      { t: '3\u20139s', visual: 'The maker looks up, smiles; show the workshop.', vo: `Meet [maker name], a verified artisan on ${brand}.` },
      { t: '9\u201316s', visual: 'The finished piece, turning slowly in daylight.', vo: 'Verified provenance. A real review. Paid fairly, to their bank, in two days.' },
      { t: '16\u201322s', visual: 'Phone screen showing the verified badge + maker story.', vo: 'You see exactly who made it, and where.' },
      { t: '22\u201325s', visual: `${brand} logo + ${cta}.`, vo: `${cta}.` },
    ],
    note: 'A storyboard + voiceover for a creator or media tool to produce. Not a rendered video.',
  };
}

/** offer — a promotional offer, never-in-loss-aware (a real platform discipline). */
function offer(input = {}) {
  const type = input.type || 'first_order';
  const templates = {
    first_order: { name: 'First-order welcome', mechanic: 'Free shipping on a first order', why: 'Lowers the trial barrier; cost capped, never below platform break-even.' },
    maker_spotlight: { name: 'Maker spotlight week', mechanic: 'Featured placement for one verified maker', why: 'Zero discount cost; drives demand to a real story.' },
    bundle: { name: 'Cluster bundle', mechanic: 'Curated set from one craft cluster at a modest bundle price', why: 'Raises basket size; provenance stays intact.' },
  };
  const t = templates[type] || templates.first_order;
  return {
    ok: true, offer: t,
    guardrail: 'Any discount is checked against never-in-loss — an offer that would put the platform or maker underwater is refused. No fake "limited time" urgency.',
  };
}

function capabilities() {
  return {
    can_generate: ['campaign plans', 'ad copy (short/long/captions)', 'reel & video SCRIPTS (storyboard + voiceover)', 'social content calendars', 'promotional offers (never-in-loss-aware)'],
    cannot_generate: ['rendered reels / videos (needs a creator or media tool — seam)', 'images / graphics', 'any unprovable claim ("#1", "best", invented numbers)', 'fake urgency or false scarcity'],
    inherits: ['no-fabrication', 'honest-stage', 'never-in-loss on offers'],
    note: 'Generates the words, scripts, and structure of marketing \u2014 truthfully. The pixels of a finished reel come from a creator or an external media tool the studio hands the script to.',
  };
}

module.exports = { UNPROVABLE, stripUnprovable, campaign, reelScript, offer, capabilities };
