/**
 * NEXUS — Document Verification.
 *
 * Verifies identity, business, and licensure documents that real customers
 * upload. Each document type has a `verify()` function that delegates to a
 * provider adapter (DigiLocker for Aadhaar, NSDL for PAN, GST portal for
 * GSTIN, DGFT for IEC, etc.). The MOCK provider runs in dev and offline
 * tests; the REAL provider is wired when credentials arrive.
 *
 * Pattern mirrors `razorpayProvider.js`: one shared interface, two backends,
 * picked at runtime by config.
 *
 * The verification result is always:
 *   { status, score, fields, reasons }
 * where status ∈ {verified, partial, failed, manual_review, error}
 * and `reasons` is an auditable chain a reviewer can read.
 *
 * IMPORTANT: This module does NOT itself perform document forgery
 * detection or biometric face-match. Those require specialised providers
 * (the relevant calls would be e.g. IDfy, HyperVerge, Karza for face-match,
 * or DigiLocker Pulled Aadhaar). We expose the seam; we don't fake the
 * verification.
 */

'use strict';

const TYPES = {
  AADHAAR:      'aadhaar',
  PAN:          'pan',
  GSTIN:        'gstin',
  IEC:          'iec',
  BANK:         'bank',
  LICENSE:      'license',        // tourism operator licence, gem trade licence, etc.
  PHOTO_SELFIE: 'photo_selfie',   // for face-match against Aadhaar
};

const STATUS = {
  VERIFIED:       'verified',
  PARTIAL:        'partial',         // some checks passed, others need human review
  FAILED:         'failed',          // doc does not validate
  MANUAL_REVIEW:  'manual_review',   // can't be auto-decided, queue for human
  ERROR:          'error',           // upstream provider failed; retry
};

// ────────────────────────────────────────────────────────────
// VALIDATION HELPERS — format checks that don't require any network
// ────────────────────────────────────────────────────────────

/** Aadhaar — 12 digits, Verhoeff checksum.
 *  We deliberately use only format check here. Actual identity verification
 *  happens via DigiLocker pull, not by reading the number off a photo. */
function isAadhaarFormat(value) {
  if (!value || typeof value !== 'string') return false;
  const s = value.replace(/\s+/g, '');
  if (!/^\d{12}$/.test(s)) return false;
  return verhoeffOK(s);
}

const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];

function verhoeffOK(num) {
  let c = 0;
  const reversed = String(num).split('').reverse();
  for (let i = 0; i < reversed.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[i % 8][parseInt(reversed[i], 10)]];
  return c === 0;
}

/** PAN — 5 letters + 4 digits + 1 letter. */
function isPanFormat(value) {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test((value || '').toUpperCase());
}

/** GSTIN — 15 chars, includes 2-digit state code + PAN + entity char + Z + checksum. */
function isGstinFormat(value) {
  const v = (value || '').toUpperCase();
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/.test(v)) return false;
  // Embedded PAN must be a valid PAN format
  const pan = v.slice(2, 12);
  return isPanFormat(pan);
}

/** IEC — 10-digit code (post-2017 DGFT format is IEC = PAN of the firm). */
function isIecFormat(value) {
  const v = (value || '').toUpperCase().trim();
  // Post-2017: IEC = PAN. Pre-2017: 10 alphanumeric.
  return isPanFormat(v) || /^[A-Z0-9]{10}$/.test(v);
}

/** IFSC — bank IFSC code: 4 letters + 0 + 6 alphanumeric. */
function isIfscFormat(value) {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test((value || '').toUpperCase());
}

// ────────────────────────────────────────────────────────────
// MOCK PROVIDER — deterministic, used in dev and tests
// ────────────────────────────────────────────────────────────

const MockProvider = {
  name: 'mock',

  async aadhaar({ number, name } = {}) {
    if (!isAadhaarFormat(number)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'Aadhaar format invalid (12 digits + Verhoeff check failed)' }] };
    }
    // mock: even-ending Aadhaars verify; odd-ending need manual review (deterministic for tests)
    const last = parseInt(number[number.length - 1], 10);
    if (last % 2 === 0) {
      return {
        status: STATUS.VERIFIED, score: 95,
        fields: { name: name || 'MOCK NAME', dobYear: 1985, gender: 'F' },
        reasons: [{ ok: true, text: 'DigiLocker pull successful (mock)' }, { ok: true, text: 'Verhoeff checksum valid' }],
      };
    }
    return {
      status: STATUS.MANUAL_REVIEW, score: 60,
      fields: {},
      reasons: [{ ok: false, text: 'DigiLocker returned no record — manual verification needed (mock odd-trailing-digit)' }],
    };
  },

  async pan({ number, nameMatch } = {}) {
    if (!isPanFormat(number)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'PAN format invalid (expect AAAAA9999A)' }] };
    }
    // mock: 5th-character category check (entity type)
    const cat = number[3]; // 4th char encodes category
    // Valid PAN 4th-character codes per Income Tax Department:
    // P (individual), C (company), H (HUF), F (firm), A (AOP),
    // T (trust), B (BOI), L (local authority), J (juridical), G (government)
    // D (director - rarely used)
    const validCategories = ['P','C','H','F','A','T','B','L','J','G','D'];
    if (!validCategories.includes(cat)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: `PAN category code '${cat}' is invalid` }] };
    }
    return {
      status: STATUS.VERIFIED, score: nameMatch === false ? 70 : 92,
      fields: { entityCategory: cat },
      reasons: [
        { ok: true, text: 'PAN format and category code valid' },
        { ok: nameMatch !== false, text: nameMatch === false ? 'Name does not match PAN holder — partial' : 'Name matches PAN holder' },
      ],
    };
  },

  async gstin({ number } = {}) {
    if (!isGstinFormat(number)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'GSTIN format invalid' }] };
    }
    const stateCode = number.slice(0, 2);
    return {
      status: STATUS.VERIFIED, score: 95,
      fields: { stateCode, embeddedPan: number.slice(2, 12) },
      reasons: [
        { ok: true, text: `GSTIN format valid, state code ${stateCode}` },
        { ok: true, text: 'Embedded PAN extracted; cross-check against PAN verification recommended' },
      ],
    };
  },

  async iec({ number } = {}) {
    if (!isIecFormat(number)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'IEC format invalid' }] };
    }
    return {
      status: STATUS.VERIFIED, score: 90,
      fields: { format: isPanFormat(number) ? 'post-2017 (PAN-based)' : 'pre-2017 (10-alphanumeric)' },
      reasons: [{ ok: true, text: 'IEC format valid; DGFT directory lookup recommended for active-status check (mock)' }],
    };
  },

  async bank({ accountNumber, ifsc, accountHolderName } = {}) {
    if (!accountNumber || accountNumber.length < 9 || accountNumber.length > 18) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'Bank account number must be 9–18 digits' }] };
    }
    if (!isIfscFormat(ifsc)) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'IFSC format invalid (expect AAAA0XXXXXX)' }] };
    }
    if (!accountHolderName || accountHolderName.length < 3) {
      return { status: STATUS.PARTIAL, score: 60, fields: { ifsc, bank: ifsc.slice(0,4) }, reasons: [{ ok: true, text: 'Account format valid' }, { ok: false, text: 'Account-holder name missing — penny-drop verification recommended' }] };
    }
    return {
      status: STATUS.VERIFIED, score: 88,
      fields: { ifsc, bank: ifsc.slice(0,4), accountHolderName },
      reasons: [
        { ok: true, text: 'Account and IFSC format valid' },
        { ok: true, text: 'Penny-drop verification recommended at first payout (mock)' },
      ],
    };
  },

  async license({ kind, number, issuingAuthority } = {}) {
    if (!number || number.length < 3) {
      return { status: STATUS.FAILED, score: 0, fields: {}, reasons: [{ ok: false, text: 'License number missing or too short' }] };
    }
    if (!issuingAuthority) {
      return { status: STATUS.MANUAL_REVIEW, score: 50, fields: {}, reasons: [{ ok: false, text: 'Issuing authority not declared — manual review' }] };
    }
    return {
      status: STATUS.PARTIAL, score: 65,
      fields: { kind: kind || 'unspecified', issuingAuthority },
      reasons: [
        { ok: true, text: 'Format inspection passed' },
        { ok: false, text: 'No federated license registry; manual document review recommended' },
      ],
    };
  },

  async photoSelfie({ /* selfieRef, aadhaarPhotoRef */ } = {}) {
    // Real provider would call e.g. HyperVerge / IDfy face-match.
    return {
      status: STATUS.MANUAL_REVIEW, score: 50, fields: {},
      reasons: [{ ok: false, text: 'Face-match requires a biometric provider (HyperVerge / IDfy); queueing for manual review (mock)' }],
    };
  },
};

// ────────────────────────────────────────────────────────────
// PUBLIC INTERFACE — one call site, provider picked at runtime
// ────────────────────────────────────────────────────────────

function getProvider() {
  // In production this reads from config and returns the real adapter.
  // For now: mock everywhere. The seam exists; the credentials don't.
  return MockProvider;
}

async function verifyDocument(type, payload = {}, providerOverride = null) {
  const p = providerOverride || getProvider();
  try {
    switch (type) {
      case TYPES.AADHAAR:      return await p.aadhaar(payload);
      case TYPES.PAN:          return await p.pan(payload);
      case TYPES.GSTIN:        return await p.gstin(payload);
      case TYPES.IEC:          return await p.iec(payload);
      case TYPES.BANK:         return await p.bank(payload);
      case TYPES.LICENSE:      return await p.license(payload);
      case TYPES.PHOTO_SELFIE: return await p.photoSelfie(payload);
      default: throw new Error(`Unknown document type: ${type}`);
    }
  } catch (e) {
    return { status: STATUS.ERROR, score: 0, fields: {}, reasons: [{ ok: false, text: `Provider error: ${e.message}` }] };
  }
}

/** A seller's overall verification readiness, given a bundle of submitted docs. */
function verificationProfile(results = {}) {
  const entries = Object.entries(results);
  if (entries.length === 0) return { overall: STATUS.MANUAL_REVIEW, score: 0, completeness: 0, missing: ['no documents'] };

  let total = 0, count = 0, blockers = [];
  for (const [type, r] of entries) {
    if (!r) continue;
    count++;
    total += (r.score || 0);
    if (r.status === STATUS.FAILED) blockers.push(`${type}: failed`);
    if (r.status === STATUS.ERROR)  blockers.push(`${type}: provider error`);
  }
  const avg = count ? Math.round(total / count) : 0;
  const overall = blockers.length ? STATUS.FAILED : (avg >= 80 ? STATUS.VERIFIED : avg >= 60 ? STATUS.PARTIAL : STATUS.MANUAL_REVIEW);
  return { overall, score: avg, completeness: count, blockers };
}

module.exports = {
  TYPES, STATUS, MockProvider, getProvider,
  verifyDocument, verificationProfile,
  isAadhaarFormat, isPanFormat, isGstinFormat, isIecFormat, isIfscFormat,
};
