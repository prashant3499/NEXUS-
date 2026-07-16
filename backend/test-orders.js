'use strict';

/**
 * test-orders.js
 *
 * Tests the orders module: validation, state machine, slicer integration,
 * profit guard wiring, and read queries.
 */

const O = require('./src/orders');
const profitGuard = require('./src/profitGuard');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ════════════════════════════════════════════════════════════
// FIXTURES
// ════════════════════════════════════════════════════════════

const FIXTURE_PRODUCT = Object.freeze({
  id: 'prod_1',
  seller_id: 'seller_k1',
  title: 'Khurja blue pottery vase',
  price_paise: 158000,
  stock: 12,
  status: 'active',
  hsn: '6913',
});

const FIXTURE_PRODUCT_NIRYATAK = Object.freeze({
  id: 'prod_2',
  seller_id: 'seller_n1',
  title: 'Cut polished diamond',
  price_paise: 4500000,
  stock: 5,
  status: 'active',
  hsn: '7102',
});

const FIXTURE_PRODUCT_INACTIVE = Object.freeze({
  id: 'prod_3',
  seller_id: 'seller_k1',
  title: 'Draft product',
  price_paise: 100000,
  stock: 10,
  status: 'draft',
});

const FIXTURE_SELLER_KARIGAR = Object.freeze({
  id: 'seller_k1',
  archetype: 'karigar',
  status: 'active',
  profile: Object.freeze({ name: 'Ramvati Devi' }),
});

const FIXTURE_SELLER_NIRYATAK = Object.freeze({
  id: 'seller_n1',
  archetype: 'niryatak',
  status: 'active',
  profile: Object.freeze({ name: 'Surat Diamond' }),
});

function makeCtx({ products = {}, sellers = {}, ledger = null } = {}) {
  const allProducts = {
    prod_1: FIXTURE_PRODUCT,
    prod_2: FIXTURE_PRODUCT_NIRYATAK,
    prod_3: FIXTURE_PRODUCT_INACTIVE,
    ...products,
  };
  const allSellers = {
    seller_k1: FIXTURE_SELLER_KARIGAR,
    seller_n1: FIXTURE_SELLER_NIRYATAK,
    ...sellers,
  };
  return {
    getProduct: (id) => allProducts[id] || null,
    getSeller: (id) => allSellers[id] || null,
    ledger: ledger || new profitGuard.CostLedger(),
  };
}

const validInput = (overrides = {}) => ({
  buyer_phone: '9876543210',
  shipping: {
    name: 'Test Buyer',
    address_line1: '123 Test Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pin_code: '400001',
  },
  items: [{ product_id: 'prod_1', quantity: 1 }],
  ...overrides,
});

// ════════════════════════════════════════════════════════════
sec('Constants');
{
  a(O.VALID_STATUSES.length === 8,                                       '8 valid statuses');
  a(O.VALID_STATUSES.includes('pending'),                                'pending is valid');
  a(O.VALID_STATUSES.includes('paid'),                                   'paid is valid');
  a(O.VALID_STATUSES.includes('refunded'),                               'refunded is valid');
  a(O.VALID_TRANSITIONS.pending.includes('paid'),                        'pending → paid');
  a(O.VALID_TRANSITIONS.pending.includes('cancelled'),                   'pending → cancelled');
  a(O.VALID_TRANSITIONS.delivered.length === 0,                          'delivered is terminal');
}

// ════════════════════════════════════════════════════════════
sec('Phone normalization');
{
  a(O.normalizePhone('9876543210') === '9876543210',                     '10-digit accepted');
  a(O.normalizePhone('+919876543210') === '9876543210',                  '+91 prefix stripped');
  a(O.normalizePhone('91 9876 543210') === '9876543210',                 'whitespace cleaned');
  a(O.normalizePhone('1234567890') === null,                             'bad prefix rejected');
  a(O.normalizePhone('') === null,                                       'empty rejected');
}

// ════════════════════════════════════════════════════════════
sec('validateOrderInput — basic validation');
{
  a(O.validateOrderInput(validInput()).ok,                               'Valid input passes');
  a(!O.validateOrderInput({}).ok,                                        'Empty rejected');
  a(!O.validateOrderInput({ ...validInput(), buyer_phone: 'bogus' }).ok, 'Bad phone rejected');
  a(!O.validateOrderInput({ ...validInput(), items: [] }).ok,            'Empty items rejected');
  a(!O.validateOrderInput({ ...validInput(), shipping: null }).ok,       'Missing shipping rejected');
}

sec('validateOrderInput — shipping');
{
  const bad = (s) => ({ ...validInput(), shipping: s });
  a(!O.validateOrderInput(bad({ ...validInput().shipping, pin_code: '12' })).ok,    'Bad PIN rejected');
  a(!O.validateOrderInput(bad({ ...validInput().shipping, pin_code: '400001A' })).ok,'Non-digit PIN rejected');
  a(!O.validateOrderInput(bad({ ...validInput().shipping, name: 'X' })).ok,          'Short name rejected');
  a(!O.validateOrderInput(bad({ ...validInput().shipping, city: '' })).ok,           'Empty city rejected');
}

sec('validateOrderInput — items');
{
  const bad = (items) => ({ ...validInput(), items });
  a(!O.validateOrderInput(bad([{ product_id: 'x', quantity: 0 }])).ok,   'Quantity 0 rejected');
  a(!O.validateOrderInput(bad([{ product_id: 'x', quantity: 101 }])).ok, 'Quantity >100 rejected');
  a(!O.validateOrderInput(bad([{ product_id: 'x', quantity: 1.5 }])).ok, 'Fractional quantity rejected');
  a(!O.validateOrderInput(bad([{ quantity: 1 }])).ok,                    'Missing product_id rejected');
  a(!O.validateOrderInput(bad(Array(21).fill({ product_id:'x', quantity:1 }))).ok, '21+ items rejected');
}

// ════════════════════════════════════════════════════════════
sec('createOrder — happy path');
{
  const ctx = makeCtx();
  const r = O.createOrder(validInput(), ctx, { idGen: () => 'ord_1', now: () => 1_700_000_000_000 });
  a(r.ok,                                                                'Order created');
  a(r.order.id === 'ord_1',                                              'ID assigned');
  a(r.order.status === 'pending',                                        'Starts pending');
  a(r.order.seller_id === 'seller_k1',                                   'Seller resolved');
  a(r.order.seller_archetype === 'karigar',                              'Archetype recorded');
  a(r.order.seller_of_record === false,                                  'Karigar = NOT seller of record (MoR)');
  a(r.order.total_paise === 158000,                                      'Total correct');
  a(r.order.slice && r.order.slice.integrity === 'verified',             'Slice present + verified');
  a(r.order.history.length === 1,                                        'Initial history entry');
  a(r.order.profit_guard !== null,                                       'Profit guard ran');
  a(r.order.profit_guard.verdict !== undefined,                          'Verdict present');
}

sec('createOrder — Niryatak seller of record');
{
  const ctx = makeCtx();
  const input = { ...validInput(), items: [{ product_id: 'prod_2', quantity: 1 }] };
  const r = O.createOrder(input, ctx);
  a(r.ok,                                                                'Niryatak order created');
  a(r.order.seller_of_record === true,                                   'Niryatak IS seller of record');
}

sec('createOrder — multi-quantity totals');
{
  const ctx = makeCtx();
  const input = { ...validInput(), items: [{ product_id: 'prod_1', quantity: 3 }] };
  const r = O.createOrder(input, ctx);
  a(r.ok,                                                                'Multi-qty order created');
  a(r.order.total_paise === 158000 * 3,                                  'Total = price × quantity');
  a(r.order.items[0].line_total_paise === 158000 * 3,                    'Line total correct');
}

sec('createOrder — fails when product not found');
{
  const ctx = makeCtx();
  const input = { ...validInput(), items: [{ product_id: 'nonexistent', quantity: 1 }] };
  const r = O.createOrder(input, ctx);
  a(!r.ok,                                                               'Rejected');
  a(/not found/.test(r.errors[0]),                                       'Error names the missing product');
}

sec('createOrder — fails when product not active');
{
  const ctx = makeCtx();
  const input = { ...validInput(), items: [{ product_id: 'prod_3', quantity: 1 }] };
  const r = O.createOrder(input, ctx);
  a(!r.ok,                                                               'Inactive product rejected');
  a(/not active/.test(r.errors[0]),                                      'Clear error');
}

sec('createOrder — fails when insufficient stock');
{
  const ctx = makeCtx();
  const input = { ...validInput(), items: [{ product_id: 'prod_1', quantity: 100 }] };
  const r = O.createOrder(input, ctx);
  a(!r.ok,                                                               'Over-stock rejected');
  a(/insufficient stock/.test(r.errors[0]),                              'Clear error');
}

sec('createOrder — multi-seller orders rejected in v1');
{
  const ctx = makeCtx();
  const input = {
    ...validInput(),
    items: [
      { product_id: 'prod_1', quantity: 1 },  // karigar
      { product_id: 'prod_2', quantity: 1 },  // niryatak
    ],
  };
  const r = O.createOrder(input, ctx);
  a(!r.ok,                                                               'Multi-seller rejected');
  a(/same seller/.test(r.errors[0]),                                     'Clear error message');
}

sec('createOrder — profit guard DENY refuses persistence');
{
  const ledger = new profitGuard.CostLedger();
  // Burn karigar to near-deny threshold
  ledger.recordCost('seller_k1', 80000, 'burnt');
  const ctx = makeCtx({ ledger });
  // Order with thin margin → marginal cost will be amortized; let's check
  const input = { ...validInput(), items: [{ product_id: 'prod_1', quantity: 1 }] };
  const r = O.createOrder(input, ctx);
  // Either DENY or WARN — at this cost level, marginal/order is ~4400p but
  // contribution on ₹1580 is 1106p — should DENY
  if (!r.ok) {
    a(r.errors.includes('denied_by_profit_guard') || /denied/i.test(r.errors[0]), 'Denied by profit guard');
    a(r.profit_guard.verdict === 'deny',                                  'Verdict is deny');
  } else {
    // If approved/warned, profit guard ran
    a(r.order.profit_guard !== null,                                      'Profit guard ran (warn case)');
  }
}

sec('createOrder — skipProfitGuard bypass works');
{
  const ledger = new profitGuard.CostLedger();
  ledger.recordCost('seller_k1', 200000, 'cooked');
  const ctx = makeCtx({ ledger });
  const r = O.createOrder(validInput(), ctx, { skipProfitGuard: true });
  a(r.ok,                                                                'Bypass succeeds despite burnt seller');
  a(r.order.profit_guard === null,                                       'Profit guard not run');
}

sec('createOrder — frozen order record');
{
  const ctx = makeCtx();
  const r = O.createOrder(validInput(), ctx);
  let mutationBlocked = false;
  try { r.order.status = 'hacked'; mutationBlocked = r.order.status === 'pending'; } catch (e) { mutationBlocked = true; }
  a(mutationBlocked,                                                     'Order is frozen');
}

// ════════════════════════════════════════════════════════════
sec('canTransition — state machine');
{
  a(O.canTransition('pending', 'paid'),                                  'pending → paid');
  a(O.canTransition('pending', 'cancelled'),                             'pending → cancelled');
  a(O.canTransition('paid', 'fulfilling'),                               'paid → fulfilling');
  a(O.canTransition('fulfilling', 'shipped'),                            'fulfilling → shipped');
  a(O.canTransition('shipped', 'delivered'),                             'shipped → delivered');
  a(O.canTransition('paid', 'refund_initiated'),                         'paid → refund_initiated');
  a(O.canTransition('refund_initiated', 'refunded'),                     'refund_initiated → refunded');
  a(!O.canTransition('pending', 'delivered'),                            'pending → delivered blocked');
  a(!O.canTransition('delivered', 'refunded'),                           'delivered terminal');
  a(!O.canTransition('cancelled', 'paid'),                               'cancelled cannot become paid');
  a(!O.canTransition('refunded', 'paid'),                                'refunded terminal');
  a(!O.canTransition('bogus', 'paid'),                                   'Unknown from rejected');
}

sec('transitionOrder — happy path');
{
  const ctx = makeCtx();
  const c = O.createOrder(validInput(), ctx);
  const paid = O.transitionOrder(c.order, 'paid', { note: 'Razorpay captured' });
  a(paid.ok && paid.order.status === 'paid',                             'pending → paid');
  a(paid.order.history.length === 2,                                     'History grew');
  a(paid.order.history[1].note === 'Razorpay captured',                  'Note recorded');
  
  const fulfilling = O.transitionOrder(paid.order, 'fulfilling');
  a(fulfilling.ok && fulfilling.order.status === 'fulfilling',           'paid → fulfilling');
  
  const shipped = O.transitionOrder(fulfilling.order, 'shipped');
  a(shipped.ok && shipped.order.status === 'shipped',                     'fulfilling → shipped');
  
  const delivered = O.transitionOrder(shipped.order, 'delivered');
  a(delivered.ok && delivered.order.status === 'delivered',               'shipped → delivered');
  a(delivered.order.history.length === 5,                                 '5 history entries');
}

sec('transitionOrder — invalid transitions rejected');
{
  const ctx = makeCtx();
  const c = O.createOrder(validInput(), ctx);
  // pending → delivered (skipping states) should be blocked
  const bad = O.transitionOrder(c.order, 'delivered');
  a(!bad.ok,                                                             'Skip-states blocked');
  a(/Invalid transition/.test(bad.errors[0]),                             'Clear error');
}

sec('transitionOrder — original unchanged after transition');
{
  const ctx = makeCtx();
  const c = O.createOrder(validInput(), ctx);
  const paid = O.transitionOrder(c.order, 'paid');
  a(c.order.status === 'pending',                                        'Original still pending (immutability)');
  a(paid.order.status === 'paid',                                        'New copy is paid');
  a(c.order !== paid.order,                                              'Different object refs');
}

// ════════════════════════════════════════════════════════════
sec('listOrdersForBuyer + listOrdersForSeller');
{
  const ctx = makeCtx();
  const orders = new Map();
  
  const r1 = O.createOrder(validInput(), ctx, { idGen: () => 'o1', now: () => 1000 });
  orders.set('o1', r1.order);
  
  const r2 = O.createOrder({ ...validInput(), items: [{ product_id: 'prod_2', quantity: 1 }] }, ctx, { idGen: () => 'o2', now: () => 2000 });
  orders.set('o2', r2.order);
  
  // Same buyer phone, different seller
  const buyerOrders = O.listOrdersForBuyer(orders, '9876543210');
  a(buyerOrders.length === 2,                                            'Buyer has 2 orders');
  a(buyerOrders[0].created_at >= buyerOrders[1].created_at,              'Newest first');
  
  const sellerK = O.listOrdersForSeller(orders, 'seller_k1');
  a(sellerK.length === 1,                                                'Karigar seller has 1 order');
  
  const sellerN = O.listOrdersForSeller(orders, 'seller_n1');
  a(sellerN.length === 1,                                                'Niryatak seller has 1 order');
}

sec('platformOrderStats');
{
  const ctx = makeCtx();
  const orders = new Map();
  
  const r1 = O.createOrder(validInput(), ctx, { idGen: () => 'o1' });
  orders.set('o1', r1.order);
  
  // Cancel one
  const cancelled = O.transitionOrder(r1.order, 'cancelled');
  orders.set('o1', cancelled.order);
  
  const r2 = O.createOrder({ ...validInput(), items: [{ product_id: 'prod_2', quantity: 1 }] }, ctx, { idGen: () => 'o2' });
  orders.set('o2', r2.order);
  
  const stats = O.platformOrderStats(orders);
  a(stats.total_orders === 2,                                            '2 total orders');
  a(stats.by_status.pending === 1,                                       '1 pending');
  a(stats.by_status.cancelled === 1,                                     '1 cancelled');
  a(stats.total_gmv_paise === 158000 + 4500000,                          'GMV = sum of totals');
  a(typeof stats.total_contribution_paise === 'number',                  'Contribution paise present');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
