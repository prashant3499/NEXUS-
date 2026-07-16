/**
 * NEXUS — Bhashini provider seam.
 *
 * Bhashini is the Government of India's national language platform for
 * Indian-language AI tasks (ASR/NMT/TTS). For Indian-language content,
 * Bhashini is preferred because:
 *   1) The cost engine routes Indic inference here at ₹0 (real)
 *   2) Coverage of low-resource languages (Bodo, Santhali, Konkani) is
 *      better than commercial alternatives
 *
 * We expose three operations:
 *   asr(audio, sourceLang)         — speech → text in the source language
 *   nmt(text, source, target)      — translate text between two languages
 *   tts(text, lang)                — text → audio in the given language
 *
 * Pattern matches razorpayProvider.js and docVerification.js: one shared
 * interface, two backends (Mock, Real), provider picked at runtime by
 * config. The Real provider's HTTP calls are stubbed until credentials
 * arrive — the SHAPES are correct and tested; the URLs are placeholders.
 *
 * RESULT SHAPE (consistent across operations):
 *   { ok: boolean, output: string|Buffer|null, provider: 'mock'|'real',
 *     latencyMs: number, reasons: Array<{ok, text}> }
 */

'use strict';

const SUPPORTED_TASKS = ['asr', 'nmt', 'tts'];

// Languages Bhashini supports for the three tasks. This list reflects
// what Bhashini publicly advertises; real coverage per task varies and
// is checked at call time.
const BHASHINI_LANGS = [
  'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur',
  'sa', 'sd', 'ks', 'kok', 'mai', 'mni', 'ne', 'brx', 'sat', 'doi',
];

function supports(lang) {
  return BHASHINI_LANGS.includes(lang);
}

// ────────────────────────────────────────────────────────────
// MockBhashiniProvider — deterministic, no network
// ────────────────────────────────────────────────────────────

const MockBhashiniProvider = {
  name: 'mock',

  async asr(audioRef, sourceLang) {
    const t0 = Date.now();
    if (!supports(sourceLang)) {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: `ASR not available for "${sourceLang}"` }] };
    }
    if (!audioRef) {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: 'No audio reference supplied' }] };
    }
    // Deterministic mock: return a recognizable transcript per language so
    // tests can assert routing without depending on real ASR output.
    const transcripts = {
      hi: 'यह एक हाथ से बना खुर्जा का नीला मटका है।',
      en: 'This is a hand-thrown Khurja blue pottery vase.',
      bn: 'এটি একটি হাতে তৈরি খুর্জা নীল মৃৎশিল্পের ফুলদানি।',
    };
    return {
      ok: true,
      output: transcripts[sourceLang] || `[mock ASR output in ${sourceLang}]`,
      provider: 'mock',
      latencyMs: Date.now() - t0,
      reasons: [{ ok: true, text: `Bhashini ASR (mock) recognised ${sourceLang} audio` }],
    };
  },

  async nmt(text, sourceLang, targetLang) {
    const t0 = Date.now();
    if (!text || typeof text !== 'string') {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: 'Empty text' }] };
    }
    if (!supports(sourceLang) || !supports(targetLang)) {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: `NMT not available for ${sourceLang} → ${targetLang}` }] };
    }
    if (sourceLang === targetLang) {
      return { ok: true, output: text, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: true, text: 'No translation needed (same language)' }] };
    }
    // Deterministic mock pairs for the test surface.
    const pairs = {
      'en->hi:Hello':           'नमस्ते',
      'hi->en:नमस्ते':           'Hello',
      'en->hi:Welcome':         'स्वागत है',
      'en->bn:Hello':           'হ্যালো',
      'hi->bn:नमस्ते':           'হ্যালো',
    };
    const key = `${sourceLang}->${targetLang}:${text}`;
    const known = pairs[key];
    return {
      ok: true,
      output: known || `[${sourceLang}→${targetLang}] ${text}`,
      provider: 'mock',
      latencyMs: Date.now() - t0,
      reasons: [{ ok: true, text: `Bhashini NMT (mock) translated ${sourceLang} → ${targetLang}` }],
    };
  },

  async tts(text, lang) {
    const t0 = Date.now();
    if (!text || typeof text !== 'string') {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: 'Empty text' }] };
    }
    if (!supports(lang)) {
      return { ok: false, output: null, provider: 'mock', latencyMs: Date.now() - t0,
        reasons: [{ ok: false, text: `TTS not available for "${lang}"` }] };
    }
    // Mock returns a placeholder audio reference, not actual audio bytes.
    // The real provider returns an audio URL or raw bytes.
    return {
      ok: true,
      output: `mock://bhashini/tts/${lang}/${encodeURIComponent(text.slice(0, 32))}.wav`,
      provider: 'mock',
      latencyMs: Date.now() - t0,
      reasons: [{ ok: true, text: `Bhashini TTS (mock) generated ${lang} audio` }],
    };
  },
};

// ────────────────────────────────────────────────────────────
// RealBhashiniProvider — shape correct, URL placeholder
//
// When credentials arrive (BHASHINI_API_KEY, BHASHINI_PIPELINE_ID), this
// adapter makes real HTTPS calls to Bhashini's ULCA endpoints. Until
// then, calling it throws — so we never silently degrade to "fake real."
// ────────────────────────────────────────────────────────────

function makeRealBhashiniProvider({ apiKey, pipelineId } = {}) {
  if (!apiKey || !pipelineId) {
    throw new Error('RealBhashiniProvider requires BHASHINI_API_KEY and BHASHINI_PIPELINE_ID');
  }
  return {
    name: 'real',
    async asr(audioRef, sourceLang) {
      throw new Error('RealBhashiniProvider.asr: live HTTP call not implemented; credentials present but adapter is a placeholder');
    },
    async nmt(text, sourceLang, targetLang) {
      throw new Error('RealBhashiniProvider.nmt: live HTTP call not implemented; credentials present but adapter is a placeholder');
    },
    async tts(text, lang) {
      throw new Error('RealBhashiniProvider.tts: live HTTP call not implemented; credentials present but adapter is a placeholder');
    },
  };
}

// ────────────────────────────────────────────────────────────
// Public interface — provider picked at runtime
// ────────────────────────────────────────────────────────────

function getProvider(config = {}) {
  if (config.bhashiniMode === 'real' && config.apiKey && config.pipelineId) {
    return makeRealBhashiniProvider(config);
  }
  return MockBhashiniProvider;
}

/** Convenience wrapper. Catches provider throws and returns a structured error. */
async function callBhashini(task, args, providerOverride = null) {
  if (!SUPPORTED_TASKS.includes(task)) {
    return { ok: false, output: null, provider: 'none', latencyMs: 0,
      reasons: [{ ok: false, text: `Unknown task: ${task}` }] };
  }
  const p = providerOverride || getProvider();
  try {
    if (task === 'asr') return await p.asr(args.audioRef, args.sourceLang);
    if (task === 'nmt') return await p.nmt(args.text, args.sourceLang, args.targetLang);
    if (task === 'tts') return await p.tts(args.text, args.lang);
  } catch (e) {
    return { ok: false, output: null, provider: p.name, latencyMs: 0,
      reasons: [{ ok: false, text: `Provider error: ${e.message}` }] };
  }
}

module.exports = {
  SUPPORTED_TASKS, BHASHINI_LANGS, supports,
  MockBhashiniProvider, makeRealBhashiniProvider,
  getProvider, callBhashini,
};
