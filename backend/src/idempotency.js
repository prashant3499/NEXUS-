'use strict';
/**
 * idempotency — prevents the most direct money-loss bug: a charge or payout running twice
 * (retry, double-click, webhook re-delivery). Every money operation passes an idempotency
 * key (e.g., order id + op); the first call proceeds, duplicates are rejected. In-memory
 * with TTL for the demo; back it with Postgres/Redis at deploy for multi-instance safety.
 */
const _seen = new Map(); // key -> expiry ms
const DEFAULT_TTL_MS = 24 * 3600 * 1000;

function _sweep(now) { for (const [k, exp] of _seen) if (exp <= now) _seen.delete(k); }

/** Returns true the FIRST time a key is seen, false for duplicates (within TTL). */
function first(key, ttlMs) {
  if (!key) throw new Error('idempotency key required');
  const now = Date.now();
  if (_seen.size > 5000) _sweep(now);
  const exp = _seen.get(key);
  if (exp && exp > now) return false;      // duplicate
  _seen.set(key, now + (ttlMs || DEFAULT_TTL_MS));
  return true;
}

/** Guard a money op: runs fn only once per key; duplicates return {duplicate:true}. */
function guard(key, fn, ttlMs) {
  if (!first(key, ttlMs)) return { duplicate: true, key, note: 'Duplicate operation blocked — no double charge/payout.' };
  return { duplicate: false, key, result: fn() };
}

function keyFor(op, id) { return String(op || 'op') + ':' + String(id || ''); }
function reset() { _seen.clear(); }

module.exports = { first, guard, keyFor, reset, DEFAULT_TTL_MS };
