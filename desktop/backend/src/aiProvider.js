'use strict';
/**
 * aiProvider — a swappable AI layer so the NEXUS co-founder + creative agents can run on
 * Indian providers (Krutrim, Sarvam) or Anthropic, chosen by env — for data residency
 * (DPDP), Indian-language strength, INR cost, and sovereign-AI optics. No provider is
 * hardcoded; keys stay server-side. If no key is set, callers use the built-in fallback.
 *
 * Set: AI_PROVIDER=krutrim|sarvam|anthropic  AI_API_KEY=...  (optional AI_BASE_URL, AI_MODEL)
 */
const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude', kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-6',
    residency: 'global',
  },
  krutrim: {
    label: 'Ola Krutrim (India, sovereign)', kind: 'openai',
    baseUrl: 'https://cloud.olakrutrim.com/v1/chat/completions', model: 'Krutrim-2-instruct',
    residency: 'india', langs: '22 Indian languages',
  },
  sarvam: {
    label: 'Sarvam AI (India)', kind: 'openai',
    baseUrl: 'https://api.sarvam.ai/v1/chat/completions', model: 'sarvam-m',
    residency: 'india', langs: 'Indian languages + voice',
  },
};

function active() {
  const p = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  return PROVIDERS[p] ? p : 'anthropic';
}

function config(name) {
  name = name || active();
  const base = PROVIDERS[name] || PROVIDERS.anthropic;
  return {
    name, kind: base.kind, residency: base.residency,
    baseUrl: process.env.AI_BASE_URL || base.baseUrl,
    model: process.env.AI_MODEL || base.model,
    key: process.env.AI_API_KEY || (name === 'anthropic' ? process.env.ANTHROPIC_API_KEY : '') || '',
  };
}

/** Pure request builder — testable without network. Returns {url, headers, body}. */
function buildRequest(messages, opts) {
  opts = opts || {};
  const c = config(opts.provider);
  const maxTokens = opts.max_tokens || 800;
  if (c.kind === 'anthropic') {
    return { provider: c.name, url: c.baseUrl,
      headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
      body: { model: c.model, max_tokens: maxTokens, messages } };
  }
  // OpenAI-compatible (Krutrim, Sarvam, and most Indian LLM clouds)
  return { provider: c.name, url: c.baseUrl,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
    body: { model: c.model, max_tokens: maxTokens, messages } };
}

function parseResponse(name, data) {
  const c = config(name);
  try {
    if (c.kind === 'anthropic') return (data.content || []).map((b) => b.text || '').join('\n').trim();
    return (((data.choices || [])[0] || {}).message || {}).content || '';
  } catch (e) { return ''; }
}

/** Best-effort chat. Caches responses so identical prompts cost money only once. */
async function chat(messages, opts) {
  opts = opts || {};
  const c = config(opts.provider);
  if (!c.key) return null;                     // no key → caller uses fallback
  if (typeof fetch !== 'function') return null;
  const cache = require('./cache');
  const cacheKey = cache.keyOf('ai', c.name, c.model, messages);
  if (opts.cache !== false) { const hit = cache.get(cacheKey); if (hit !== undefined) return hit; }
  try {
    const req = buildRequest(messages, opts);
    const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
    if (!r.ok) return null;
    const text = parseResponse(c.name, await r.json());
    if (text && opts.cache !== false) cache.set(cacheKey, text, opts.ttlMs || 6 * 60 * 60 * 1000); // 6h
    return text;
  } catch (e) { return null; }
}

function status() {
  const c = config();
  return { active: c.name, model: c.model, residency: c.residency, configured: !!c.key,
    chain: chain(), breakers: breakerStates(),
    available: Object.keys(PROVIDERS).map((k) => ({ id: k, label: PROVIDERS[k].label, residency: PROVIDERS[k].residency })) };
}

// ── resilient multi-provider failover ──
const R = require('./resilience');
const _breakers = {};
function getBreaker(name) { if (!_breakers[name]) _breakers[name] = new R.CircuitBreaker({ failThreshold: 3, cooldownMs: 20000 }); return _breakers[name]; }
function breakerStates() { const o = {}; Object.keys(_breakers).forEach((k) => { o[k] = _breakers[k].state; }); return o; }

/** Priority order of providers to try: AI_PROVIDER_CHAIN="krutrim,anthropic" else [active, ...rest]. */
function chain() {
  const env = (process.env.AI_PROVIDER_CHAIN || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => PROVIDERS[s]);
  if (env.length) return env;
  const first = active();
  return [first].concat(Object.keys(PROVIDERS).filter((k) => k !== first));
}

/** One provider call (network). Separated so it can be timed + breaker-guarded + stubbed in tests. */
async function _call(provider, messages, opts) {
  const c = config(provider);
  if (!c.key || typeof fetch !== 'function') throw new Error('unconfigured:' + provider);
  const req = buildRequest(messages, Object.assign({}, opts, { provider }));
  const r = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) });
  if (!r.ok) throw new Error('http ' + r.status + ':' + provider);
  const txt = parseResponse(provider, await r.json());
  if (!txt) throw new Error('empty:' + provider);
  return { text: txt, provider };
}

/**
 * Try each provider in the chain, each behind a circuit breaker + timeout. Returns the first
 * success {text, provider}, or null so the caller uses the built-in local fallback. NEVER throws.
 */
async function chatWithFallback(messages, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || 8000;
  for (const provider of chain()) {
    if (!config(provider).key) continue;                 // skip unconfigured
    const breaker = getBreaker(provider);
    const out = await R.guard(breaker, () => R.withTimeout(module.exports._call(provider, messages, opts), timeoutMs, provider), null);
    if (out && out.text) return out;                     // first healthy provider wins
  }
  return null;                                           // all down → caller falls back locally
}

module.exports = { PROVIDERS, active, config, buildRequest, parseResponse, chat, chatWithFallback, chain, status, breakerStates, _call };
