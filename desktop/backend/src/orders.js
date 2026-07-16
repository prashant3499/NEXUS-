'use strict';

/**
 * orders.js
 *
 * Real order persistence. Closes the customer loop:
 *   signup → add product → BUYER orders → profit guard checks → settlement
 *
 * The order is the unit of revenue. Each order:
 *   - links one buyer (identified by phone, no auth yet) to one or more
 *     items from one or more sellers
 *   - records the slicer split per item so settlement can replay it
 *   - has a status that moves through a strict state machine
 *   - is immutable except via transitionOrder() / cancelOrder()
 *
 * The order-time profit guard from orderProfitGuard.js runs at createOrder()
 * time. If verdict is DENY, the order is refused at creation — never
 * persisted. WARN orders are accepted but flagged for founder review.
 *
 * NOTE on multi-seller orders: in v1 we assume one order = one seller. A
 * cart with items from multiple sellers gets split into one order per
 * seller at checkout time (caller's responsibility). This keeps the
 * profit guard simple (one seller, one ledger lookup per order).
 */

const slicer = require('./slicer');
const orderProfitGuard = require('./orderProfitGuard');

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const VALID_STATUSES = [
  'pending',           // order placed, awaiting payment
  'paid',              // payment captured
  'fulfilling',        // seller packing
  'shipped',           // courier handed off
  'delivered',         // buyer received — terminal happy path
  'cancelled',         // pre-shipment cancel
  'refund_initiated',  // refund in progress
  'refunded',          // refund complete — terminal sad path
];

/** Forward-only state machine. Each transition has a clear business event. */
const VALID_TRANSITIONS = Object.freeze({
  pending:          ['paid', 'cancelled'],
  paid:             ['fulfilling', 'refund_initiated'],
  fulfilling:       ['shipped', 'refund_initiated'],
  shipped:          ['delivered', 'refund_initiated'],
  delivered:        [],   // returns flow takes over (see src/returns.js)
  cancelled:        ['refund_initiated'],
  refund_initiated: ['refunded'],
  refunded:         [],   // terminal
});

/** Phone validation (Indian numbers only). */
const PHONE_RX = /^(\+91|91)?[6-9]\d{9}$/;

function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/\s|-/g, '');
  if (!PHONE_RX.test(cleaned)) return null;
  return cleaned.replace(/^(\+91|91)/, '');
}

// ════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════

/** Validate the createOrder input. Returns { ok, errors }. */
function validateOrderInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input required'] };

  // Buyer phone (anonymous orders are blocked — every order needs a contact)
  if (!normalizePhone(input.buyer_phone)) {
    errors.push('buyer_phone required (10 digits, Indian)');
  }

  // Shipping address — minimal but required
  if (!input.shipping || typeof input.shipping !== 'object') {
    errors.push('shipping address required');
  } else {
    if (!input.shipping.name || input.shipping.name.trim().length < 2) errors.push('shipping.name required');
    if (!input.shipping.address_line1 || input.shipping.address_line1.trim().length < 3) errors.push('shipping.address_line1 required');
    if (!input.shipping.city) errors.push('shipping.city required');
    if (!input.shipping.state) errors.push('shipping.state required');
    if (!input.shipping.pin_code || !/^\d{6}$/.test(String(input.shipping.pin_code))) {
      errors.push('shipping.pin_code must be 6 digits');
    }
  }

  // Items
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.push('items must be a non-empty array');
  } else if (input.items.length > 20) {
    errors.push('at most 20 items per order');
  } else {
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      if (!item || typeof item !== 'object') { errors.push(`items[${i}] must be an object`); continue; }
      if (!item.product_id || typeof item.product_id !== 'string') errors.push(`items[${i}].product_id required`);
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
        errors.push(`items[${i}].quantity must be 1-100 integer`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Validate a status transition. */
function canTransition(from, to) {
  if (!VALID_STATUSES.includes(from) || !VALID_STATUSES.includes(to)) return false;
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

// ════════════════════════════════════════════════════════════
// ORDER FACTORY
// ════════════════════════════════════════════════════════════

let _idSeq = 0;
function _defaultId() { _idSeq++; return 'ord_' + Date.now().toString(36) + '_' + _idSeq.toString(36); }

/**
 * Create a new order. Looks up each item's product, resolves the seller
 * (must be the same seller for all items in v1), runs the slicer per item,
 * aggregates the order total, then runs the profit guard.
 *
 * @param {object} input        — buyer_phone, shipping, items[{product_id, quantity}], notes
 * @param {object} ctx
 * @param {function} ctx.getProduct(id) — returns the product or null
 * @param {function} ctx.getSeller(id)  — returns the seller or null
 * @param {object}   ctx.ledger          — CostLedger for the profit guard
 * @param {object}   [opts]
 * @param {function} [opts.idGen]        — id generator
 * @param {function} [opts.now]          — clock
 * @param {boolean}  [opts.skipProfitGuard] — for emergency bypass / tests
 * @returns { ok, order } | { ok: false, errors, profit_guard? }
 */
function createOrder(input, ctx, opts = {}) {
  // 1. Input validation
  const validation = validateOrderInput(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  if (!ctx || typeof ctx.getProduct !== 'function' || typeof ctx.getSeller !== 'function') {
    return { ok: false, errors: ['ctx with getProduct + getSeller required'] };
  }
  if (!ctx.ledger && !opts.skipProfitGuard) {
    return { ok: false, errors: ['ctx.ledger required (or pass opts.skipProfitGuard=true)'] };
  }

  // 2. Resolve products + sellers
  const resolvedItems = [];
  let sellerId = null;
  for (let i = 0; i < input.items.length; i++) {
    const reqItem = input.items[i];
    const product = ctx.getProduct(reqItem.product_id);
    if (!product) return { ok: false, errors: [`items[${i}]: product ${reqItem.product_id} not found`] };
    if (product.status !== 'active') {
      return { ok: false, errors: [`items[${i}]: product ${product.id} is not active (status: ${product.status})`] };
    }
    if (product.stock != null && product.stock < reqItem.quantity) {
      return { ok: false, errors: [`items[${i}]: insufficient stock (have ${product.stock}, requested ${reqItem.quantity})`] };
    }
    if (sellerId === null) {
      sellerId = product.seller_id;
    } else if (sellerId !== product.seller_id) {
      return { ok: false, errors: ['v1 limitation: all items in one order must come from the same seller; split your cart by seller before placing'] };
    }
    resolvedItems.push({
      product_id: product.id,
      title: product.title,
      quantity: reqItem.quantity,
      unit_price_paise: product.price_paise,
      line_total_paise: product.price_paise * reqItem.quantity,
      hsn: product.hsn || null,
    });
  }

  const seller = ctx.getSeller(sellerId);
  if (!seller) return { ok: false, errors: [`seller ${sellerId} not found`] };

  // 3. Compute order gross
  const orderTotalPaise = resolvedItems.reduce((sum, it) => sum + it.line_total_paise, 0);
  const orderTotalRupees = orderTotalPaise / 100;

  // 4. Slice the whole order (single aggregate slice, not per-item — keeps
  //    the slicer's integrity check intact). The charity line is governed by
  //    the founder's setting: if charity is disabled, the rate is 0 so no
  //    donation is taken; if enabled, the founder's rate applies.
  let slice;
  try {
    const charityPct = (opts.charity && opts.charity.enabled) ? opts.charity.pct : 0;
    slice = slicer.sliceTransaction(orderTotalRupees, { config: { charity_pct: charityPct } });
  } catch (e) {
    return { ok: false, errors: [`slicer rejected the order: ${e.message}`] };
  }

  // 5. Order profit guard
  let profitGuardResult = null;
  if (!opts.skipProfitGuard) {
    profitGuardResult = orderProfitGuard.canAcceptOrder({
      orderTotalRupees,
      sellerId,
      archetype: seller.archetype,
      ledger: ctx.ledger,
    });
    if (profitGuardResult.verdict === orderProfitGuard.ORDER_VERDICT.DENY) {
      return {
        ok: false,
        errors: ['denied_by_profit_guard'],
        reason: profitGuardResult.reason,
        profit_guard: profitGuardResult,
      };
    }
  }

  // 6. Persist the order record (immutable)
  const now = (opts.now || Date.now)();
  const id = (opts.idGen || _defaultId)();
  const phone = normalizePhone(input.buyer_phone);

  const order = Object.freeze({
    id,
    seller_id: sellerId,
    seller_archetype: seller.archetype,
    seller_of_record: seller.archetype !== 'karigar',  // MoR for karigar
    buyer_phone: phone,
    shipping: Object.freeze({
      name: input.shipping.name.trim(),
      address_line1: input.shipping.address_line1.trim(),
      address_line2: (input.shipping.address_line2 || '').trim() || null,
      city: input.shipping.city.trim(),
      state: input.shipping.state.trim(),
      pin_code: String(input.shipping.pin_code),
    }),
    items: Object.freeze(resolvedItems.map(it => Object.freeze(it))),
    total_paise: orderTotalPaise,
    slice: Object.freeze(slice),
    profit_guard: profitGuardResult ? Object.freeze({
      verdict: profitGuardResult.verdict,
      reason: profitGuardResult.reason,
      contribution_margin_pct: profitGuardResult.contribution_margin_pct,
      platform_contribution_paise: profitGuardResult.platform_contribution_paise,
    }) : null,
    notes: (input.notes || '').trim() || null,
    status: 'pending',
    created_at: now,
    updated_at: now,
    history: Object.freeze([
      Object.freeze({ at: now, from: null, to: 'pending', note: 'Order placed' }),
    ]),
  });

  return { ok: true, order };
}

/**
 * Transition an order to a new status. Returns a NEW order (immutable).
 * Enforces VALID_TRANSITIONS.
 */
function transitionOrder(current, newStatus, opts = {}) {
  if (!current) return { ok: false, errors: ['order not found'] };
  if (!canTransition(current.status, newStatus)) {
    return {
      ok: false,
      errors: [`Invalid transition: ${current.status} → ${newStatus}. Allowed from ${current.status}: ${(VALID_TRANSITIONS[current.status] || []).join(', ') || '(terminal)'}`],
    };
  }
  const now = (opts.now || Date.now)();
  const updated = Object.freeze({
    ...current,
    status: newStatus,
    updated_at: now,
    history: Object.freeze([
      ...current.history,
      Object.freeze({ at: now, from: current.status, to: newStatus, note: opts.note || '' }),
    ]),
  });
  return { ok: true, order: updated };
}

/** Lookup helpers. */
function listOrdersForBuyer(allOrders, phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [];
  return [...allOrders.values()].filter(o => o.buyer_phone === normalized)
    .sort((a, b) => b.created_at - a.created_at);
}

function listOrdersForSeller(allOrders, sellerId) {
  return [...allOrders.values()].filter(o => o.seller_id === sellerId)
    .sort((a, b) => b.created_at - a.created_at);
}

/** Aggregate stats for the founder console. */
function platformOrderStats(allOrders) {
  const orders = [...allOrders.values()];
  const byStatus = {};
  let totalGmvPaise = 0, totalContributionPaise = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    totalGmvPaise += o.total_paise;
    if (o.slice) {
      const commission = o.slice.slices?.platform_commission || 0;
      const gateway = o.slice.slices?.payment_gateway_fee || 0;
      totalContributionPaise += commission - gateway;
    }
  }
  return {
    total_orders: orders.length,
    by_status: byStatus,
    total_gmv_paise: totalGmvPaise,
    total_contribution_paise: totalContributionPaise,
  };
}

module.exports = {
  VALID_STATUSES,
  VALID_TRANSITIONS,
  PHONE_RX,
  normalizePhone,
  validateOrderInput,
  canTransition,
  createOrder,
  transitionOrder,
  listOrdersForBuyer,
  listOrdersForSeller,
  platformOrderStats,
};
