'use strict';
/**
 * creativeStudio — domain-expert idea agent for makers, per vertical.
 * Deterministic expertise now; in production this is augmented by the LLM
 * co-founder (ANTHROPIC_API_KEY) with the maker's real sales + region context.
 */
const IDEAS = {
  textile: [
    { area: 'palette', tip: 'Offer 2–3 contemporary colourways (muted-earth, indigo-white, festive) beside the traditional design; overseas buyers choose by decor.' },
    { area: 'range', tip: 'Extend one motif across stoles, cushion covers and table runners — same loom, more price points.' },
    { area: 'sustainability', tip: 'Add a natural-dye / organic-cotton line; it can command 20–40% more with a real story.' },
    { area: 'story', tip: 'Film the loom and your hands. "Fifteen days, one saree" is the premium.' },
  ],
  handicraft: [
    { area: 'forms', tip: 'Same craft, new shapes: planters, tableware sets, lamp bases. Function sells beside tradition.' },
    { area: 'bundles', tip: 'Build festive gift sets (diya + bowl + box) for higher cart value and easy gifting abroad.' },
    { area: 'finish', tip: 'Offer two or three signature finishes; charge a premium for the special one.' },
    { area: 'packaging', tip: 'Design breakage-safe packaging — safe arrival drives reviews and repeat sales.' },
  ],
  jewellery: [
    { area: 'range', tip: 'Add a lightweight, lower-price daily-wear line beside bridal pieces — far more buyers.' },
    { area: 'trust', tip: 'Lead with the BIS hallmark and metal purity; it removes the buyer\'s biggest fear.' },
    { area: 'personalisation', tip: 'Offer initials, names or birthstones to turn a product into a giftable premium.' },
    { area: 'export', tip: 'Design a contemporary, minimal line for overseas buyers; keep the traditional sets too.' },
  ],
  gems: [
    { area: 'trust', tip: 'List certified stones only — an independent lab certificate per stone is your trust engine.' },
    { area: 'data', tip: 'Show a 4Cs spec sheet with macro photos; value-stone buyers want data, not adjectives.' },
    { area: 'b2b', tip: 'Offer calibrated sizes to jewellery makers for a steady B2B channel (a Vyapari fit).' },
    { area: 'transparency', tip: 'State treatment and origin openly — that trust lets you price honestly and high.' },
  ],
  naturals: [
    { area: 'proof', tip: 'Prove the supply chain: show the farm, the process and any certification — that is the value.' },
    { area: 'format', tip: 'Offer refills and minimal packaging; conscious buyers reward it with repeat orders.' },
    { area: 'bundles', tip: 'Curate themed wellness kits for higher value and easy gifting.' },
    { area: 'labelling', tip: 'Full, honest ingredient lists win health-conscious and overseas buyers.' },
  ],
  sculpture: [
    { area: 'sizes', tip: 'Offer miniature, tabletop and statement tiers — shipping-friendly sizes open global buyers.' },
    { area: 'provenance', tip: 'Ship a stone-origin certificate (e.g., Makrana grade) with every piece; provenance is the premium.' },
    { area: 'b2b', tip: 'Serve temples, hotels and government commissions (GeM) — large works on contract, steady B2B.' },
    { area: 'logistics', tip: 'Museum-style crating and insured freight make heavy marble safe to ship worldwide.' },
  ],
  experience: [
    { area: 'tiers', tip: 'Tier experiences: a 1-hour taster, a half-day workshop, a full immersion — three price points.' },
    { area: 'bundle', tip: 'Bundle with nearby monuments and temples (NEXUS maps them) — sell a day, not an hour.' },
    { area: 'sharing', tip: 'Let guests keep what they make and share photos — free marketing.' },
    { area: 'safety', tip: 'Lead with safety, hygiene, language support and timings to convert family bookings.' },
  ],
};
const LABELS = {
  textile: 'Textiles & weaving', handicraft: 'Handicraft & pottery', jewellery: 'Jewellery',
  gems: 'Gems & gemstones', naturals: 'Natural & sustainable', experience: 'Experiences & tourism', sculpture: 'Stone & marble sculpture',
};

function verticals() { return Object.keys(IDEAS).map((k) => ({ key: k, label: LABELS[k] })); }

function ideasFor(vertical) {
  const k = String(vertical || '').toLowerCase();
  const key = IDEAS[k] ? k : 'handicraft';
  return {
    vertical: key,
    label: LABELS[key],
    intro: `As your ${LABELS[key]} design expert, here are ways to grow:`,
    ideas: IDEAS[key],
    note: 'Ideas, not orders — you choose what fits your craft. With ANTHROPIC_API_KEY set, this learns from your real sales and region.',
  };
}

module.exports = { verticals, ideasFor, IDEAS, LABELS };
