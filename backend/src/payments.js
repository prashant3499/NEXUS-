/**
 * UNIFIED — Payment Gateway Layer
 * UPI + Card acceptance with Razorpay Route split-settlement.
 * Pure Node.js. Provider-agnostic interface + a working mock provider for tests;
 * real adapters (Razorpay/Cashfree) plug in at the same interface.
 *
 * Design principles enforced here:
 *  - "Platform never holds float": funds are split AT the gateway (Route), so
 *    the platform is never in the money path. The gateway settles directly to
 *    each linked account (merchant + platform commission).
 *  - Idempotency: every charge carries an idempotency key; replays never
 *    double-charge or double-split.
 *  - State machine: created → authorized → captured → split → settled (or failed/refunded).
 */

'use strict';

const crypto = require('crypto');

const PAYMENT_STATE = {
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  SPLIT: 'split',          // Route split executed at gateway
  SETTLED: 'settled',      // funds reached linked accounts
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const METHOD = {
  UPI: 'upi',              // UPI collect / intent / QR
  CARD: 'card',            // credit/debit card
  NETBANKING: 'netbanking',
  WALLET: 'wallet',
};

const VALID_TRANSITIONS = {
  created:    ['authorized', 'failed'],
  authorized: ['captured', 'failed'],
  captured:   ['split', 'refunded'],
  split:      ['settled', 'refunded'],
  settled:    ['refunded'],
  failed:     [],
  refunded:   [],
};

/**
 * Provider interface. A real provider (Razorpay) implements these methods
 * against the live API. The MockProvider below implements them deterministically
 * so the whole flow is testable with zero network.
 */
class MockProvider {
  constructor() { this.charges = new Map(); this.idempotency = new Map(); }

  /** Create an order at the gateway. Returns a gateway order id. */
  async createOrder({ amountPaise, currency = 'INR', method, idempotencyKey }) {
    if (this.idempotency.has(idempotencyKey)) {
      return this.idempotency.get(idempotencyKey); // replay-safe
    }
    if (!Object.values(METHOD).includes(method)) {
      throw new Error(`Unsupported payment method: ${method}`);
    }
    const gatewayOrderId = 'gw_' + crypto.randomBytes(8).toString('hex');
    const order = { gatewayOrderId, amountPaise, currency, method, state: PAYMENT_STATE.CREATED };
    this.charges.set(gatewayOrderId, order);
    this.idempotency.set(idempotencyKey, order);
    return order;
  }

  /** Authorize (UPI: customer approves in app; Card: 3DS/OTP). */
  async authorize(gatewayOrderId, authPayload = {}) {
    const o = this.charges.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    // UPI requires a VPA; card requires a token (never raw PAN — PCI scope stays at gateway)
    if (o.method === METHOD.UPI && !authPayload.vpa) throw new Error('UPI requires a VPA (e.g. name@bank)');
    if (o.method === METHOD.CARD && !authPayload.cardToken) throw new Error('Card requires a tokenized card (PCI: no raw PAN)');
    o.state = PAYMENT_STATE.AUTHORIZED;
    o.auth = { method: o.method, ref: authPayload.vpa || authPayload.cardToken };
    return o;
  }

  /** Capture the authorized amount into the gateway escrow (Razorpay-held). */
  async capture(gatewayOrderId) {
    const o = this.charges.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    o.state = PAYMENT_STATE.CAPTURED;
    return o;
  }

  /**
   * Route split: gateway splits captured funds to linked accounts.
   * THIS is what keeps the platform out of the money path. The split executes
   * inside the gateway; the platform only instructs the proportions.
   */
  async routeSplit(gatewayOrderId, transfers) {
    const o = this.charges.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    const total = transfers.reduce((s, t) => s + t.amountPaise, 0);
    if (total !== o.amountPaise) {
      throw new Error(`Split mismatch: transfers ${total} != captured ${o.amountPaise}`);
    }
    o.state = PAYMENT_STATE.SPLIT;
    o.transfers = transfers; // each → a linked account (merchant, platform commission)
    return o;
  }

  /** Settlement confirmation (async in reality; immediate in mock). */
  async settle(gatewayOrderId) {
    const o = this.charges.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    o.state = PAYMENT_STATE.SETTLED;
    return o;
  }

  async refund(gatewayOrderId) {
    const o = this.charges.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    o.state = PAYMENT_STATE.REFUNDED;
    return o;
  }
}

/**
 * PaymentGateway — orchestrates a payment through the state machine using a
 * provider, enforcing valid transitions and idempotency.
 */
class PaymentGateway {
  constructor(provider = new MockProvider()) {
    this.provider = provider;
    this.payments = new Map();
  }

  _transition(payment, to) {
    const allowed = VALID_TRANSITIONS[payment.state] || [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid payment transition: ${payment.state} → ${to}`);
    }
    payment.state = to;
    payment.history.push({ state: to, at: new Date().toISOString() });
  }

  /**
   * Begin a payment for a sliced order. `splitPlan` comes from the slicer:
   * which linked account gets what. Returns a payment handle.
   */
  async begin({ orderId, amountPaise, method, idempotencyKey }) {
    if (this.payments.has(idempotencyKey)) return this.payments.get(idempotencyKey); // replay-safe
    const gwOrder = await this.provider.createOrder({ amountPaise, method, idempotencyKey });
    const payment = {
      orderId, amountPaise, method,
      gatewayOrderId: gwOrder.gatewayOrderId,
      state: PAYMENT_STATE.CREATED,
      history: [{ state: PAYMENT_STATE.CREATED, at: new Date().toISOString() }],
      idempotencyKey,
    };
    this.payments.set(idempotencyKey, payment);
    return payment;
  }

  /** UPI: customer approves via VPA/QR/intent. Card: tokenized + 3DS. */
  async authorize(payment, authPayload) {
    await this.provider.authorize(payment.gatewayOrderId, authPayload);
    this._transition(payment, PAYMENT_STATE.AUTHORIZED);
    return payment;
  }

  async capture(payment) {
    await this.provider.capture(payment.gatewayOrderId);
    this._transition(payment, PAYMENT_STATE.CAPTURED);
    return payment;
  }

  /**
   * Execute the Route split. transfers = [{ account, amountPaise, role }].
   * Must sum to the captured amount. Gateway disburses; platform never holds float.
   */
  async split(payment, transfers) {
    await this.provider.routeSplit(payment.gatewayOrderId, transfers);
    this._transition(payment, PAYMENT_STATE.SPLIT);
    payment.transfers = transfers;
    return payment;
  }

  async settle(payment) {
    await this.provider.settle(payment.gatewayOrderId);
    this._transition(payment, PAYMENT_STATE.SETTLED);
    return payment;
  }

  async refund(payment) {
    await this.provider.refund(payment.gatewayOrderId);
    this._transition(payment, PAYMENT_STATE.REFUNDED);
    return payment;
  }

  /**
   * Verify a webhook signature (Razorpay uses HMAC-SHA256 of body with secret).
   * Real providers sign payloads; we verify before trusting any state change.
   */
  static verifyWebhook(rawBody, signature, secret) {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    // timing-safe compare
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch { return false; }
  }
}

/**
 * Build the Route transfer plan from a slicer result.
 * Merchant gets their net; platform commission + GST go to the platform's
 * own linked account; taxes (TCS/TDS) route to a designated tax-holding account.
 * Every paisa is accounted for so the split sums exactly to the captured amount.
 */
function buildSplitPlan(slice, accounts) {
  const s = slice.slices;
  const insurance = s.customer_insurance || s.insurance || 0; // customer-side, collected on top
  const transfers = [
    { account: accounts.merchant,   amountPaise: s.seller_payout,       role: 'merchant_net' },
    { account: accounts.platform,   amountPaise: s.platform_commission + s.gst_on_commission, role: 'platform_commission_gst' },
    { account: accounts.taxHolding, amountPaise: s.tcs_collection + s.tds_deduction, role: 'tax_tcs_tds' },
    { account: accounts.gateway,    amountPaise: s.payment_gateway_fee, role: 'gateway_fee' },
    { account: accounts.platform,   amountPaise: insurance + s.charity_donation, role: 'insurance_charity' },
  ];
  if (s.shipping_cost > 0) transfers.push({ account: accounts.logistics, amountPaise: s.shipping_cost, role: 'shipping' });
  // Merge transfers to the same account so the gateway gets clean instructions
  const merged = {};
  for (const t of transfers) {
    if (t.amountPaise === 0) continue;
    merged[t.account] = (merged[t.account] || 0) + t.amountPaise;
  }
  return Object.entries(merged).map(([account, amountPaise]) => ({ account, amountPaise }));
}

module.exports = { PaymentGateway, MockProvider, buildSplitPlan, PAYMENT_STATE, METHOD };
