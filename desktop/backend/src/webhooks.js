'use strict';

/**
 * webhooks.js
 *
 * Reliable outbound webhook delivery: when something happens (payout settled,
 * order shipped), partners/sellers need a signed, trustworthy notification that
 * arrives even if their endpoint is briefly down.
 *
 * Provides:
 *   • SIGNING       — HMAC-SHA256 over the payload + timestamp, so the receiver
 *     can verify the message is really from the platform and not replayed.
 *   • IDEMPOTENCY   — each event has a stable id; re-delivery is detectable so a
 *     receiver never double-processes.
 *   • RETRIES       — exponential backoff with a max attempt count; exhausted
 *     deliveries go to a dead-letter list for inspection, never lost silently.
 *
 * The actual HTTP send is injected (so this is pure + testable); the queue logic
 * is the valuable part.
 */

const crypto = require('crypto');

const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [0, 30000, 120000, 600000, 3600000, 21600000]; // 0s,30s,2m,10m,1h,6h

/** sign — HMAC-SHA256 signature header value for a payload. */
function sign(payload, secret, timestamp = Date.now()) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const mac = crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
  return { signature: 't=' + timestamp + ',v1=' + mac, timestamp };
}

/** verify — receiver-side: confirm a signature (and reject stale ones). */
function verify(payload, header, secret, toleranceMs = 300000, now = Date.now()) {
  const m = /t=(\d+),v1=([a-f0-9]+)/.exec(header || '');
  if (!m) return false;
  const ts = parseInt(m[1], 10);
  if (Math.abs(now - ts) > toleranceMs) return false; // replay/stale guard
  const expected = sign(payload, secret, ts).signature.split(',v1=')[1];
  // constant-time compare
  const a = Buffer.from(m[2]); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** makeQueue — an in-memory delivery queue (a real one persists rows). */
function makeQueue() {
  const events = new Map();   // id -> event record
  const dead = [];
  return {
    /** enqueue an event for delivery. id makes it idempotent. */
    enqueue(event) {
      const id = event.id || crypto.randomUUID();
      if (events.has(id)) return { ok: true, duplicate: true, id }; // idempotent
      events.set(id, {
        id, url: event.url, type: event.type, payload: event.payload,
        attempts: 0, status: 'pending', next_at: Date.now(), created_at: Date.now(),
      });
      return { ok: true, duplicate: false, id };
    },

    /** attempt delivery of one event using an injected `send(url, body, headers)`
     *  that returns/throws. Handles success, retry scheduling, and dead-letter. */
    async attempt(id, send, secret, now = Date.now()) {
      const ev = events.get(id);
      if (!ev) return { ok: false, reason: 'unknown event' };
      if (ev.status === 'delivered') return { ok: true, already: true };
      ev.attempts += 1;
      const sig = sign(ev.payload, secret, now);
      try {
        await send(ev.url, ev.payload, { 'X-Nexus-Signature': sig.signature, 'X-Nexus-Event': ev.type, 'X-Nexus-Id': ev.id });
        ev.status = 'delivered'; ev.delivered_at = now;
        return { ok: true, attempts: ev.attempts };
      } catch (e) {
        if (ev.attempts >= MAX_ATTEMPTS) {
          ev.status = 'dead'; dead.push(ev); events.delete(id);
          return { ok: false, dead: true, attempts: ev.attempts, reason: e.message };
        }
        ev.status = 'pending';
        ev.next_at = now + (BACKOFF_MS[ev.attempts] || BACKOFF_MS[BACKOFF_MS.length - 1]);
        return { ok: false, retry_at: ev.next_at, attempts: ev.attempts, reason: e.message };
      }
    },

    due(now = Date.now()) { return [...events.values()].filter((e) => e.status === 'pending' && e.next_at <= now); },
    deadLetters() { return dead.slice(); },
    get(id) { return events.get(id) || dead.find((e) => e.id === id) || null; },
    stats() {
      const all = [...events.values()];
      return { pending: all.filter((e) => e.status === 'pending').length, delivered: all.filter((e) => e.status === 'delivered').length, dead: dead.length };
    },
  };
}

module.exports = { MAX_ATTEMPTS, BACKOFF_MS, sign, verify, makeQueue };
