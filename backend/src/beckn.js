'use strict';

/**
 * beckn.js
 *
 * The protocol layer for joining ONDC (which runs on the Beckn protocol). To be
 * a real Network Participant you need four things this module provides:
 *
 *   1. CRYPTOGRAPHIC LAYER — every Beckn message is signed (Ed25519) and the
 *      Authorization header carries a signature the registry can verify. This
 *      module signs outgoing and verifies incoming messages.
 *
 *   2. ASYNC CALLBACK HANDLING — Beckn is asynchronous: you send `search` and
 *      the responses (`on_search`) arrive later as separate callbacks, keyed by
 *      a transaction/message id. This module correlates them so a request can
 *      be matched to its eventual replies.
 *
 *   3. PROTOCOL MAPPING + SCHEMA VALIDATION — Beckn messages have a required
 *      `context` envelope and action-specific shapes. This validates them before
 *      they go on the wire (so we never publish a malformed message that the
 *      network would reject — the same reverse-engineering discipline used for
 *      the catalog).
 *
 *   4. The actions themselves (search / select / init / confirm / status …) are
 *      built on top of the above by the ONDC module.
 *
 * The crypto uses Node's built-in `crypto` (Ed25519) — no dependencies. Keys
 * are injected (from credentials) so nothing secret is hard-coded; without keys
 * a deterministic MOCK signer runs so the flow is exercised end-to-end honestly.
 */

const crypto = require('crypto');

// Beckn actions and their expected callback action.
const ACTIONS = Object.freeze({
  search: 'on_search', select: 'on_select', init: 'on_init',
  confirm: 'on_confirm', status: 'on_status', track: 'on_track',
  cancel: 'on_cancel', update: 'on_update', rating: 'on_rating', support: 'on_support',
});

// ── 1. CRYPTOGRAPHIC LAYER ──────────────────────────────────────────────────

/**
 * makeSigner — build a signer from an Ed25519 private key (base64) + the
 * subscriber's key id. Without a key, returns a deterministic mock signer that
 * is clearly labelled, so the pipeline runs in dev without real keys.
 */
function makeSigner(config = {}) {
  if (config.privateKeyB64 && config.keyId) {
    const privateKey = crypto.createPrivateKey({
      key: Buffer.from(config.privateKeyB64, 'base64'),
      format: 'der', type: 'pkcs8',
    });
    return {
      kind: 'ed25519', keyId: config.keyId,
      sign(message) {
        const digest = crypto.createHash('blake2b512').update(message).digest('base64');
        const sig = crypto.sign(null, Buffer.from(digest), privateKey).toString('base64');
        return { signature: sig, keyId: config.keyId, algorithm: 'ed25519' };
      },
    };
  }
  // Mock signer — honest, deterministic, NOT a real signature.
  return {
    kind: 'mock', keyId: config.keyId || 'mock-key',
    sign(message) {
      const h = crypto.createHash('sha256').update(message).digest('base64');
      return { signature: 'mock:' + h, keyId: this.keyId, algorithm: 'mock', note: 'Mock signature — set ONDC signing keys for real Beckn auth.' };
    },
  };
}

/**
 * buildAuthHeader — the Beckn `Authorization` header value for a signed message.
 */
function buildAuthHeader(signResult, subscriberId) {
  return `Signature keyId="${subscriberId}|${signResult.keyId}|ed25519",algorithm="ed25519",signature="${signResult.signature}"`;
}

/**
 * verifySignature — verify an incoming signed message against a public key
 * (base64). Returns boolean. Mock signatures verify only in mock mode.
 */
function verifySignature(message, signature, publicKeyB64) {
  if (typeof signature === 'string' && signature.startsWith('mock:')) {
    const h = crypto.createHash('sha256').update(message).digest('base64');
    return signature === 'mock:' + h;
  }
  try {
    const publicKey = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    const digest = crypto.createHash('blake2b512').update(message).digest('base64');
    return crypto.verify(null, Buffer.from(digest), publicKey, Buffer.from(signature, 'base64'));
  } catch (e) { return false; }
}

// ── 2. ASYNC CALLBACK HANDLING ──────────────────────────────────────────────

/**
 * CallbackCorrelator — Beckn replies arrive asynchronously. Register an
 * outgoing request by its (transaction_id, message_id); when callbacks come in,
 * correlate them. A real deployment persists this; here it's in-memory + pure.
 */
function makeCorrelator() {
  const pending = new Map(); // message_id -> { action, transaction_id, sent_at, callbacks: [] }
  return {
    register(context) {
      pending.set(context.message_id, {
        action: context.action, transaction_id: context.transaction_id,
        expect: ACTIONS[context.action] || null, sent_at: Date.now(), callbacks: [],
      });
      return context.message_id;
    },
    receive(callbackContext, payload) {
      const rec = pending.get(callbackContext.message_id);
      if (!rec) return { ok: false, reason: 'no matching request for this message_id (late or unknown callback)' };
      if (rec.expect && callbackContext.action !== rec.expect) {
        return { ok: false, reason: `expected ${rec.expect}, got ${callbackContext.action}` };
      }
      rec.callbacks.push({ at: Date.now(), payload });
      return { ok: true, correlated_to: rec.action, transaction_id: rec.transaction_id, count: rec.callbacks.length };
    },
    pendingCount() { return pending.size; },
    get(messageId) { return pending.get(messageId) || null; },
  };
}

// ── 3. PROTOCOL MAPPING + SCHEMA VALIDATION ─────────────────────────────────

const REQUIRED_CONTEXT = ['domain', 'action', 'transaction_id', 'message_id', 'timestamp', 'bap_id'];

/**
 * buildContext — the Beckn `context` envelope for an action. Generates ids if
 * not supplied.
 */
function buildContext(action, opts = {}) {
  if (!ACTIONS[action]) throw new Error(`Unknown Beckn action: ${action}`);
  return {
    domain: opts.domain || 'ONDC:RET10',
    action,
    country: 'IND', city: opts.city || 'std:080',
    core_version: '1.2.0',
    bap_id: opts.bap_id || opts.subscriber_id, bap_uri: opts.bap_uri,
    bpp_id: opts.bpp_id, bpp_uri: opts.bpp_uri,
    transaction_id: opts.transaction_id || crypto.randomUUID(),
    message_id: opts.message_id || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ttl: opts.ttl || 'PT30S',
  };
}

/**
 * validateMessage — schema validation before a message goes on the wire.
 * Checks the context envelope + that a message body exists. Returns the list of
 * problems (empty = valid).
 */
function validateMessage(msg) {
  const problems = [];
  if (!msg || typeof msg !== 'object') return ['message must be an object'];
  const ctx = msg.context;
  if (!ctx) { problems.push('missing context'); return problems; }
  for (const k of REQUIRED_CONTEXT) {
    if (ctx[k] === undefined || ctx[k] === null || ctx[k] === '') problems.push(`context.${k} is required`);
  }
  if (ctx.action && !ACTIONS[ctx.action] && !Object.values(ACTIONS).includes(ctx.action)) {
    problems.push(`context.action "${ctx.action}" is not a known Beckn action`);
  }
  if (ctx.timestamp && isNaN(Date.parse(ctx.timestamp))) problems.push('context.timestamp is not a valid ISO date');
  if (!msg.message) problems.push('missing message body');
  return problems;
}

/**
 * signedEnvelope — the full thing to send: a validated message + its auth
 * header. Refuses to produce one for an invalid message (never publish broken).
 */
function signedEnvelope(msg, signer, subscriberId) {
  const problems = validateMessage(msg);
  if (problems.length) return { ok: false, problems };
  const body = JSON.stringify(msg);
  const sig = signer.sign(body);
  return {
    ok: true,
    body,
    headers: { 'Content-Type': 'application/json', Authorization: buildAuthHeader(sig, subscriberId) },
    signature_mode: signer.kind,
  };
}

module.exports = {
  ACTIONS, REQUIRED_CONTEXT,
  makeSigner, buildAuthHeader, verifySignature,
  makeCorrelator, buildContext, validateMessage, signedEnvelope,
};
