'use strict';
/**
 * dataRights — DPDP Act 2023 data-principal rights: access, portability, correction and
 * erasure ("right to be forgotten"). Erasure removes personal data but keeps a legally
 * required, ANONYMISED transaction trail (tax/audit obligation), which DPDP permits.
 */
const REQUEST_TYPES = ['access', 'portability', 'erasure', 'correction'];
const PII_FIELDS = ['name', 'phone', 'email', 'address', 'bank', 'aadhaar', 'kyc', 'gstin', 'contactHandles'];

function isPii(k) { return PII_FIELDS.indexOf(k) >= 0; }

/** Everything held about a subject (right to access / portability). */
function exportData(subjectId, records) {
  const owned = (records || []).filter((r) => r.subjectId === subjectId || r.id === subjectId || r.maker === subjectId);
  return {
    subject: subjectId, generatedAt: new Date().toISOString(),
    record_count: owned.length, records: owned,
    note: 'Machine-readable export of all personal data held (DPDP right to access & portability).',
  };
}

/** Anonymise one record: strip PII, keep non-personal fields for audit. */
function anonymiseRecord(r) {
  const out = {};
  Object.keys(r).forEach((k) => { out[k] = isPii(k) ? '[erased]' : r[k]; });
  out._erased = true; out._erasedAt = new Date().toISOString();
  return out;
}

/** Erase a subject's PII across records, retaining anonymised transaction rows. */
function eraseData(subjectId, records) {
  let erased = 0, retained = 0;
  const result = (records || []).map((r) => {
    if (r.subjectId === subjectId || r.id === subjectId || r.maker === subjectId) {
      erased++;
      if (r.type === 'order' || r.type === 'payout' || r.legalHold) { retained++; return anonymiseRecord(r); }
      return null; // fully deletable record
    }
    return r;
  }).filter((r) => r !== null);
  return {
    subject: subjectId, erased_personal_records: erased,
    retained_anonymised: retained, remaining_total: result.length,
    lawful_retention: 'Anonymised order/payout rows kept for tax & audit (DPDP-permitted).',
    records: result,
  };
}

function correctData(subjectId, patch, records) {
  let corrected = 0;
  const result = (records || []).map((r) => {
    if (r.subjectId === subjectId || r.id === subjectId) { corrected++; return Object.assign({}, r, patch, { _correctedAt: new Date().toISOString() }); }
    return r;
  });
  return { subject: subjectId, corrected, records: result };
}

function processRequest(type, subjectId, records, patch) {
  switch (type) {
    case 'access':
    case 'portability': return exportData(subjectId, records);
    case 'erasure': return eraseData(subjectId, records);
    case 'correction': return correctData(subjectId, patch || {}, records);
    default: return { error: 'unknown request type', allowed: REQUEST_TYPES };
  }
}

module.exports = { REQUEST_TYPES, PII_FIELDS, exportData, eraseData, correctData, anonymiseRecord, processRequest };
