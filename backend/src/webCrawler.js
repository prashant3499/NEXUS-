'use strict';
/**
 * webCrawler — NEXUS's OUTBOUND crawler: fetches allowlisted, official open-data sources
 * (government portals, GI registry) to keep the R&D agent's knowledge fresh. Polite by
 * design: allowlist-only, per-domain minimum interval, cached 24h so a source is hit at
 * most once a day, and OFF by default (CRAWLER_ENABLED=true activates at deploy — the
 * sandbox has no route to these hosts, so here it returns the crawl plan instead).
 */
const cache = require('./cache');

const ALLOWLIST = [
  { id: 'datagov', label: 'data.gov.in open APIs', url: 'https://api.data.gov.in/', kind: 'api' },
  { id: 'gi_registry', label: 'GI Registry (ipindia)', url: 'https://search.ipindia.gov.in/GIRPublic/', kind: 'page' },
  { id: 'myscheme', label: 'myScheme API', url: 'https://www.myscheme.gov.in/', kind: 'api' },
  { id: 'odop', label: 'ODOP districts', url: 'https://odop.invest.up.gov.in/', kind: 'page' },
  { id: 'raj_industries', label: 'Rajasthan Industries (ICDS scheme)', url: 'https://industries.rajasthan.gov.in/', kind: 'page' },
];
const MIN_INTERVAL_MS = 60 * 1000;      // per-domain politeness
const CACHE_TTL_MS = 24 * 3600 * 1000;  // hit a source at most daily
const _lastHit = {};

function sources() { return ALLOWLIST.map((s) => ({ id: s.id, label: s.label, kind: s.kind })); }

function enabled() { return String(process.env.CRAWLER_ENABLED || '').toLowerCase() === 'true'; }

async function crawl(sourceId, opts) {
  opts = opts || {};
  const src = ALLOWLIST.find((s) => s.id === sourceId);
  if (!src) return { ok: false, error: 'source not in allowlist', allowed: ALLOWLIST.map((s) => s.id) };

  const plan = { source: src.id, url: src.url, politeness: { min_interval_ms: MIN_INTERVAL_MS, cache_ttl_hours: 24, allowlist_only: true } };
  if (!enabled() && !opts.force) return { ok: true, queued: true, reason: 'CRAWLER_ENABLED not set — returning plan (activates at deploy)', plan };
  if (typeof fetch !== 'function') return { ok: true, queued: true, reason: 'no fetch runtime', plan };

  const key = cache.keyOf('crawl', src.id);
  const hit = cache.get(key);
  if (hit !== undefined) {
    try { require('./researchAgent').addFinding({ topic: 'crawl_' + src.id, finding: 'Fetched ' + src.label + ' (' + hit.length + ' chars) [cache]', src: src.url }); } catch (e) {}
    return { ok: true, source: src.id, bytes: hit.length, from_cache: true };
  }

  const host = src.url.split('/')[2];
  const now = Date.now();
  if (_lastHit[host] && now - _lastHit[host] < MIN_INTERVAL_MS) return { ok: false, error: 'politeness interval — try later', retry_in_ms: MIN_INTERVAL_MS - (now - _lastHit[host]) };

  _lastHit[host] = Date.now();
  const r = await fetch(src.url, { headers: { 'user-agent': 'NEXUSBot/1.0 (+research; contact: founder@nexus)' } });
  if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
  const body = (await r.text()).slice(0, 20000);
  cache.set(key, body, CACHE_TTL_MS);

  // feed the R&D agent
  try { require('./researchAgent').addFinding({ topic: 'crawl_' + src.id, finding: 'Fetched ' + src.label + ' (' + body.length + ' chars)', src: src.url }); } catch (e) {}
  return { ok: true, source: src.id, bytes: body.length, from_cache: false };
}

function reset() { Object.keys(_lastHit).forEach((k) => delete _lastHit[k]); }

module.exports = { ALLOWLIST, sources, enabled, crawl, reset, MIN_INTERVAL_MS };
