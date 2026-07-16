'use strict';
/**
 * paymentStateMachine — the PAYMENT lifecycle as an explicit state machine, separate from the
 * ORDER lifecycle (domain.js). Mirrors a gateway (Razorpay): a payment is authorized → captured
 * → settled, or fails/refunds. Kept independent so order status and money status can't be
 * conflated. Terminal states are frozen; illegal transitions refused (same discipline as domain).
 */
const PAYMENT_STATUS = ['pending', 'authorized', 'captured', 'settled', 'failed', 'refunded'];
const TRANSITIONS = {
  pending: ['authorized', 'failed'],
  authorized: ['captured', 'failed'],
  captured: ['settled', 'refunded'],
  settled: ['refunded'],
  failed: [],       // terminal
  refunded: [],     // terminal
};

function canTransition(from, to) { return (TRANSITIONS[from] || []).indexOf(to) >= 0; }

function create(orderId, amountPaise) {
  return { id: 'pay_' + Date.now().toString(36), orderId: String(orderId || ''), amountPaise: Number(amountPaise) || 0, status: 'pending', history: [], createdAt: new Date().toISOString() };
}

function transition(payment, to, by) {
  if (!payment || PAYMENT_STATUS.indexOf(payment.status) < 0) return { ok: false, error: 'invalid payment/status' };
  if (!canTransition(payment.status, to)) return { ok: false, error: 'illegal payment transition ' + payment.status + ' -> ' + to, allowed: TRANSITIONS[payment.status] };
  const next = Object.assign({}, payment, { status: to, updatedAt: new Date().toISOString() });
  next.history = (payment.history || []).concat([{ at: next.updatedAt, from: payment.status, to, by: by || 'gateway' }]);
  try { require('./auditLog').append({ action: 'payment_transition', id: payment.id, from: payment.status, to, by: by || 'gateway' }); } catch (e) {}
  return { ok: true, payment: next };
}

module.exports = { PAYMENT_STATUS, TRANSITIONS, canTransition, create, transition };
