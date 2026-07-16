'use strict';
/**
 * resilience — fault-isolation so no external dependency can crash the business engine.
 * Provides timeouts (never hang), retries with backoff (survive blips), circuit breakers
 * (stop hammering a dead service and recover automatically), and safe wrappers (degrade,
 * never throw). Used by the AI layer, payments, and any outbound call.
 */

function withTimeout(promise, ms, label) {
  ms = ms || 8000;
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('timeout' + (label ? ':' + label : '') + ' after ' + ms + 'ms')), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
}

async function retry(fn, opts) {
  opts = opts || {};
  const tries = opts.tries || 3, base = opts.baseMs || 120, factor = opts.factor || 2;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(i); }
    catch (e) { lastErr = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, base * Math.pow(factor, i))); }
  }
  throw lastErr;
}

/** Circuit breaker: closed → open (after failThreshold) → half-open (after cooldown) → closed. */
function CircuitBreaker(opts) {
  opts = opts || {};
  this.failThreshold = opts.failThreshold || 3;
  this.cooldownMs = opts.cooldownMs || 15000;
  this.state = 'closed';
  this.failures = 0;
  this.openedAt = 0;
  this.now = opts.now || Date.now; // injectable clock for tests
}
CircuitBreaker.prototype.canPass = function () {
  if (this.state === 'open') {
    if (this.now() - this.openedAt >= this.cooldownMs) { this.state = 'half-open'; return true; }
    return false;
  }
  return true; // closed or half-open (one trial)
};
CircuitBreaker.prototype.onSuccess = function () { this.state = 'closed'; this.failures = 0; };
CircuitBreaker.prototype.onFailure = function () {
  this.failures++;
  if (this.state === 'half-open' || this.failures >= this.failThreshold) { this.state = 'open'; this.openedAt = this.now(); }
};

/** Run fn through a breaker: skips fast when open, records success/failure. Returns fallback on any failure. */
async function guard(breaker, fn, fallback) {
  if (!breaker.canPass()) return fallback;
  try { const v = await fn(); breaker.onSuccess(); return v; }
  catch (e) { breaker.onFailure(); return fallback; }
}

async function safe(fn, fallback) { try { return await fn(); } catch (e) { return fallback; } }

module.exports = { withTimeout, retry, CircuitBreaker, guard, safe };
