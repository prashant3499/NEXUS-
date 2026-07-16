'use strict';
/**
 * dataCrypto — authenticated encryption (AES-256-GCM) for personal data at rest.
 * Key comes from ENCRYPTION_KEY (32-byte hex/base64) in the environment — never hardcoded.
 * In development with no key set, falls back to a clearly-marked non-persistent dev key so
 * the app runs, and reports insecure=true so productionGuard can refuse to go live.
 */
const crypto = require('crypto');

function keyInfo() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (raw) {
    let buf;
    try { buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'); } catch (e) { buf = null; }
    if (buf && buf.length === 32) return { key: buf, insecure: false };
  }
  // dev fallback — deterministic, NOT for production
  return { key: crypto.createHash('sha256').update('nexus-dev-only-key').digest(), insecure: true };
}

function encrypt(plaintext) {
  const { key, insecure } = keyInfo();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64'), insecure };
}

function decrypt(payload) {
  if (!payload || !payload.data) return null;
  const { key } = keyInfo();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]).toString('utf8');
}

/** Encrypt only PII fields of a record, leaving the rest queryable. */
const PII = ['name', 'phone', 'email', 'address', 'bank', 'aadhaar', 'kyc', 'gstin'];
function encryptRecord(rec) {
  const out = {}; rec = rec || {};
  Object.keys(rec).forEach((k) => { out[k] = PII.indexOf(k) >= 0 && rec[k] != null ? encrypt(rec[k]) : rec[k]; });
  return out;
}
function isSecure() { return !keyInfo().insecure; }

module.exports = { encrypt, decrypt, encryptRecord, isSecure, PII };
