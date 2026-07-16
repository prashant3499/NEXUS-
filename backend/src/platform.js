/**
 * UNIFIED PLATFORM — the reconciled core.
 * Wires the 5 best, proven modules into one lifecycle:
 *   selector   → assigns the right legal model per customer (status-aware)
 *   slicer     → divides every transaction with zero rounding drift
 *   hitl       → routes risk to humans, learns from overrides
 *   costEngine → phase-aware spend guard + cheapest-first inference
 *   tourism    → risk-stratified booking with hard KYC link
 *
 * Pure Node.js, zero dependencies. This is EcoVenture and NEXUS reconciled:
 * one idea, status-aware, serving the undocumented AND the registered.
 */

'use strict';

const { resolve, MODEL } = require('./selector');
const { sliceTransaction, fmtINR } = require('./slicer');
const { HITLEngine } = require('./hitl');
const { CostEngine } = require('./costEngine');
const { evaluateBooking } = require('./tourism');
const { PaymentGateway, MockProvider, buildSplitPlan, METHOD } = require('./payments');
const { makeProvider } = require('./razorpayProvider');
const { config } = require('./config');
const { VERTICALS, validateAttributes, complianceHooks, supportsModality, MODALITY } = require('./verticals');
const { AGENTS, runStage, pipeline } = require('./agents');

const MODEL_LABELS = { merchant_of_record:'Merchant of Record', saas_subscription:'SaaS Subscription',
  cooperative_umbrella:'Cooperative Umbrella', agent_intermediary:'Agent / Intermediary',
  guardian_mor:'Guardian-MoR', blocked:'Blocked' };
const MODEL_LABEL_OF = (m) => MODEL_LABELS[m] || m;

class Platform {
  constructor(store = null, opts = {}) {
    this.hitl = new HITLEngine();
    this.cost = new CostEngine({ capResolver: () => require('./spendControl').getCap() });
    // Provider factory honors PAYMENTS_PROVIDER + RAZORPAY_KEY_ID env vars.
    // Falls back to MockProvider in dev/pilot; throws loudly in prod with
    // PAYMENTS_PROVIDER=razorpay but no keys.
    const provider = opts.provider || makeProvider(opts.config || config, MockProvider);
    this.gateway = new PaymentGateway(provider);
    this.store = store; // optional FileStore — when present, state persists
    if (store) {
      const s = store.load();
      this.customers = s.customers;
      this.products = s.products;
      this.orders = s.orders;
      this.ledger = s.ledger;
      this._id = s._id;
    } else {
      this.customers = new Map();
      this.products = new Map();
      this.orders = new Map();
      this.ledger = [];
      this._id = 1;
    }
  }
  _nid(t) { return `${t}_${this._id++}`; }
  _log(e) { this.ledger.push(Object.freeze({ ...e, at: new Date().toISOString() })); }
  _persist() {
    if (this.store) this.store.save({
      customers: this.customers, products: this.products,
      orders: this.orders, ledger: this.ledger, _id: this._id,
    });
  }

  /** Onboard ANY customer — the status-aware selector decides the model. */
  onboard(profile) {
    const decision = resolve(profile);
    const id = this._nid('cust');
    const customer = {
      id, profile,
      model: decision.model,
      fulfilment: decision.fulfilment,
      kyc_tier: decision.kyc_tier,
      liability: decision.liability_map,
      blocks: decision.blocks,
      required_actions: decision.required_actions,
      migration_watch: decision.migration_watch,
    };
    this.customers.set(id, customer);
    this._log({ type: 'onboarded', customer: id, model: decision.model, blocked: decision.blocks.length > 0 });
    this._persist();
    return customer;
  }

  /** List a product (only if the customer isn't blocked). Runs through the
   *  Sourcing + Commerce agents, validates against the vertical schema. */
  listProduct(customerId, { title, supplierPrice, sellPrice, giTag = null, vertical = 'handicraft', attributes = {}, isExport = false }) {
    const c = this.customers.get(customerId);
    if (!c) throw new Error(`Customer ${customerId} not found`);
    if (c.blocks.length > 0) throw new Error(`Customer blocked: ${c.blocks[0]}`);

    // Vertical must exist; validate its required attributes
    if (!VERTICALS[vertical]) throw new Error(`Unknown vertical: ${vertical}`);
    const attrCheck = validateAttributes(vertical, attributes);

    // SOURCING AGENT — gate by value / validation
    const sourcing = runStage('sourcing', {
      newMerchantValue: sellPrice,
      aiValidationErrors: !attrCheck.valid,
    });

    // COMMERCE AGENT — catalog generation, cheapest-first inference
    const route = this.cost.routeInference(
      { isIndic: c.profile.language && c.profile.language !== 'en', task: 'catalog_draft', estPaise: 50 },
      { bhashiniUp: true, gpuQueueDepth: 2 }
    );
    this.cost.record('catalog_draft', route.path, route.costPaise);

    // Compliance hooks that apply for this vertical + context
    const hooks = complianceHooks(vertical, { isExport, isEdible: vertical === 'naturals' });

    const id = this._nid('prod');
    const product = {
      id, customer_id: customerId, title, supplierPrice, sellPrice, giTag,
      vertical, attributes, model: c.model, inference_path: route.path,
      attr_valid: attrCheck.valid, attr_missing: attrCheck.missing,
      compliance_hooks: hooks,
      sourcing_autonomy: sourcing.autonomy,
      needs_review: sourcing.needs_human || !attrCheck.valid,
      status: (sourcing.needs_human || !attrCheck.valid) ? 'pending_review' : 'live',
    };
    this.products.set(id, product);
    this._log({ type: 'listed', product: id, vertical, via: route.path,
      autonomy: sourcing.autonomy, status: product.status });
    this._persist();
    return product;
  }

  /** Process a product order through the correct model + slicer + HITL.
   *  If a payment method is supplied, runs the full UPI/card capture → Route
   *  split → settle cycle. Returns a promise when payment is involved. */
  processOrder(productId, opts = {}) {
    const { buyerName, buyerEmail, buyerPhone, isExport = false, shippingRupees = 0,
            paymentMethod = null, authPayload = null, accounts = null } = opts;
    const product = this.products.get(productId);
    if (!product) throw new Error(`Product ${productId} not found`);
    const c = this.customers.get(product.customer_id);

    const orderId = this._nid('order');
    const slice = sliceTransaction(product.sellPrice, { isExport, shippingRupees });

    // ── Run the agent pipeline (sourcing→profit) for this order ──
    const trace = [];
    // FINANCE AGENT — slicing, TCS, escrow; escalates on big money
    const fin = runStage('finance', { amount: product.sellPrice });
    trace.push({ stage: 'Finance', autonomy: fin.autonomy, needs_human: fin.needs_human, reason: fin.reason });
    // COMPLIANCE AGENT — always mandatory human on gov submissions (exports here)
    if (isExport) {
      const comp = runStage('compliance', {});
      trace.push({ stage: 'Compliance', autonomy: comp.autonomy, needs_human: comp.needs_human, reason: comp.reason });
    }
    // LOGISTICS AGENT — high-value shipment check
    const log = runStage('logistics', { highValueShipment: product.sellPrice > 100000 });
    trace.push({ stage: 'Logistics', autonomy: log.autonomy, needs_human: log.needs_human, reason: log.reason });

    const needsHuman = trace.some(t => t.needs_human) ||
      this.hitl.evaluate({ agent: 'OrderAgent', payout_amount: product.sellPrice, description: `Order ${orderId}` }).needsReview;

    const order = {
      id: orderId, product_id: productId, model: c.model, vertical: product.vertical,
      buyer: buyerName, sell_price: product.sellPrice,
      slice: slice.display,
      agent_trace: trace,
      seller_of_record: (c.model === MODEL.MOR || c.model === MODEL.UMBRELLA || c.model === MODEL.GUARDIAN)
        ? 'platform' : 'customer',
      artisan_liability: (c.model === MODEL.MOR || c.model === MODEL.UMBRELLA || c.model === MODEL.GUARDIAN)
        ? 'NONE' : 'their own (registered seller)',
      status: needsHuman ? 'hitl_review' : 'settled',
      payment: null,
    };
    this.orders.set(orderId, order);
    this._log({ type: 'order', id: orderId, model: c.model, status: order.status, agents: trace.length });

    // ── Founder-in-the-loop: enqueue a REAL, actionable review item ──
    if (needsHuman) {
      const reasons = trace.filter(t => t.needs_human).map(t => `${t.stage}: ${t.reason}`);
      const item = this.hitl.enqueue(
        { agent: 'OrderAgent', description: `Order ${orderId} — ${buyerName}, ${product.title}`,
          confidence: 80, recommendation: 'review' },
        { id: 'order_review', severity: product.sellPrice > 200000 ? 'high' : 'med',
          desc: reasons.join(' · ') || 'Order needs founder review' },
        { order_id: orderId, buyer: buyerName, amount: `₹${product.sellPrice.toLocaleString('en-IN')}`,
          model: MODEL_LABEL_OF(c.model), reasons, seller_of_record: order.seller_of_record }
      );
      order.hitl_item_id = item.id;
      order.hitl_reasons = reasons;
      // payment is HELD — not run until the founder approves
      order.payment_pending = !!paymentMethod;
      order._pendingPayment = paymentMethod ? { slice, paymentMethod, authPayload, accounts } : null;
    }
    this._persist();

    // No payment method → slice-only (backward compatible, synchronous)
    if (!paymentMethod) return order;

    // Held for review → return the paused order; payment runs only on approval
    if (needsHuman) return order;

    // Clean → run the real capture/split/settle cycle (async)
    return this._runPayment(order, slice, { paymentMethod, authPayload, accounts });
  }

  /** Founder decides on a queued item. On approval, any held payment runs. */
  async decideHITL(itemId, decision, reason, decidedBy) {
    const result = this.hitl.decide(itemId, decision, reason, decidedBy);
    if (result.status === 'awaiting_second_signoff') return result;

    // find the order tied to this item
    const order = [...this.orders.values()].find(o => o.hitl_item_id === itemId);
    if (order) {
      if (decision === 'approved') {
        order.status = 'approved';
        order.decided_by = decidedBy;
        if (order._pendingPayment) {
          const pp = order._pendingPayment; order._pendingPayment = null; order.payment_pending = false;
          await this._runPayment(order, pp.slice, pp);
        }
      } else {
        order.status = 'rejected';
        order.decided_by = decidedBy;
        order.payment_pending = false; order._pendingPayment = null;
      }
      this.orders.set(order.id, order);
      this._log({ type: 'hitl_decision', order: order.id, decision, by: decidedBy });
      this._persist();
    }
    return { ...result, order_id: order?.id, order_status: order?.status };
  }

  /** The live founder queue — what's waiting, why, and the recommendation. */
  hitlQueue() { return this.hitl.pending(); }
  hitlAudit() { return this.hitl.auditTrail(); }

  /** Full payment cycle: create → authorize → capture → Route split → settle. */
  async _runPayment(order, slice, { paymentMethod, authPayload, accounts }) {
    const amountPaise = slice.order_total;
    const idempotencyKey = `pay_${order.id}`; // one payment per order — replay-safe

    // 1. Begin payment at gateway
    const payment = await this.gateway.begin({
      orderId: order.id, amountPaise, method: paymentMethod, idempotencyKey,
    });

    // 2. Authorize (UPI: VPA approval; Card: tokenized + 3DS)
    await this.gateway.authorize(payment, authPayload || (
      paymentMethod === METHOD.UPI ? { vpa: 'buyer@upi' } : { cardToken: 'tok_demo' }
    ));

    // 3. Capture into gateway escrow (Razorpay-held — platform never touches it)
    await this.gateway.capture(payment);

    // 4. Route split — gateway disburses directly to linked accounts.
    //    Platform is never in the money path; this is "never holds float" in code.
    const defaultAccounts = {
      merchant: `acc_merchant_${order.product_id}`,
      platform: 'acc_platform_commission',
      taxHolding: 'acc_tax_holding',
      gateway: 'acc_gateway_fees',
      logistics: 'acc_logistics',
    };
    const plan = buildSplitPlan(slice, accounts || defaultAccounts);
    await this.gateway.split(payment, plan);

    // 5. Settle
    await this.gateway.settle(payment);

    order.payment = {
      method: paymentMethod,
      state: payment.state,
      amount: slice.display.order_total,
      split: plan.map(t => ({ account: t.account, amount: `₹${(t.amountPaise/100).toFixed(2)}` })),
      float_held_by_platform: false, // by construction — split happens at gateway
    };
    this.orders.set(order.id, order);
    this._log({ type: 'payment', order: order.id, method: paymentMethod, state: payment.state });
    this._persist();
    return order;
  }

  /** Book a tourism experience through the risk engine. */
  book(booking, identity, operator) {
    const result = evaluateBooking(booking, identity, operator);
    this._log({ type: 'booking_eval', category: booking.category, allowed: result.allowed });
    return result;
  }

  /** Can the platform make this spend right now? */
  canSpend(paise, ctx) { return this.cost.canSpend(paise, ctx); }

  /** Self-improvement: what should we optimise? */
  costOptimisations() { return this.cost.proposeOptimisations(); }

  /** Expose the vertical catalogue (for the UI to offer choices). */
  verticals() {
    return Object.entries(VERTICALS).map(([key, v]) => ({
      key, label: v.label, attributes: v.attributes,
      compliance: v.compliance, high_value: v.high_value,
    }));
  }

  /** Expose the 6-agent pipeline definition. */
  agentPipeline() { return pipeline(); }
}

module.exports = { Platform, MODEL };
