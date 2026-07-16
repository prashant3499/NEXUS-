/**
 * NEXUS — Multi-Beneficiary Settlement.
 *
 * For cooperative sellers (Sansthan tier, FPOs, SHGs), one sale settles
 * to MANY artisan bank accounts at the moment of capture. This module
 * decides who gets how many paise.
 *
 * Composes with the existing slicer:
 *   - slicer.js already splits one sale into maker/platform/gst/tcs/
 *     charity/insurance/gateway_fee at the gateway
 *   - This module takes the MAKER portion and splits it again across
 *     the cooperative's member accounts by configured shares
 *
 * Same paise-exact discipline as the slicer:
 *   - All inputs and outputs in integer paise
 *   - No floating-point drift
 *   - Sum of beneficiary shares ALWAYS equals the maker portion exactly
 *   - Rounding remainder goes to the lead beneficiary
 *
 * Beneficiary share model:
 *   { id, name, bank_ac, ifsc, share_bps, role }
 *   share_bps is basis points (1/100 of a percent). 10000 bps = 100%.
 *   Using bps everywhere avoids percentage rounding mistakes.
 *
 * Optional "lead" beneficiary absorbs the rounding remainder so the sum
 * always reconciles to the maker portion. Without a lead, the first
 * beneficiary in the list takes it.
 *
 * Same pattern as returns.js / sourcing.js / grievance.js — pure logic,
 * immutable records, no external dependencies.
 */

'use strict';

const crypto = require('crypto');

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const TOTAL_BPS = 10000;        // 100% expressed in basis points
const MIN_BENEFICIARIES = 1;
const MAX_BENEFICIARIES = 200;  // sanity cap; FPOs with 200+ members go through batched payouts

// ════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════

/** Validate that a beneficiary list is well-formed and shares sum to TOTAL_BPS. */
function validateBeneficiaries(beneficiaries) {
  if (!Array.isArray(beneficiaries)) {
    throw new Error('beneficiaries must be an array');
  }
  if (beneficiaries.length < MIN_BENEFICIARIES) {
    throw new Error(`at least ${MIN_BENEFICIARIES} beneficiary required`);
  }
  if (beneficiaries.length > MAX_BENEFICIARIES) {
    throw new Error(`at most ${MAX_BENEFICIARIES} beneficiaries supported`);
  }
  let totalBps = 0;
  const ids = new Set();
  for (const b of beneficiaries) {
    if (!b || typeof b !== 'object')   throw new Error('beneficiary must be an object');
    if (!b.id)                          throw new Error('beneficiary id is required');
    if (ids.has(b.id))                  throw new Error(`duplicate beneficiary id: ${b.id}`);
    ids.add(b.id);
    if (!b.name)                        throw new Error(`beneficiary ${b.id} has no name`);
    if (!Number.isInteger(b.share_bps)) throw new Error(`beneficiary ${b.id} share_bps must be integer`);
    if (b.share_bps <= 0)                throw new Error(`beneficiary ${b.id} share_bps must be positive (got ${b.share_bps})`);
    if (b.share_bps > TOTAL_BPS)         throw new Error(`beneficiary ${b.id} share_bps cannot exceed ${TOTAL_BPS}`);
    totalBps += b.share_bps;
  }
  if (totalBps !== TOTAL_BPS) {
    throw new Error(`beneficiary shares must sum to ${TOTAL_BPS} bps (100%) — got ${totalBps}`);
  }
}

// ════════════════════════════════════════════════════════════
// SPLIT — the core math
// ════════════════════════════════════════════════════════════

/**
 * Split a maker portion across the configured beneficiaries.
 *
 * @param {number} makerPortionPaise - total to distribute (integer paise)
 * @param {Array<{id, name, bank_ac?, ifsc?, share_bps, role?}>} beneficiaries
 * @param {object} opts
 * @param {string} opts.leadBeneficiaryId - which beneficiary absorbs the
 *                                          rounding remainder. Defaults
 *                                          to the first one.
 * @returns {object} { ok, allocations, totalAllocated, remainderPaise,
 *                     leadBeneficiaryId }
 */
function splitMakerShare(makerPortionPaise, beneficiaries, opts = {}) {
  if (!Number.isInteger(makerPortionPaise) || makerPortionPaise < 0) {
    throw new Error('makerPortionPaise must be a non-negative integer');
  }
  validateBeneficiaries(beneficiaries);

  const leadId = opts.leadBeneficiaryId || beneficiaries[0].id;
  if (!beneficiaries.find(b => b.id === leadId)) {
    throw new Error(`leadBeneficiaryId "${leadId}" not in beneficiary list`);
  }

  // Allocate using floor division on paise * bps / TOTAL_BPS.
  // This always under-allocates by some integer amount of paise <
  // beneficiaries.length. We then give the remainder to the lead.
  const allocations = beneficiaries.map(b => {
    const sharePaise = Math.floor((makerPortionPaise * b.share_bps) / TOTAL_BPS);
    return {
      beneficiaryId: b.id,
      name: b.name,
      bank_ac: b.bank_ac || null,
      ifsc: b.ifsc || null,
      role: b.role || null,
      share_bps: b.share_bps,
      share_pct: Math.round((b.share_bps / 100) * 100) / 100,  // for display
      paise: sharePaise,
    };
  });

  const totalAllocated = allocations.reduce((s, a) => s + a.paise, 0);
  const remainder = makerPortionPaise - totalAllocated;

  // Sanity: remainder must be >= 0 and < number of beneficiaries
  if (remainder < 0 || remainder >= beneficiaries.length) {
    // Should never happen with the floor() math above; throw to surface a real bug
    throw new Error(`split math drift: remainder ${remainder} out of expected range`);
  }

  // Give the remainder to the lead
  const lead = allocations.find(a => a.beneficiaryId === leadId);
  lead.paise += remainder;
  lead.remainderAbsorbed = remainder;

  // Re-verify the invariant (defensive)
  const finalTotal = allocations.reduce((s, a) => s + a.paise, 0);
  if (finalTotal !== makerPortionPaise) {
    throw new Error(`split reconciliation failed: ${finalTotal} != ${makerPortionPaise}`);
  }

  return {
    ok: true,
    makerPortionPaise,
    allocations,
    totalAllocated: finalTotal,
    remainderPaise: remainder,
    leadBeneficiaryId: leadId,
  };
}

// ════════════════════════════════════════════════════════════
// COOPERATIVE REGISTRY — manage cooperative membership
// ════════════════════════════════════════════════════════════

function newId(prefix = 'coop_') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/**
 * Create a new cooperative record. Immutable; updates return a new record.
 */
function createCooperative({ name, segment = 'sansthan', region, beneficiaries, notes = '' } = {}) {
  if (!name)        throw new Error('cooperative name is required');
  if (!region)      throw new Error('region is required');
  validateBeneficiaries(beneficiaries);

  const id = newId();
  const at = Date.now();
  return Object.freeze({
    id, name, segment, region, notes,
    beneficiaries: Object.freeze(beneficiaries.map(b => Object.freeze({ ...b }))),
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Update beneficiary shares for a cooperative. Returns a new record with
 * updated beneficiaries and a fresh updatedAt. Validates new shares before
 * accepting.
 */
function updateBeneficiaries(coop, newBeneficiaries) {
  if (!coop || !coop.id) throw new Error('coop is required');
  validateBeneficiaries(newBeneficiaries);
  return Object.freeze({
    ...coop,
    beneficiaries: Object.freeze(newBeneficiaries.map(b => Object.freeze({ ...b }))),
    updatedAt: Date.now(),
  });
}

// ════════════════════════════════════════════════════════════
// PREVIEW — show the founder how a hypothetical sale would split
// before committing the cooperative configuration
// ════════════════════════════════════════════════════════════

/**
 * Given a cooperative and a hypothetical maker portion, return what
 * each member would receive. Useful for the founder console's
 * "preview a ₹10,000 sale" tool.
 */
function previewSplit(coop, hypotheticalMakerPaise) {
  if (!coop) throw new Error('coop is required');
  return splitMakerShare(hypotheticalMakerPaise, coop.beneficiaries);
}

// ════════════════════════════════════════════════════════════
// PAYOUT LEDGER — record a settled split for audit
// ════════════════════════════════════════════════════════════

/**
 * Build an immutable settlement record (for the audit ledger).
 */
function settlementRecord({ coopId, orderId, splitResult, settledAt = Date.now(), settlementRef = null }) {
  if (!coopId)                          throw new Error('coopId required');
  if (!orderId)                         throw new Error('orderId required');
  if (!splitResult || !splitResult.ok)  throw new Error('splitResult must be a successful split');
  return Object.freeze({
    id: newId('set_'),
    coopId, orderId,
    settlementRef,
    settledAt,
    makerPortionPaise: splitResult.makerPortionPaise,
    allocations: Object.freeze(splitResult.allocations.map(a => Object.freeze({ ...a }))),
    totalAllocated: splitResult.totalAllocated,
  });
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  TOTAL_BPS, MIN_BENEFICIARIES, MAX_BENEFICIARIES,
  validateBeneficiaries,
  splitMakerShare,
  createCooperative, updateBeneficiaries,
  previewSplit,
  settlementRecord,
};
