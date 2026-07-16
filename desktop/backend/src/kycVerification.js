'use strict';

/**
 * kycVerification.js
 *
 * Closes a real gap: docVerification.js checks document FORMAT (Aadhaar passes
 * the Verhoeff checksum, PAN matches the regex, GSTIN is structurally valid) —
 * but a format-valid Aadhaar is NOT a verified identity. "Verified maker" must
 * mean "confirmed against the real registry," not "uploaded a well-formed
 * number." Otherwise the platform's core trust promise is hollow.
 *
 * This module adds the registry-verification layer, as a PROVIDER SEAM:
 *   • Aadhaar → DigiLocker / UIDAI offline-eKYC
 *   • PAN     → NSDL / Income Tax PAN verification
 *   • GSTIN   → GSTN taxpayer API
 *   • Bank    → penny-drop (a ₹1 credit that confirms the account is real)
 *
 * No real registry runs without credentials (and many require KYC/contracts to
 * even access), so a MOCK verifier runs by default — and it is HONEST: it marks
 * results as `verified: false, method: 'format_only'`, so the platform never
 * claims a maker is verified when only the format was checked. A real verifier
 * (on credentials) returns `verified: true, method: 'registry'`.
 *
 * Pure + dependency-free; the format checks are delegated to docVerification.
 */

const docVerification = require('./docVerification');

const REGISTRY = Object.freeze({
  aadhaar: 'DigiLocker / UIDAI offline eKYC',
  pan: 'NSDL / Income Tax PAN API',
  gstin: 'GSTN taxpayer API',
  bank: 'Penny-drop (bank account validation)',
});

const VERIFY_STATUS = Object.freeze({ VERIFIED: 'verified', FORMAT_ONLY: 'format_only', INVALID: 'invalid', UNSUPPORTED: 'unsupported' });

function formatCheck(type, value) {
  switch (type) {
    case 'aadhaar': return docVerification.isAadhaarFormat(value);
    case 'pan': return docVerification.isPanFormat(value);
    case 'gstin': return docVerification.isGstinFormat(value);
    case 'bank': return typeof value === 'string' && value.replace(/\s/g, '').length >= 6; // account no. minimal
    default: return false;
  }
}

/**
 * verifyDocument — format-check, then registry-verify via the provider. The
 * result is honest about WHICH happened.
 * @returns { type, status, verified, method, registry, note }
 */
function verifyDocument(type, value, verifier) {
  if (!REGISTRY[type]) return { type, status: VERIFY_STATUS.UNSUPPORTED, verified: false, note: `No registry verification for ${type}.` };
  if (!formatCheck(type, value)) {
    return { type, status: VERIFY_STATUS.INVALID, verified: false, method: 'format', note: `${type} failed the format/checksum check — not a valid number.` };
  }
  // Format is valid. Now attempt registry verification.
  if (verifier && typeof verifier.check === 'function') {
    try {
      const r = verifier.check(type, value);
      if (r && r.verified) {
        return { type, status: VERIFY_STATUS.VERIFIED, verified: true, method: 'registry', registry: REGISTRY[type], name_match: r.name_match, note: 'Confirmed against the registry.' };
      }
      return { type, status: VERIFY_STATUS.FORMAT_ONLY, verified: false, method: r && r.method ? r.method : 'format_only', registry: REGISTRY[type], note: (r && r.note) || 'Registry did not confirm — treated as format-only.' };
    } catch (e) {
      return { type, status: VERIFY_STATUS.FORMAT_ONLY, verified: false, method: 'format_only', note: 'Registry check errored — format-only. ' + e.message };
    }
  }
  // No verifier connected → honest format-only.
  return { type, status: VERIFY_STATUS.FORMAT_ONLY, verified: false, method: 'format_only', registry: REGISTRY[type], note: `Format valid, but ${REGISTRY[type]} not connected — NOT a verified identity yet.` };
}

/**
 * verifySeller — verify all of a seller's docs and produce an overall trust
 * level. `fully_verified` is true ONLY if every present doc is registry-verified.
 */
function verifySeller(docs = {}, verifier) {
  const results = {};
  let present = 0, verified = 0;
  for (const type of Object.keys(REGISTRY)) {
    if (docs[type]) {
      present += 1;
      results[type] = verifyDocument(type, docs[type], verifier);
      if (results[type].verified) verified += 1;
    }
  }
  return {
    results,
    present, verified,
    fully_verified: present > 0 && verified === present,
    trust_level: present === 0 ? 'unverified' : verified === present ? 'registry_verified' : verified > 0 ? 'partially_verified' : 'format_only',
    note: verified === present && present > 0
      ? 'All documents confirmed against registries — a truly verified maker.'
      : 'Some documents are only format-checked. Connect registry verifiers (DigiLocker, GSTN) to make "verified" real.',
  };
}

// ── Provider seam ──
function MockVerifier() {
  return {
    kind: 'mock', live: false,
    // Honest: a mock cannot actually confirm identity, so it does NOT verify.
    check(type, value) {
      return { verified: false, method: 'format_only', note: `Mock — ${REGISTRY[type]} not actually called. Connect a real verifier to confirm identity.` };
    },
  };
}
function makeVerifier(config = {}) {
  // A real KYC provider (DigiLocker partner, Signzy, Karza, etc.) is built from
  // credentials here. Absent those, the mock (which never falsely verifies).
  if (config.kycApiKey && config.kycProvider) {
    return { kind: 'partner', live: true, check() { throw new Error('live KYC verifier not yet implemented'); } };
  }
  return MockVerifier();
}

module.exports = { REGISTRY, VERIFY_STATUS, verifyDocument, verifySeller, MockVerifier, makeVerifier };
