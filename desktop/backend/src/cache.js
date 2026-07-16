'use strict';
/**
 * cache — a small TTL cache to keep operations cheap: memoize expensive computes and,
 * most importantly, LLM/API responses so identical requests don't cost money twice.
 * In-memory (LRU-ish) for the demo; back with Redis at deploy for multi-instance sharing.
 */
const crypto = require('crypto');

const _store = new Map(); // key -> { value, exp }
let _hits = 0, _misses = 0;
const MAX = 2000;
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h

function keyOf() {
  const raw = JSON.stringify(Array.from(arguments));
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function _sweep() { const now = Date.now(); for (const [k, e] of _store) if (e.exp <= now) _store.delete(k); }

function get(key) {
  const e = _store.get(key);
  if (e && e.exp > Date.now()) { _hits++; return e.value; }
  if (e) _store.delete(key);
  _misses++; return undefined;
}

function set(key, value, ttlMs) {
  if (_store.size >= MAX) { _sweep(); if (_store.size >= MAX) _store.delete(_store.keys().next().value); }
  _store.set(key, { value, exp: Date.now() + (ttlMs || DEFAULT_TTL_MS) });
  return value;
}

/** Return cached value, or compute (sync or async) and cache it. */
async function getOrCompute(key, fn, ttlMs) {
  const hit = get(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  if (value !== undefined && value !== null) set(key, value, ttlMs);
  return value;
}

function stats() {
  const total = _hits + _misses;
  return { entries: _store.size, hits: _hits, misses: _misses, hit_rate: total ? +(_hits / total).toFixed(3) : 0, max: MAX };
}
function clear() { _store.clear(); _hits = 0; _misses = 0; }

module.exports = { keyOf, get, set, getOrCompute, stats, clear, DEFAULT_TTL_MS };
