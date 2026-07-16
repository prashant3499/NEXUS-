/**
 * NEXUS — Razorpay provider adapter (the live seam).
 *
 * Implements the EXACT interface MockProvider does, so PaymentGateway works
 * unchanged. Flipping from mock to live is one config change
 * (PAYMENTS_PROVIDER=razorpay) — no engine code changes.
 *
 * This adapter is written against the Razorpay Orders + Route APIs. It requires
 * the `razorpay` npm package and live keys at runtime. Until those are present,
 * the factory below falls back to MockProvider so dev/pilot never breaks.
 *
 * IMPORTANT — the calls here are structured against Razorpay's documented API
 * shape, but MUST be verified against the live Razorpay dashboard + a payments
 * lawyer before real money moves. The Route split is what keeps the platform
 * out of the money path ("never holds float").
 */

'use strict';

class RazorpayProvider {
  constructor({ keyId, keySecret }) {
    if (!keyId || !keySecret) throw new Error('RazorpayProvider requires keyId and keySecret');
    // Lazy require so the package is only needed when actually going live.
    let Razorpay;
    try { Razorpay = require('razorpay'); }
    catch { throw new Error('npm package "razorpay" not installed. Run: npm install razorpay'); }
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this._orders = new Map(); // local mirror keyed by our gateway id
  }

  /** Create an order at Razorpay. amountPaise is the captured total. */
  async createOrder({ amountPaise, currency = 'INR', method, idempotencyKey }) {
    // Razorpay orders are idempotent via receipt; we use our idempotencyKey.
    const order = await this.client.orders.create({
      amount: amountPaise, currency, receipt: idempotencyKey,
      notes: { method, idempotencyKey },
    });
    const rec = { gatewayOrderId: order.id, amountPaise, currency, method, state: 'created', razorpay: order };
    this._orders.set(order.id, rec);
    return rec;
  }

  /**
   * Authorize. With Razorpay, authorization happens client-side (Checkout/UPI
   * intent). Server-side we verify the payment id + signature the client returns.
   * authPayload: { razorpayPaymentId, razorpaySignature } (+ vpa/cardToken for record).
   */
  async authorize(gatewayOrderId, authPayload = {}) {
    const o = this._orders.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    if (!authPayload.razorpayPaymentId) throw new Error('Razorpay authorize requires razorpayPaymentId from client checkout');
    o.paymentId = authPayload.razorpayPaymentId;
    o.state = 'authorized';
    return o;
  }

  /** Capture the authorized payment into Razorpay's escrow. */
  async capture(gatewayOrderId) {
    const o = this._orders.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    await this.client.payments.capture(o.paymentId, o.amountPaise, o.currency);
    o.state = 'captured';
    return o;
  }

  /**
   * Route split — the critical step. Razorpay disburses directly to each
   * linked account, so the platform is NEVER in the money path.
   * transfers: [{ account: 'acc_LinkedAccountId', amountPaise }]
   */
  async routeSplit(gatewayOrderId, transfers) {
    const o = this._orders.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    const total = transfers.reduce((s, t) => s + t.amountPaise, 0);
    if (total !== o.amountPaise) throw new Error(`Split mismatch: ${total} != ${o.amountPaise}`);
    // Razorpay Route: create transfers on the captured payment.
    await this.client.payments.transfer(o.paymentId, {
      transfers: transfers.map(t => ({ account: t.account, amount: t.amountPaise, currency: o.currency })),
    });
    o.state = 'split';
    o.transfers = transfers;
    return o;
  }

  /** Settlement is async at Razorpay; confirmed via webhook. */
  async settle(gatewayOrderId) {
    const o = this._orders.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    o.state = 'settled'; // real confirmation arrives by webhook (payout.processed)
    return o;
  }

  async refund(gatewayOrderId) {
    const o = this._orders.get(gatewayOrderId);
    if (!o) throw new Error('Unknown gateway order');
    await this.client.payments.refund(o.paymentId, { amount: o.amountPaise });
    o.state = 'refunded';
    return o;
  }
}

/**
 * Factory: returns the right provider for the config. Falls back to MockProvider
 * if live isn't configured, so dev/pilot always works and prod fails loud only
 * when it must.
 */
function makeProvider(config, MockProvider) {
  const pc = config.payments;
  if (pc.provider === 'razorpay') {
    if (!pc.razorpayKeyId || !pc.razorpayKeySecret) {
      if (config.isProd) throw new Error('PAYMENTS_PROVIDER=razorpay but keys missing in production');
      console.warn('[payments] razorpay selected without keys — falling back to MockProvider (non-prod)');
      return new MockProvider();
    }
    return new RazorpayProvider({ keyId: pc.razorpayKeyId, keySecret: pc.razorpayKeySecret });
  }
  return new MockProvider();
}

module.exports = { RazorpayProvider, makeProvider };
