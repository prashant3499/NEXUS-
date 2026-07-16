/**
 * NEXUS — Global translation provider seam.
 *
 * Bhashini covers 22+ Indian languages well, including low-resource ones
 * (Bodo, Santhali, Konkani) that commercial providers handle poorly.
 * But Bhashini does NOT cover French, Spanish, German, Arabic, Mandarin,
 * Japanese, Portuguese, Russian — the languages our international
 * buyers speak.
 *
 * This module is the SECOND translation provider seam: a global cloud
 * translation adapter (Google Cloud Translation / AWS Translate / Azure
 * Translator / DeepL — any of them; the seam is interchangeable). It
 * pairs with src/bhashini.js to give us full global coverage:
 *
 *   Indian languages → Bhashini  (free, low-resource coverage)
 *   Global languages → Cloud     (paid, large-language coverage)
 *   English          → both can handle
 *
 * The "translation router" decides which provider to use based on the
 * language pair, with cost being a real consideration — we route Indic
 * to Bhashini specifically because the cost engine says it's free there.
 */

'use strict';

// Languages this provider handles well. Deliberately excludes the Indic
// languages Bhashini handles; the router uses these lists to pick a
// provider. Cost: paid per character.
const GLOBAL_LANGS = [
  // Europe
  'en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'sv', 'da', 'no', 'fi', 'el',
  'cs', 'hu', 'ro', 'tr', 'uk', 'ru',
  // Middle East
  'ar', 'he', 'fa',
  // East Asia
  'zh', 'ja', 'ko',
  // South-East Asia
  'th', 'vi', 'id', 'ms', 'tl',
];

const RTL_LANGS = ['ar', 'he', 'fa', 'ur'];

function supports(lang) { return GLOBAL_LANGS.includes(lang); }
function isRTL(lang) { return RTL_LANGS.includes(lang); }

// Per-character pricing (paise, conservative). Used by the cost engine to
// decide whether a translation request is worth making.
const COST_PER_CHAR_PAISE = 2; // ~₹0.02 / char; real rates vary by provider

function estimateCostPaise(text) {
  return (String(text || '').length) * COST_PER_CHAR_PAISE;
}

// ────────────────────────────────────────────────────────────
// MockGlobalProvider — deterministic, no network
// ────────────────────────────────────────────────────────────

const MockGlobalProvider = {
  name: 'mock-global',
  vendor: 'mock',

  async translate(text, sourceLang, targetLang) {
    const t0 = Date.now();
    if (!text || typeof text !== 'string') {
      return { ok: false, output: null, provider: 'mock-global', latencyMs: Date.now() - t0,
        costPaise: 0, reasons: [{ ok: false, text: 'Empty text' }] };
    }
    if (!supports(sourceLang) || !supports(targetLang)) {
      return { ok: false, output: null, provider: 'mock-global', latencyMs: Date.now() - t0,
        costPaise: 0,
        reasons: [{ ok: false, text: `Global translation: ${sourceLang} → ${targetLang} not supported` }] };
    }
    if (sourceLang === targetLang) {
      return { ok: true, output: text, provider: 'mock-global', latencyMs: Date.now() - t0,
        costPaise: 0, reasons: [{ ok: true, text: 'No translation needed' }] };
    }
    // Deterministic pairs for tests
    const pairs = {
      'en->fr:Hello':                       'Bonjour',
      'en->es:Hello':                       'Hola',
      'en->de:Hello':                       'Hallo',
      'en->ar:Hello':                       'مرحبا',
      'en->zh:Hello':                       '你好',
      'en->ja:Hello':                       'こんにちは',
      'en->fr:Verified-real craft from the artisan, not the middleman.':
        'Artisanat vérifié-authentique de l\'artisan, pas du revendeur.',
    };
    const key = `${sourceLang}->${targetLang}:${text}`;
    const known = pairs[key];
    const cost = estimateCostPaise(text);
    return {
      ok: true,
      output: known || `[${sourceLang}→${targetLang}] ${text}`,
      provider: 'mock-global',
      latencyMs: Date.now() - t0,
      costPaise: cost,
      reasons: [{ ok: true, text: `Mock global provider translated ${sourceLang} → ${targetLang} (${cost} paise)` }],
    };
  },
};

// ────────────────────────────────────────────────────────────
// RealGlobalProvider — shape correct, HTTP placeholder
// ────────────────────────────────────────────────────────────

function makeRealGlobalProvider({ vendor, apiKey } = {}) {
  if (!vendor || !apiKey) {
    throw new Error('RealGlobalProvider requires { vendor, apiKey } (vendor: google|aws|azure|deepl)');
  }
  return {
    name: `real-${vendor}`,
    vendor,
    async translate(text, sourceLang, targetLang) {
      throw new Error(`RealGlobalProvider(${vendor}).translate: live HTTP call not implemented; credentials present but adapter is a placeholder`);
    },
  };
}

function getProvider(config = {}) {
  if (config.mode === 'real' && config.vendor && config.apiKey) {
    return makeRealGlobalProvider(config);
  }
  return MockGlobalProvider;
}

async function translate(text, sourceLang, targetLang, providerOverride = null) {
  const p = providerOverride || getProvider();
  try {
    return await p.translate(text, sourceLang, targetLang);
  } catch (e) {
    return { ok: false, output: null, provider: p.name, latencyMs: 0, costPaise: 0,
      reasons: [{ ok: false, text: `Provider error: ${e.message}` }] };
  }
}

module.exports = {
  GLOBAL_LANGS, RTL_LANGS,
  supports, isRTL, estimateCostPaise, COST_PER_CHAR_PAISE,
  MockGlobalProvider, makeRealGlobalProvider, getProvider, translate,
};
