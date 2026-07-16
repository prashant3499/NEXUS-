'use strict';
const { PaymentGateway, MockProvider, buildSplitPlan, PAYMENT_STATE, METHOD } = require('./src/payments');
const { sliceTransaction } = require('./src/slicer');
const { Platform } = require('./src/platform');

let p = 0, f = 0;
const a = (c, m) => { if (c) { p++; console.log('  \u2713 ' + m); } else { f++; console.log('  \u2717 FAIL: ' + m); } };
const sec = (s) => console.log('\n\u2501\u2501\u2501 ' + s + ' \u2501\u2501\u2501\n');

(async () => {

sec('UPI PAYMENT — full cycle');
{
  const gw = new PaymentGateway();
  let pay = await gw.begin({ orderId: 'o1', amountPaise: 158000, method: METHOD.UPI, idempotencyKey: 'k1' });
  a(pay.state === PAYMENT_STATE.CREATED, 'UPI payment created');
  await gw.authorize(pay, { vpa: 'ramvati@oksbi' });
  a(pay.state === PAYMENT_STATE.AUTHORIZED, 'UPI authorized via VPA');
  await gw.capture(pay);
  a(pay.state === PAYMENT_STATE.CAPTURED, 'UPI captured into gateway escrow');
  await gw.split(pay, [{ account: 'm', amountPaise: 158000 }]);
  a(pay.state === PAYMENT_STATE.SPLIT, 'UPI Route split executed');
  await gw.settle(pay);
  a(pay.state === PAYMENT_STATE.SETTLED, 'UPI settled');
}

sec('CARD PAYMENT — tokenized, PCI-safe');
{
  const gw = new PaymentGateway();
  let pay = await gw.begin({ orderId: 'o2', amountPaise: 500000, method: METHOD.CARD, idempotencyKey: 'k2' });
  let rawPanRejected = false;
  try { await gw.authorize(pay, {}); } catch (e) { rawPanRejected = e.message.includes('tokenized'); }
  a(rawPanRejected, 'Card without token rejected (no raw PAN — PCI scope stays at gateway)');
  await gw.authorize(pay, { cardToken: 'tok_visa_4242' });
  a(pay.state === PAYMENT_STATE.AUTHORIZED, 'Card authorized with token');
}

sec('UPI requires VPA, validation enforced');
{
  const gw = new PaymentGateway();
  let pay = await gw.begin({ orderId: 'o3', amountPaise: 1000, method: METHOD.UPI, idempotencyKey: 'k3' });
  let noVpaRejected = false;
  try { await gw.authorize(pay, {}); } catch (e) { noVpaRejected = e.message.includes('VPA'); }
  a(noVpaRejected, 'UPI without VPA rejected');
}

sec('SPLIT PLAN — sums exactly to captured amount');
{
  const slice = sliceTransaction(1580, { shippingRupees: 50 });
  const accounts = { merchant: 'm', platform: 'p', taxHolding: 't', gateway: 'g', logistics: 'l' };
  const plan = buildSplitPlan(slice, accounts);
  const total = plan.reduce((s, t) => s + t.amountPaise, 0);
  a(total === slice.order_total, `Split sums exactly to captured (${total} === ${slice.order_total})`);

  // And the gateway enforces it
  const gw = new PaymentGateway();
  let pay = await gw.begin({ orderId: 'o4', amountPaise: slice.order_total, method: METHOD.UPI, idempotencyKey: 'k4' });
  await gw.authorize(pay, { vpa: 'x@y' });
  await gw.capture(pay);
  let mismatchRejected = false;
  try { await gw.split(pay, [{ account: 'm', amountPaise: 1 }]); } catch (e) { mismatchRejected = e.message.includes('mismatch'); }
  a(mismatchRejected, 'Gateway rejects a split that does not sum to captured amount');
  await gw.split(pay, plan);
  a(pay.state === PAYMENT_STATE.SPLIT, 'Correct split accepted');
}

sec('IDEMPOTENCY — replays never double-charge');
{
  const gw = new PaymentGateway();
  const pay1 = await gw.begin({ orderId: 'o5', amountPaise: 1000, method: METHOD.UPI, idempotencyKey: 'same' });
  const pay2 = await gw.begin({ orderId: 'o5', amountPaise: 1000, method: METHOD.UPI, idempotencyKey: 'same' });
  a(pay1 === pay2, 'Same idempotency key returns the same payment (no double-charge)');
}

sec('STATE MACHINE — invalid transitions blocked');
{
  const gw = new PaymentGateway();
  let pay = await gw.begin({ orderId: 'o6', amountPaise: 1000, method: METHOD.UPI, idempotencyKey: 'k6' });
  let invalidBlocked = false;
  try { await gw.settle(pay); } catch (e) { invalidBlocked = e.message.includes('Invalid payment transition'); }
  a(invalidBlocked, 'Cannot settle a payment that was never captured (state machine enforced)');
}

sec('WEBHOOK — signature verification');
{
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'payment.captured', orderId: 'o7' });
  const crypto = require('crypto');
  const goodSig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  a(PaymentGateway.verifyWebhook(body, goodSig, secret) === true, 'Valid webhook signature accepted');
  a(PaymentGateway.verifyWebhook(body, 'deadbeef', secret) === false, 'Forged webhook signature rejected');
}

sec('PLATFORM INTEGRATION — order with UPI payment end to end');
{
  const plat = new Platform();
  const artisan = plat.onboard({ isMaker: true, hasVoterId: true, language: 'hi' });
  const vase = plat.listProduct(artisan.id, { title: 'Vase', supplierPrice: 850, sellPrice: 1580, language: 'hi' });
  // Domestic order auto-settles (no compliance hold)
  const order = await plat.processOrder(vase.id, {
    buyerName: 'Asha', buyerEmail: 'a@in.co', isExport: false,
    paymentMethod: METHOD.UPI, authPayload: { vpa: 'asha@oksbi' },
  });
  a(order.payment !== null, 'Domestic order carries a payment record');
  a(order.payment.state === PAYMENT_STATE.SETTLED, 'Payment reached SETTLED via UPI');
  a(order.payment.float_held_by_platform === false, 'Platform never held float (split at gateway)');
  const splitTotal = order.payment.split.reduce((s, t) => s + Math.round(parseFloat(t.amount.replace('\u20B9','').replace(/,/g,'')) * 100), 0);
  a(splitTotal === sliceTransaction(1580).order_total, 'Platform-level split sums to order total');

  // Export order is HELD for founder review, then settles on approval (founder-in-the-loop)
  const exp = await plat.processOrder(vase.id, {
    buyerName: 'Sophie', buyerEmail: 's@l.uk', isExport: true,
    paymentMethod: METHOD.UPI, authPayload: { vpa: 'sophie@oksbi' },
  });
  a(exp.payment === null && exp.payment_pending === true, 'Export order HELD — payment pending founder approval');
  await plat.decideHITL(exp.hitl_item_id, 'approved', 'verified', 'founder');
  a(plat.orders.get(exp.id).payment.state === PAYMENT_STATE.SETTLED, 'Held payment settles after founder approval');

  // Card path too
  const order2 = await plat.processOrder(vase.id, {
    buyerName: 'Ahmed', buyerEmail: 'a@x.ae',
    paymentMethod: METHOD.CARD, authPayload: { cardToken: 'tok_x' },
  });
  a(order2.payment.method === METHOD.CARD && order2.payment.state === PAYMENT_STATE.SETTLED, 'Card payment also completes end to end');
}

console.log('\n' + '\u2550'.repeat(52));
console.log('  RESULTS: ' + p + ' passed, ' + f + ' failed');
console.log('\u2550'.repeat(52));
process.exit(f > 0 ? 1 : 0);

})();
