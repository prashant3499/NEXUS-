'use strict';

/**
 * dataProtection.js
 *
 * Encryption and PII protection for a platform that moves money, holds KYC
 * (Aadhaar/PAN/bank), and bridges citizens and government in BOTH directions
 * (C2G: KYC + scheme applications flow to government; G2C: approvals + benefits
 * flow back). That makes it subject to the DPDP Act and Aadhaar handling rules,
 * where strong encryption is a legal and trust requirement, not an option.
 *
 * This complements the signing already in place (Beckn Ed25519 for ONDC,
 * webhook HMAC, auth hashing) with the missing layer: data-at-rest protection.
 *
 * Three real capabilities (built on Node's crypto — actual encryption, not a
 * mock):
 *   1. encryptField / decryptField — AES-256-GCM authenticated encryption for
 *      sensitive fields (Aadhaar, PAN, bank). Authenticated = tamper of the
 *      ciphertext is detected on decrypt.
 *   2. maskPII — safe display values (Aadhaar -> XXXX XXXX 1234) so raw PII is
 *      never shown or logged.
 *   3. integritySeal / verifySeal — HMAC tamper-evidence for data exchanged
 *      with government (non-repudiation + integrity on C2G/G2C payloads).
 *
 * Keys come from the environment / a KMS. Dev keys are refused in production
 * (works with productionGuard). Pure except Node's built-in crypto.
 */

const crypto = require('crypto');

const VERSION = 'v1';
const DEV_KEYS = ['', 'dev', 'changeme', 'dev-encryption-key', 'secret', 'test'];

/** deriveKey — accept a 32-byte hex/base64 key, or derive one from a passphrase. */
function deriveKey(material) {
  if (Buffer.isBuffer(material) && material.length === 32) return material;
  const s = String(material || '');
  // hex (64 chars) or base64 (44 chars) → use directly if 32 bytes
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  const b64 = Buffer.from(s, 'base64');
  if (b64.length === 32) return b64;
  // otherwise derive deterministically from passphrase (scrypt)
  return crypto.scryptSync(s, 'nexus-dp-salt', 32);
}

/** encryptField — AES-256-GCM. Returns a self-contained string. */
function encryptField(plaintext, keyMaterial) {
  if (plaintext == null) return null;
  const key = deriveKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** decryptField — reverses encryptField; throws if tampered or wrong key. */
function decryptField(packed, keyMaterial) {
  if (packed == null) return null;
  const parts = String(packed).split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Bad ciphertext format');
  const key = deriveKey(keyMaterial);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** maskPII — safe display value; raw PII never shown or logged. */
function maskPII(value, type) {
  const s = String(value || '');
  switch (type) {
    case 'aadhaar': { const d = s.replace(/\D/g, ''); return d.length >= 4 ? 'XXXX XXXX ' + d.slice(-4) : 'XXXX'; }
    case 'pan': return s.length >= 4 ? 'XXXXX' + s.slice(-5, -1) + 'X' : 'XXXXX';
    case 'bank': { const d = s.replace(/\D/g, ''); return d.length >= 4 ? '\u2022\u2022\u2022\u2022' + d.slice(-4) : '\u2022\u2022\u2022\u2022'; }
    case 'phone': { const d = s.replace(/\D/g, ''); return d.length >= 4 ? '\u2022\u2022\u2022\u2022\u2022\u2022' + d.slice(-4) : '\u2022\u2022\u2022\u2022'; }
    default: return s.length > 2 ? s[0] + '***' + s.slice(-1) : '***';
  }
}

/** integritySeal — HMAC-SHA256 over canonical data, for tamper-evidence on
 *  government-bound (C2G) and government-sourced (G2C) payloads. */
function integritySeal(data, keyMaterial) {
  const canonical = typeof data === 'string' ? data : JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHmac('sha256', deriveKey(keyMaterial)).update(canonical).digest('base64');
}

/** verifySeal — constant-time check that data hasn't been altered in transit. */
function verifySeal(data, seal, keyMaterial) {
  const expected = integritySeal(data, keyMaterial);
  const a = Buffer.from(expected); const b = Buffer.from(String(seal || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** validateKey — production refuses weak/dev keys (used by productionGuard). */
function validateKey(keyMaterial, { production } = {}) {
  const s = String(keyMaterial || '');
  if (!production) return { ok: true };
  if (DEV_KEYS.includes(s)) return { ok: false, reason: 'ENCRYPTION_KEY is a dev/default value — set a strong 32-byte key (hex or base64), ideally from a KMS.' };
  if (s.length < 32) return { ok: false, reason: 'ENCRYPTION_KEY too short — use a 32-byte key.' };
  return { ok: true };
}

/** securityPosture — a readable summary of the platform's protection layers. */
function securityPosture() {
  return {
    in_transit: 'TLS/HTTPS (enforced in production via FORCE_HTTPS).',
    at_rest: 'AES-256-GCM field encryption for Aadhaar/PAN/bank (this module).',
    display: 'PII masked on output and in logs (this module).',
    signing: 'Ed25519 (ONDC/Beckn), HMAC-SHA256 (webhooks), hashed auth tokens.',
    integrity_c2g_g2c: 'HMAC integrity seals on citizen\u2194government payloads (non-repudiation + tamper-evidence).',
    consent: 'DPDP consent required before any data sharing (consent gate in onboarding).',
    keys: 'From env/KMS; dev keys refused in production.',
    note: 'Encryption is the capability; applying field encryption across every stored record is a production-hardening migration this module enables.',
  };
}

module.exports = { VERSION, deriveKey, encryptField, decryptField, maskPII, integritySeal, verifySeal, validateKey, securityPosture };
