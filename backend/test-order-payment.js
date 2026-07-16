'use strict';

/**
 * test-order-payment.js — Integration test for /api/orders/:id/pay + /refund.
 *
 * Spawns the server (auth disabled so we test the payment path, not auth —
 * auth has its own suite), runs a real order through the gateway lifecycle,
 * and verifies the Route split sums to the order total with zero drift.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const PORT = 4107;
const DATA_DIR = path.join(__dirname, 'data-test-pay');
const STORE_FILE = path.join(DATA_DIR, 'nexus-store.json');

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      method, hostname: 'localhost', port: PORT, path: p,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }); } catch { resolve({ status: res.statusCode, json: null, raw: buf }); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitForServer() {
  for (let i = 0; i < 50; i++) { try { await req('GET', '/health'); return; } catch { await sleep(150); } }
  throw new Error('server did not start');
}

(async () => {
  if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
  const env = { ...process.env, PORT: String(PORT), DATA_DIR, AUTH_MODE: 'none' };
  const proc = spawn('node', ['server.js'], { env, stdio: 'pipe' });
  let stderr = ''; proc.stderr.on('data', d => stderr += String(d));

  try {
    await waitForServer();
    console.log('  Server up on :' + PORT);

    // Setup: seller → product → approve
    const otp = await req('POST', '/api/sellers/otp/request', { phone: '9870000001' });
    const ver = await req('POST', '/api/sellers/otp/verify', { phone: '9870000001', otp: otp.json.dev_otp });
    const seller = await req('POST', '/api/sellers', { verification_token: ver.json.verification_token, archetype: 'karigar', profile: { name: 'Pay Seller', language: 'hi', state: 'UP' }, docs: { aadhaar: '1' }, consent_all: true, age: 30 });
    const sellerId = seller.json.seller.id;
    const prod = await req('POST', '/api/products', { seller_id: sellerId, title: 'Pay vase', description: 'x', vertical: 'handicraft', craft: 'pottery', price_paise: 158000, stock: 5, photos: ['data:image/jpeg;base64,x'] });
    const prodId = prod.json.id;
    await req('POST', '/api/products/' + prodId + '/transition', { status: 'pending_review' });
    await req('POST', '/api/products/' + prodId + '/transition', { status: 'active' });

    sec('Order creation → pending');
    const order = await req('POST', '/api/orders', { buyer_phone: '9871111111', shipping: { name: 'Buyer', address_line1: '1 Road', city: 'Pune', state: 'MH', pin_code: '411001' }, items: [{ product_id: prodId, quantity: 1 }] });
    a(order.status === 201, 'Order created (201)');
    a(order.json.status === 'pending', 'Order starts pending');
    const orderId = order.json.id;
    const total = order.json.total_paise;

    sec('Pay → gateway lifecycle + Route split');
    const pay = await req('POST', '/api/orders/' + orderId + '/pay', { method: 'upi', auth_payload: { vpa: 'buyer@oksbi' } });
    a(pay.status === 200, 'Payment succeeds (200)');
    a(pay.json.status === 'paid', 'Order advanced to paid');
    a(pay.json.payment && pay.json.payment.status === 'settled', 'Payment state settled');
    a(!!pay.json.payment.gateway_order_id, 'Gateway order id present');
    a(Array.isArray(pay.json.payment.transfers) && pay.json.payment.transfers.length > 0, 'Route transfers present');
    const sum = pay.json.payment.transfers.reduce((s, t) => s + t.amountPaise, 0);
    const buyerPays = order.json.slice ? order.json.slice.buyer_pays : total;
    a(sum === buyerPays, `Route split sums to what the buyer paid (${sum} === ${buyerPays}; insurance customer-side on top of ${total})`);

    sec('Pay again → 409 (not payable)');
    const pay2 = await req('POST', '/api/orders/' + orderId + '/pay', { method: 'upi' });
    a(pay2.status === 409, 'Already-paid order rejects re-payment');

    sec('Refund → paid → refunded');
    const refund = await req('POST', '/api/orders/' + orderId + '/refund', { reason: 'buyer changed mind' });
    a(refund.status === 200, 'Refund succeeds (200)');
    a(refund.json.status === 'refunded', 'Order advanced to refunded');
    a(refund.json.payment.status === 'refunded', 'Payment marked refunded');

    sec('Refund again → 409 (not refundable)');
    const refund2 = await req('POST', '/api/orders/' + orderId + '/refund', {});
    a(refund2.status === 409, 'Already-refunded order rejects re-refund');

    sec('Pay a non-existent order → 404');
    const pay404 = await req('POST', '/api/orders/ord_nonexistent/pay', { method: 'upi' });
    a(pay404.status === 404, 'Unknown order → 404');

  } catch (e) {
    console.log('  \u2717 EXCEPTION: ' + e.message);
    if (stderr) console.log('  server stderr:\n' + stderr.split('\n').slice(0, 6).map(l => '    ' + l).join('\n'));
    fail++;
  } finally {
    proc.kill();
    await sleep(200);
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
