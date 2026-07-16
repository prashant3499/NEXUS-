'use strict';

/**
 * minorGuardian.js
 *
 * The child-safety piece of the status-aware legal core. India's craft economy
 * includes minors who genuinely make and contribute — but a platform that
 * sells on their behalf, holds authorization, and routes money carries a duty
 * of care. The rule is simple and strict:
 *
 *   - An adult (>= 18) onboards normally.
 *   - A MINOR (< 18) may participate ONLY through a verified guardian, under a
 *     "Guardian-MoR" arrangement: the guardian gives consent + authorization,
 *     the payout routes to the guardian's account, and the platform records
 *     the guardianship. The minor is never the contracting party.
 *   - A minor WITHOUT a verified guardian is BLOCKED — cannot transact. There
 *     is no partial path; we fail safe, toward protection.
 *
 * This module decides eligibility and shapes the legal arrangement. It does not
 * itself store data — the caller persists the returned arrangement.
 *
 * Note: "minor" is anyone under 18 (or older where local law defines them as a
 * minor). When age is unknown we DO NOT assume adult — we require a declaration.
 */

const AGE_OF_MAJORITY = 18;

const STATUS = Object.freeze({
  ADULT: 'adult',
  GUARDIAN_MOR: 'guardian_mor',   // minor + verified guardian → allowed under guardian
  BLOCKED_MINOR: 'blocked_minor', // minor without a verified guardian → blocked
  NEEDS_AGE: 'needs_age',         // age not declared → cannot proceed yet
});

/**
 * Compute age in whole years from a date of birth (ISO string or Date).
 * Returns null if unparseable.
 */
function ageFromDob(dob, now = Date.now()) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const ref = new Date(now);
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  return age;
}

/**
 * Validate a guardian. A guardian must be a verified adult with their own
 * identity document and an explicit relationship + consent to act for the minor.
 * @returns { ok, reasons[] }
 */
function validateGuardian(guardian = {}, now = Date.now()) {
  const reasons = [];
  if (!guardian || typeof guardian !== 'object') return { ok: false, reasons: ['no guardian provided'] };
  if (!guardian.name || String(guardian.name).trim().length < 2) reasons.push('guardian name required');
  if (!guardian.idVerified) reasons.push('guardian identity must be verified (Aadhaar/PAN)');
  const gAge = guardian.age != null ? guardian.age : ageFromDob(guardian.dob, now);
  if (gAge == null) reasons.push('guardian age/DOB required');
  else if (gAge < AGE_OF_MAJORITY) reasons.push('guardian must be an adult (>= 18)');
  if (!guardian.relationship) reasons.push('relationship to the minor required');
  if (guardian.consent !== true) reasons.push('guardian must explicitly consent to act for the minor');
  if (!guardian.payoutAccount) reasons.push('payout must route to the guardian\u2019s verified account');
  return { ok: reasons.length === 0, reasons };
}

/**
 * assessParticipant — the gate. Given a person's declared age (or DOB) and an
 * optional guardian, decide how (or whether) they may participate.
 *
 * @param {object} input
 * @param {number} [input.age]        declared age in years
 * @param {string} [input.dob]        date of birth (alternative to age)
 * @param {object} [input.guardian]   guardian profile (required if minor)
 * @param {string} [input.region]     to honour local age-of-majority overrides
 * @returns {object} { status, allowed, arrangement, reasons }
 */
function assessParticipant(input = {}, now = Date.now()) {
  const age = input.age != null ? input.age : ageFromDob(input.dob, now);

  // Fail safe: unknown age is NOT treated as adult.
  if (age == null) {
    return {
      status: STATUS.NEEDS_AGE,
      allowed: false,
      arrangement: null,
      reasons: ['age or date of birth must be declared before onboarding'],
    };
  }

  if (age >= AGE_OF_MAJORITY) {
    return { status: STATUS.ADULT, allowed: true, arrangement: { type: 'standard' }, reasons: [] };
  }

  // Minor → require a verified guardian.
  const g = validateGuardian(input.guardian, now);
  if (!g.ok) {
    return {
      status: STATUS.BLOCKED_MINOR,
      allowed: false,
      arrangement: null,
      reasons: ['minor requires a verified guardian', ...g.reasons],
    };
  }

  // Guardian-MoR arrangement: the guardian is the contracting + paid party.
  return {
    status: STATUS.GUARDIAN_MOR,
    allowed: true,
    arrangement: {
      type: 'guardian_mor',
      minor_age: age,
      guardian: {
        name: input.guardian.name,
        relationship: input.guardian.relationship,
        id_verified: true,
        consent_at: now,
      },
      payout_to: 'guardian',           // money never routes to the minor
      contracting_party: 'guardian',   // the guardian, not the minor, contracts
      recorded_at: now,
    },
    reasons: [],
  };
}

/** Is this assessment one where the platform may proceed to transact? */
function mayTransact(assessment) {
  return !!(assessment && assessment.allowed &&
    (assessment.status === STATUS.ADULT || assessment.status === STATUS.GUARDIAN_MOR));
}

module.exports = {
  AGE_OF_MAJORITY,
  STATUS,
  ageFromDob,
  validateGuardian,
  assessParticipant,
  mayTransact,
};
