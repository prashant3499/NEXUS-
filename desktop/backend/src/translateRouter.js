/**
 * NEXUS — Translation router.
 *
 * One entry point for all translation requests in the system. Picks the
 * right provider based on the language pair:
 *
 *   • Indic language involved → Bhashini (₹0 cost, low-resource coverage)
 *   • Both languages non-Indic → Global cloud provider (per-char cost)
 *   • Same source and target → passthrough (zero cost, zero call)
 *
 * Returns a unified result shape across providers so callers don't have
 * to know who served the request. Cost is reported honestly so the
 * (future) unit-economics engine can attribute spend correctly.
 */

'use strict';

const bhashini = require('./bhashini');
const globalT  = require('./globalTranslate');

/** Routing decision based on language pair. */
function pickProvider(sourceLang, targetLang) {
  const indicSrc = bhashini.supports(sourceLang) && !globalT.supports(sourceLang);
  const indicTgt = bhashini.supports(targetLang) && !globalT.supports(targetLang);
  const indicEither = indicSrc || indicTgt ||
    // both sides are Bhashini languages (en is in both lists; route by other side)
    (bhashini.supports(sourceLang) && bhashini.supports(targetLang) && (sourceLang !== 'en' || targetLang !== 'en'));

  if (indicEither) {
    // Prefer Bhashini whenever at least one side is Indic. Cost is ₹0.
    return { provider: 'bhashini', costEstimatePaise: 0, reason: 'Indic language pair — Bhashini is free and well-covered' };
  }
  if (globalT.supports(sourceLang) && globalT.supports(targetLang)) {
    return { provider: 'global',   costEstimatePaise: null /* depends on text length */, reason: 'Non-Indic language pair — global provider' };
  }
  return { provider: 'none', costEstimatePaise: 0, reason: `Neither provider supports ${sourceLang} → ${targetLang}` };
}

/**
 * Main entry point.
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @param {object} [opts]   { bhashiniProvider, globalProvider } for tests
 */
async function translate(text, sourceLang, targetLang, opts = {}) {
  if (!text || typeof text !== 'string') {
    return { ok: false, output: null, provider: 'none', latencyMs: 0, costPaise: 0,
      reasons: [{ ok: false, text: 'Empty text' }] };
  }
  if (sourceLang === targetLang) {
    return { ok: true, output: text, provider: 'passthrough', latencyMs: 0, costPaise: 0,
      reasons: [{ ok: true, text: 'No translation needed' }] };
  }

  const route = pickProvider(sourceLang, targetLang);

  if (route.provider === 'bhashini') {
    const res = await bhashini.callBhashini('nmt',
      { text, sourceLang, targetLang },
      opts.bhashiniProvider
    );
    return { ...res, costPaise: 0, reasons: [...res.reasons, { ok: true, text: route.reason }] };
  }

  if (route.provider === 'global') {
    const res = await globalT.translate(text, sourceLang, targetLang, opts.globalProvider);
    return { ...res, reasons: [...res.reasons, { ok: true, text: route.reason }] };
  }

  return { ok: false, output: null, provider: 'none', latencyMs: 0, costPaise: 0,
    reasons: [{ ok: false, text: route.reason }] };
}

/**
 * Bulk translate — used when localizing a whole listing description
 * for multiple buyer languages at once. Returns a per-language result
 * map and the total cost.
 */
async function translateBulk(text, sourceLang, targetLangs, opts = {}) {
  const results = {};
  let totalCostPaise = 0;
  for (const tl of targetLangs) {
    const r = await translate(text, sourceLang, tl, opts);
    results[tl] = r;
    totalCostPaise += (r.costPaise || 0);
  }
  return { results, totalCostPaise };
}

module.exports = { pickProvider, translate, translateBulk };
