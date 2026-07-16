'use strict';
/**
 * domain — the formal domain model: typed entities with validation, the order lifecycle
 * as an explicit state machine, and the Merchant-of-Record split abstraction. Additive:
 * existing modules keep working; new code should create entities through here so every
 * record is validated at birth. (Item 1 + 3 of the architecture plan.)
 */
const sanitize = require('./sanitize');

const KINDS = ['maker', 'product', 'order', 'consent', 'payout', 'plan'];

// ── Order lifecycle (explicit state machine) ──
const ORDER_STATUS = ['created', 'paid', 'in_fulfilment', 'shipped', 'delivered', 'settled', 'refunded', 'cancelled'];
const TRANSITIONS = {
  created: ['paid', 'cancelled'],
  paid: ['in_fulfilment', 'refunded', 'cancelled'],
  in_fulfilment: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['settled', 'refunded'],
  settled: [],           // terminal (money done)
  refunded: [],          // terminal
  cancelled: [],         // terminal
};
function canTransition(from, to) { return (TRANSITIONS[from] || []).indexOf(to) >= 0; }
function transition(order, to, by) {
  if (!order || ORDER_STATUS.indexOf(order.status) < 0) return { ok: false, error: 'invalid order/status' };
  if (!canTransition(order.status, to)) return { ok: false, error: 'illegal transition ' + order.status + ' -> ' + to, allowed: TRANSITIONS[order.status] };
  const next = Object.assign({}, order, { status: to, updatedAt: new Date().toISOString() });
  next.history = (order.history || []).concat([{ at: next.updatedAt, from: order.status, to, by: by || 'system' }]);
  return { ok: true, order: next };
}

// ── Schemas ──
const SCHEMAS = {
  maker: { name: { type: 'string', max: 120, required: true }, vertical: { type: 'string', max: 40, required: true }, cluster: { type: 'string', max: 120 }, state: { type: 'string', max: 60 }, tier: { type: 'string', max: 30 }, gi: { type: 'string', max: 10 } },
  product: { title: { type: 'string', max: 200, required: true }, vertical: { type: 'string', max: 40, required: true }, pricePaise: { type: 'number', min: 100, max: 1e11, required: true }, makerId: { type: 'string', max: 60, required: true }, gi: { type: 'string', max: 10 } },
  order: { productId: { type: 'string', max: 60, required: true }, makerId: { type: 'string', max: 60, required: true }, amountPaise: { type: 'number', min: 100, max: 1e11, required: true }, buyerRef: { type: 'string', max: 120 } },
  consent: { makerId: { type: 'string', max: 60, required: true }, kind: { type: 'string', max: 60, required: true }, granted: { type: 'string', max: 10 } },
  payout: { orderId: { type: 'string', max: 60, required: true }, makerId: { type: 'string', max: 60, required: true }, amountPaise: { type: 'number', min: 1, max: 1e11, required: true } },
  plan: { key: { type: 'string', max: 40, required: true }, pricePaise: { type: 'number', min: 0, max: 1e9, required: true }, cycle: { type: 'string', max: 20 } },
};

function validate(kind, data) {
  const spec = SCHEMAS[kind];
  if (!spec) return { ok: false, errors: ['unknown kind: ' + kind] };
  const clean = sanitize.sanitizeObject(data || {}, spec);
  const errors = [];
  Object.keys(spec).forEach((k) => {
    if (spec[k].required && (clean[k] === undefined || clean[k] === '' || clean[k] === null)) errors.push('missing required: ' + k);
  });
  return errors.length ? { ok: false, errors } : { ok: true, value: clean };
}

let _seq = 0;
function create(kind, data) {
  const v = validate(kind, data);
  if (!v.ok) return v;
  const now = new Date().toISOString();
  const entity = Object.assign({ id: kind.slice(0, 2) + '_' + Date.now().toString(36) + (_seq++), kind, createdAt: now, updatedAt: now }, v.value);
  if (kind === 'order') { entity.status = 'created'; entity.history = []; }
  return { ok: true, entity };
}

// ── Merchant-of-Record split abstraction (delegates to the tested slicer) ──
function morSplit(order, feePct) {
  const slicer = require('./slicer');
  const rupees = Math.round((order.amountPaise || 0) / 100);
  const opts = feePct != null ? { config: { platform_commission_pct: feePct / 100 } } : {};
  const s = slicer.sliceTransaction(rupees, opts);
  const payout = (s.slices && s.slices.seller_payout) || 0;
  const collected = s.order_total != null ? s.order_total : rupees * 100;
  return { role: 'merchant_of_record', collectedPaise: collected, makerPayoutPaise: payout, platformFeePaise: collected - payout, never_in_loss: payout <= collected, integrity: true };
}

module.exports = { KINDS, SCHEMAS, ORDER_STATUS, TRANSITIONS, canTransition, transition, validate, create, morSplit };
