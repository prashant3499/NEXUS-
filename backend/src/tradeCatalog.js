'use strict';

/**
 * tradeCatalog.js
 *
 * The platform serves not seven craft "verticals" but ONE universal need: a
 * skilled worker in the informal economy — cobbler, carpenter, jeweller, gem
 * cleaner, weaver, potter, tailor, tour guide — who lacks paperwork and needs
 * trust, reach, and to get paid. That need is the same for all of them.
 *
 * So instead of hard-coding separate businesses, every trade is DATA that plugs
 * into the same core (verification + money split + never-in-loss + reviews).
 * Adding a new trade is a config entry, not new code. This is how the platform
 * is "over the top for all" without becoming seven fragile silos.
 *
 * The key addition is MODALITY — because a cobbler is not a potter:
 *   • GOODS         — a shippable physical product (potter, weaver, jeweller).
 *   • LOCAL_SERVICE — on-site or local drop-off work (cobbler repair, carpenter
 *                     fitting, gem cleaning, tailoring). No interstate shipping;
 *                     trust = verified skill + verified-purchase reviews + a
 *                     service location, not a courier.
 *   • EXPERIENCE    — a booked, safety-gated experience (tour guide, workshop).
 * A trade may be HYBRID (a carpenter sells furniture = GOODS and does fitting =
 * LOCAL_SERVICE). The core money + trust layer is identical; only fulfilment,
 * the fields collected, and verification differ by modality.
 *
 * Pure + dependency-free. Maps trades to the existing product verticals plus a
 * 'services' category for skilled local work.
 */

const MODALITY = Object.freeze({ GOODS: 'goods', LOCAL_SERVICE: 'local_service', EXPERIENCE: 'experience' });

// Verification needs are expressed abstractly; the real checks come from
// docVerification + kycVerification. 'skill' = demonstrable competence (sample
// work / reference / on-platform reputation), not a government doc.
const TRADES = Object.freeze({
  // ── GOODS makers ──
  weaver:        { label: 'Weaver',          category: 'handicraft', modalities: [MODALITY.GOODS], makes: 'handloom textiles', logistics: true,  verify: ['identity'],            price_band_paise: [50000, 5000000] },
  gi_weaver:     { label: 'GI Weaver',       category: 'gi',         modalities: [MODALITY.GOODS], makes: 'GI-tagged textiles', logistics: true,  verify: ['identity', 'gi_authorised_user'], price_band_paise: [150000, 10000000] },
  potter:        { label: 'Potter',          category: 'handicraft', modalities: [MODALITY.GOODS], makes: 'pottery & ceramics', logistics: true,  verify: ['identity'],            price_band_paise: [20000, 2000000] },
  jeweller:      { label: 'Jewellery Maker', category: 'jewellery',  modalities: [MODALITY.GOODS], makes: 'jewellery', logistics: true,           verify: ['identity', 'hallmark'], price_band_paise: [100000, 50000000] },
  gem_dealer:    { label: 'Gem Seller',      category: 'gems',       modalities: [MODALITY.GOODS], makes: 'cut & certified gems', logistics: true, verify: ['identity', 'certification'], price_band_paise: [200000, 50000000] },
  leatherworker: { label: 'Leatherworker',   category: 'handicraft', modalities: [MODALITY.GOODS, MODALITY.LOCAL_SERVICE], makes: 'leather goods / repair', logistics: true, verify: ['identity'], price_band_paise: [30000, 3000000] },
  naturals_maker:{ label: 'Naturals Maker',  category: 'naturals',   modalities: [MODALITY.GOODS], makes: 'organic/sustainable goods', logistics: true, verify: ['identity', 'organic_or_recycled_evidence'], price_band_paise: [20000, 2000000] },

  // ── LOCAL SERVICE / skilled trades (the gap this fills) ──
  cobbler:       { label: 'Cobbler',         category: 'services',   modalities: [MODALITY.LOCAL_SERVICE, MODALITY.GOODS], makes: 'shoe repair & handmade footwear', logistics: false, verify: ['identity', 'skill'], price_band_paise: [10000, 500000] },
  carpenter:     { label: 'Carpenter',       category: 'services',   modalities: [MODALITY.LOCAL_SERVICE, MODALITY.GOODS], makes: 'furniture & on-site woodwork', logistics: false, verify: ['identity', 'skill'], price_band_paise: [50000, 10000000] },
  gem_cleaner:   { label: 'Gem Cleaner/Polisher', category: 'services', modalities: [MODALITY.LOCAL_SERVICE], makes: 'gem cleaning, polishing & setting', logistics: false, verify: ['identity', 'skill'], price_band_paise: [20000, 1000000] },
  tailor:        { label: 'Tailor',          category: 'services',   modalities: [MODALITY.LOCAL_SERVICE, MODALITY.GOODS], makes: 'tailoring, alteration & bespoke', logistics: false, verify: ['identity', 'skill'], price_band_paise: [15000, 1000000] },
  blacksmith:    { label: 'Blacksmith/Metalsmith', category: 'services', modalities: [MODALITY.LOCAL_SERVICE, MODALITY.GOODS], makes: 'metalwork & repair', logistics: false, verify: ['identity', 'skill'], price_band_paise: [30000, 3000000] },

  // ── EXPERIENCE ──
  tour_guide:    { label: 'Craft Tour Guide', category: 'tourism',   modalities: [MODALITY.EXPERIENCE], makes: 'guided craft experiences', logistics: false, verify: ['identity', 'tourism_operator', 'safety_gate'], price_band_paise: [50000, 5000000] },
  workshop_host: { label: 'Workshop Host',    category: 'tourism',   modalities: [MODALITY.EXPERIENCE], makes: 'hands-on craft workshops', logistics: false, verify: ['identity', 'safety_gate'], price_band_paise: [30000, 2000000] },
});

function getTrade(key) { return TRADES[key] ? { key, ...TRADES[key] } : null; }
function listTrades() { return Object.keys(TRADES).map(getTrade); }
function tradesByModality(m) { return listTrades().filter((t) => t.modalities.includes(m)); }
function tradesByCategory(c) { return listTrades().filter((t) => t.category === c); }

/**
 * onboardingProfile — what the platform must collect + verify for a trade, and
 * how it fulfils. This is what makes onboarding work for ANY trade off one core.
 */
function onboardingProfile(key) {
  const t = getTrade(key);
  if (!t) return null;
  const offersService = t.modalities.includes(MODALITY.LOCAL_SERVICE);
  const isService = offersService && !t.modalities.includes(MODALITY.GOODS);
  const isExperience = t.modalities.includes(MODALITY.EXPERIENCE);
  return {
    trade: t.key, label: t.label, category: t.category, modalities: t.modalities,
    fields_required: ['name', 'language', 'state', (offersService || isExperience) ? 'service_location' : 'workshop_location'],
    verification_required: t.verify,
    fulfilment: isExperience ? 'scheduled_experience' : t.logistics ? 'shipped_goods' : 'local_service',
    logistics_needed: !!t.logistics,
    price_band_paise: t.price_band_paise,
    uses_core: ['verification', 'money_split', 'never_in_loss', 'verified_reviews'],
    note: `${t.label} plugs into the same core; only fulfilment + collected fields differ.`,
  };
}

/** coverage — proof the platform is "for all": how many trades across modalities. */
function coverage() {
  const all = listTrades();
  return {
    total_trades: all.length,
    by_modality: {
      goods: tradesByModality(MODALITY.GOODS).length,
      local_service: tradesByModality(MODALITY.LOCAL_SERVICE).length,
      experience: tradesByModality(MODALITY.EXPERIENCE).length,
    },
    categories: [...new Set(all.map((t) => t.category))],
    principle: 'Any skilled trade is a config entry on one universal core — no new code per trade.',
  };
}

module.exports = { MODALITY, TRADES, getTrade, listTrades, tradesByModality, tradesByCategory, onboardingProfile, coverage };
