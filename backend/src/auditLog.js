'use strict';
/**
 * auditLog — append-only, HASH-CHAINED audit trail. Each entry's hash covers the previous
 * hash + its own content, so any tampering with history breaks the chain and is detected.
 * This is the compliance-grade audit story (DPDP / investor / government diligence).
 */
const crypto = require('crypto');

const _entries = [];
const GENESIS = 'nexus-genesis';

function _hash(prevHash, payload) {
  return crypto.createHash('sha256').update(prevHash + '|' + JSON.stringify(payload)).digest('hex');
}

function append(event) {
  const prev = _entries.length ? _entries[_entries.length - 1].hash : GENESIS;
  const payload = { seq: _entries.length + 1, at: new Date().toISOString(), event: event || {} };
  const entry = Object.assign({}, payload, { prevHash: prev, hash: _hash(prev, payload) });
  _entries.push(entry);
  return entry;
}

/** Verify the whole chain; returns {valid, brokenAt} — tampering shows up here. */
function verifyChain() {
  let prev = GENESIS;
  for (let i = 0; i < _entries.length; i++) {
    const e = _entries[i];
    const expected = _hash(prev, { seq: e.seq, at: e.at, event: e.event });
    if (e.prevHash !== prev || e.hash !== expected) return { valid: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { valid: true, length: _entries.length };
}

function list(n) { return n ? _entries.slice(-n) : _entries.slice(); }
function reset() { _entries.length = 0; }

module.exports = { append, verifyChain, list, reset };
