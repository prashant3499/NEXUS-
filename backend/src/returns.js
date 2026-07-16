/**
 * NEXUS — Returns & Refunds Workflow.
 *
 * Mirrors the grievance.js immutable-state-machine pattern. Our existing
 * Returns policy text promises 7-day returns on non-customized products;
 * this module makes that promise operational.
 *
 * State machine:
 *   requested → approved → in_transit → received → refunded
 *
 * Plus terminal exits:
 *   rejected (seller declines or buyer changes mind)
 *   expired  (return window passed without action)
 *
 * Rules:
 *   - 7-day request window after delivery (configurable per vertical)
 *   - 2-day seller approval SLA (longer = founder escalation)
 *   - 5-day in-transit SLA (carrier dependent)
 *   - 3-day refund processing SLA after received
 *   - Customized products: rejected by policy (cannot be returned)
 *   - High-value (> ₹50K) returns: founder HITL on approval step
 *   - Reverses the slice: refund = original gateway split, reversed
 *
 * All state transitions are immutable — every operation returns a new
 * return record. Original history is preserved.
 */

'use strict';

const crypto = require('crypto');

// ════════════════════════════════════════════════════════════
// STATUS + TRANSITIONS
// ════════════════════════════════════════════════════════════

const RETURN_STATUS = {
  REQUESTED:   'requested',
  APPROVED:    'approved',
  IN_TRANSIT:  'in_transit',
  RECEIVED:    'received',
  REFUNDED:    'refunded',
  REJECTED:    'rejected',
  EXPIRED:     'expired',
};

const STATUS_ORDER = ['requested', 'approved', 'in_transit', 'received', 'refunded'];

const VALID_TRANSITIONS = {
  requested:  ['approved', 'rejected', 'expired'],
  approved:   ['in_transit', 'rejected'],          // buyer might not ship; seller might cancel
  in_transit: ['received', 'expired'],              // package may be lost
  received:   ['refunded', 'rejected'],             // condition check may reject
  refunded:   [],                                    // terminal
  rejected:   [],                                    // terminal
  expired:    [],                                    // terminal
};

// SLA targets in milliseconds — what each stage SHOULD take
const SLA_MS = {
  requested_to_approved:    2 * 24 * 60 * 60 * 1000,   // seller approves in 2 days
  approved_to_in_transit:   3 * 24 * 60 * 60 * 1000,   // buyer ships in 3 days
  in_transit_to_received:   5 * 24 * 60 * 60 * 1000,   // carrier delivers in 5 days
  received_to_refunded:     3 * 24 * 60 * 60 * 1000,   // refund processed in 3 days
};

// Return REQUEST window after delivery: 7 days standard
const REQUEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// High-value threshold for founder HITL on approval (₹50K = 5,000,000 paise)
const HIGH_VALUE_THRESHOLD_PAISE = 5000000;

// ════════════════════════════════════════════════════════════
// REASON CODES — why a return was requested
// ════════════════════════════════════════════════════════════

const RETURN_REASONS = {
  damaged_in_transit:  { label: 'Damaged in transit',         seller_fault: false, carrier_fault: true },
  not_as_described:    { label: 'Not as described',           seller_fault: true,  carrier_fault: false },
  wrong_item_received: { label: 'Wrong item received',        seller_fault: true,  carrier_fault: false },
  quality_issue:       { label: 'Quality below expectation',  seller_fault: true,  carrier_fault: false },
  changed_mind:        { label: 'Changed mind',                seller_fault: false, carrier_fault: false },
  duplicate_order:     { label: 'Duplicate order',             seller_fault: false, carrier_fault: false },
  fit_size_issue:      { label: 'Fit / size issue',            seller_fault: false, carrier_fault: false },
};

// ════════════════════════════════════════════════════════════
// ID GENERATION
// ════════════════════════════════════════════════════════════

function newId(prefix = 'ret_') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

// ════════════════════════════════════════════════════════════
// CREATE — file a return request
// ════════════════════════════════════════════════════════════

/**
 * File a new return request from a buyer.
 *
 * @param {object} args
 * @param {string} args.orderId - the original order being returned
 * @param {string} args.buyerId - the buyer requesting return
 * @param {string} args.sellerId - the seller of record
 * @param {number} args.originalSlicePaise - the original gateway slice
 *                                            (so we can reverse it)
 * @param {number} args.deliveredAt - timestamp of original delivery
 * @param {string} args.reason - one of RETURN_REASONS keys
 * @param {string} args.notes - buyer's free-text description
 * @param {boolean} args.isCustomized - if true, return is rejected per policy
 * @param {number} args.now - "current time" (injectable for tests)
 */
function createReturn(args = {}) {
  const {
    orderId, buyerId, sellerId, originalSlicePaise, deliveredAt,
    reason, notes = '', isCustomized = false, now = Date.now(),
    requestWindowMs = REQUEST_WINDOW_MS,
  } = args;

  if (!orderId)                           throw new Error('orderId is required');
  if (!buyerId)                           throw new Error('buyerId is required');
  if (!sellerId)                          throw new Error('sellerId is required');
  if (!Number.isInteger(originalSlicePaise) || originalSlicePaise <= 0) {
    throw new Error('originalSlicePaise must be a positive integer');
  }
  if (!Number.isInteger(deliveredAt))     throw new Error('deliveredAt is required (ms timestamp)');
  if (!RETURN_REASONS[reason])            throw new Error(`Unknown reason. Use one of: ${Object.keys(RETURN_REASONS).join(', ')}`);

  const id = newId();
  const within_window = (now - deliveredAt) <= requestWindowMs;

  // Three rejection paths at intake:
  if (!within_window) {
    // Out of window — auto-reject as expired
    return Object.freeze({
      id, orderId, buyerId, sellerId,
      originalSlicePaise, deliveredAt,
      reason, notes,
      status: RETURN_STATUS.EXPIRED,
      autoRejected: true,
      autoRejectReason: `Return window of ${Math.round(requestWindowMs / 86400000)} days has passed since delivery`,
      history: Object.freeze([
        Object.freeze({ at: now, from: null, to: RETURN_STATUS.EXPIRED, note: 'request received after window closed' }),
      ]),
      createdAt: now, updatedAt: now,
    });
  }

  if (isCustomized) {
    // Customized products policy-rejected
    return Object.freeze({
      id, orderId, buyerId, sellerId,
      originalSlicePaise, deliveredAt,
      reason, notes,
      status: RETURN_STATUS.REJECTED,
      autoRejected: true,
      autoRejectReason: 'Customized products are not returnable per policy',
      history: Object.freeze([
        Object.freeze({ at: now, from: null, to: RETURN_STATUS.REJECTED, note: 'auto-rejected: customized product' }),
      ]),
      createdAt: now, updatedAt: now,
    });
  }

  // Valid return request — high-value gets a HITL flag, but it's still requested
  const requiresHitl = originalSlicePaise > HIGH_VALUE_THRESHOLD_PAISE;

  return Object.freeze({
    id, orderId, buyerId, sellerId,
    originalSlicePaise, deliveredAt,
    reason, notes,
    status: RETURN_STATUS.REQUESTED,
    autoRejected: false,
    requiresHitl,
    hitlReason: requiresHitl ? `High-value return (>₹${HIGH_VALUE_THRESHOLD_PAISE/100/100000}L) requires founder approval` : null,
    history: Object.freeze([
      Object.freeze({ at: now, from: null, to: RETURN_STATUS.REQUESTED, note: 'buyer filed return' }),
    ]),
    createdAt: now, updatedAt: now,
  });
}

// ════════════════════════════════════════════════════════════
// TRANSITION — move a return to a new status
// ════════════════════════════════════════════════════════════

function transitionStatus(ret, newStatus, note = '', now = Date.now()) {
  if (!ret || !ret.status)            throw new Error('return must have a status');
  const valid = VALID_TRANSITIONS[ret.status];
  if (!valid)                          throw new Error(`No transitions defined from ${ret.status}`);
  if (!valid.includes(newStatus)) {
    throw new Error(`Invalid transition: ${ret.status} → ${newStatus}. Allowed: ${valid.join(', ') || '(terminal)'}`);
  }

  return Object.freeze({
    ...ret,
    status: newStatus,
    history: Object.freeze([
      ...ret.history,
      Object.freeze({ at: now, from: ret.status, to: newStatus, note }),
    ]),
    updatedAt: now,
  });
}

// ════════════════════════════════════════════════════════════
// REFUND CALCULATION — reverse the original slice
// ════════════════════════════════════════════════════════════

/**
 * Compute the refund breakdown for a return.
 *
 * Policy:
 *   - Full refund of buyer payment when seller fault (damaged in transit
 *     is carrier fault but platform absorbs as buyer-friendly default)
 *   - Charity slice is NEVER refunded (already donated)
 *   - Gateway fees: refunded to buyer if seller fault, retained otherwise
 *
 * @param {object} ret - return record
 * @param {object} reverseSlice - { maker, platform, gst, tcs, charity,
 *                                  insurance, gateway_fee } in paise
 */
function computeRefund(ret, reverseSlice = {}) {
  if (!ret || ret.status !== RETURN_STATUS.RECEIVED) {
    throw new Error('Refund can only be computed when status=received');
  }
  const reasonInfo = RETURN_REASONS[ret.reason] || { seller_fault: false, carrier_fault: false };
  const sellerFault  = reasonInfo.seller_fault;
  const carrierFault = reasonInfo.carrier_fault;

  // Charity is never refunded
  const charityRetained = reverseSlice.charity || 0;

  // Maker share: reversed (taken back from maker)
  const makerReversed = reverseSlice.maker || 0;

  // Platform commission: reversed if seller-fault, retained otherwise
  const platformReversed = sellerFault ? (reverseSlice.platform || 0) : 0;
  const platformRetained = sellerFault ? 0 : (reverseSlice.platform || 0);

  // GST: reversed pro-rata with the refunded amount (file credit note)
  const gstReversed = reverseSlice.gst || 0;

  // TCS: reversed (already remitted to govt, but reclaimed via GSTR-8 amendment)
  const tcsReversed = reverseSlice.tcs || 0;

  // Insurance: retained if claim filed for damage; refunded otherwise
  const insuranceRetained = carrierFault ? ((reverseSlice.customer_insurance||reverseSlice.insurance) || 0) : 0;
  const insuranceReversed = carrierFault ? 0 : ((reverseSlice.customer_insurance||reverseSlice.insurance) || 0);

  // Gateway fee: refunded to buyer if seller fault; absorbed by buyer otherwise
  const gatewayRefunded = sellerFault ? (reverseSlice.gateway_fee || 0) : 0;
  const gatewayRetained = sellerFault ? 0 : (reverseSlice.gateway_fee || 0);

  // Total refund to buyer = maker + platform-if-fault + gst + tcs + insurance-if-not-fault + gateway-if-fault
  const buyerRefundPaise = makerReversed + platformReversed + gstReversed + tcsReversed + insuranceReversed + gatewayRefunded;

  return {
    returnId: ret.id,
    orderId: ret.orderId,
    sellerFault,
    carrierFault,
    buyerRefundPaise,
    breakdown: {
      makerReversed, platformReversed, platformRetained,
      gstReversed, tcsReversed,
      charityRetained,
      insuranceReversed, insuranceRetained,
      gatewayRefunded, gatewayRetained,
    },
  };
}

// ════════════════════════════════════════════════════════════
// SLA MONITORING — which returns are breaching their SLAs?
// ════════════════════════════════════════════════════════════

/**
 * For a single return, check whether its current state has exceeded the
 * SLA target. Returns { breached, stage, overdueMs, overdueBy }.
 */
function checkSLA(ret, now = Date.now()) {
  if (!ret || !ret.history || ret.history.length === 0) {
    return { breached: false, reason: 'no_history' };
  }
  const terminal = ['refunded', 'rejected', 'expired'];
  if (terminal.includes(ret.status)) {
    return { breached: false, reason: 'terminal' };
  }
  const stage = ret.status + '_to_' + nextStage(ret.status);
  const target = SLA_MS[stage];
  if (!target) {
    return { breached: false, reason: 'no_sla_defined' };
  }
  // Time spent in current status
  const enteredCurrent = ret.history[ret.history.length - 1].at;
  const elapsed = now - enteredCurrent;
  if (elapsed > target) {
    return {
      breached: true,
      stage,
      currentStatus: ret.status,
      overdueMs: elapsed - target,
      overdueDays: Math.round((elapsed - target) / 86400000 * 10) / 10,
      targetDays: Math.round(target / 86400000 * 10) / 10,
    };
  }
  return { breached: false, stage, currentStatus: ret.status, remainingMs: target - elapsed };
}

function nextStage(status) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

/**
 * For a list of returns, find those breaching SLA. Sorted by most overdue first.
 */
function findBreaches(returns, now = Date.now()) {
  return returns
    .map(r => ({ ret: r, sla: checkSLA(r, now) }))
    .filter(x => x.sla.breached)
    .sort((a, b) => b.sla.overdueMs - a.sla.overdueMs)
    .map(x => ({
      returnId: x.ret.id,
      orderId: x.ret.orderId,
      currentStatus: x.sla.currentStatus,
      overdueDays: x.sla.overdueDays,
      targetDays: x.sla.targetDays,
      reason: x.ret.reason,
    }));
}

// ════════════════════════════════════════════════════════════
// AGGREGATE METRICS — for founder dashboard
// ════════════════════════════════════════════════════════════

function summarize(returns) {
  const stages = {};
  for (const s of Object.values(RETURN_STATUS)) stages[s] = 0;
  let totalRequestedPaise = 0, totalRefundedPaise = 0;
  const reasonCounts = {};
  const terminal = ['refunded', 'rejected', 'expired'];

  for (const r of returns) {
    stages[r.status] = (stages[r.status] || 0) + 1;
    if (r.status === 'refunded') totalRefundedPaise += r.originalSlicePaise;
    if (!terminal.includes(r.status)) totalRequestedPaise += r.originalSlicePaise;
    reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
  }

  const total = returns.length;
  const refundedCount = stages.refunded || 0;
  const rejectedCount = stages.rejected || 0;
  const expiredCount = stages.expired || 0;
  const inProgressCount = total - refundedCount - rejectedCount - expiredCount;

  const refundRate = total > 0
    ? Math.round((refundedCount / total) * 1000) / 10 : 0;
  const rejectionRate = total > 0
    ? Math.round((rejectedCount / total) * 1000) / 10 : 0;

  return {
    total, stages,
    inProgressCount, refundedCount, rejectedCount, expiredCount,
    totalRequestedPaise, totalRefundedPaise,
    refundRate, rejectionRate,
    reasonCounts,
  };
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  RETURN_STATUS, STATUS_ORDER, VALID_TRANSITIONS,
  RETURN_REASONS, SLA_MS, REQUEST_WINDOW_MS, HIGH_VALUE_THRESHOLD_PAISE,
  createReturn, transitionStatus, computeRefund,
  checkSLA, findBreaches, summarize,
};
