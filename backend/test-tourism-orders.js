'use strict';

/**
 * test-tourism-orders.js — Integration test for the tourism safety gate.
 *
 * A tourism experience order must clear sector risk/KYC rules before money is
 * taken:
 *   - Low-risk (heritage/cultural) from a licensed operator → allowed
 *   - High-risk (adventure/sports) without operator adventure insurance → blocked
 *   - Non-tourism orders are unaffected
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const PORT = 4178;
const DATA_DIR = path.join(__dirname, 'data-test-tourism');
const FOUNDER = 'dev-founder-token';

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = http.request({ method, hostname: 'localhost', port: PORT, path: p, headers }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }); } catch { resolve({ status: res.statusCode, json: null }); } });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitForServer() { for (let i = 0; i < 60; i++) { try { await req('GET', '/health'); return; } catch { await sleep(150); } } throw new Error('no server'); }

const SHIP = { name: 'Tourist Traveler', address_line1: '12 Hotel Road', city: 'Jaipur', state: 'Rajasthan', pin_code: '302001' };

(async () => {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const env = { ...process.env, PORT: String(PORT), DATA_DIR, AUTH_MODE: 'session' };
  const proc = spawn('node', ['server.js'], { env, stdio: 'pipe' });
  let stderr = ''; proc.stderr.on('data', d => stderr += String(d));

  try {
    await waitForServer();

    // Pravasi operator with a tour-operator license
    const otp = await req('POST', '/api/sellers/otp/request', { phone: '9871239000' });
    const ver = await req('POST', '/api/sellers/otp/verify', { phone: '9871239000', otp: otp.json.dev_otp });
    const seller = await req('POST', '/api/sellers', { verification_token: ver.json.verification_token, archetype: 'pravasi', profile: { name: 'Pink City Tours', language: 'hi', state: 'Rajasthan' }, docs: { aadhaar: '1', tour_operator_license: 'RTO-RJ-2024-77' }, consent_all: true, age: 30 });
    const sellerId = seller.json.seller.id;
    const token = seller.json.session_token;

    // Approve a low-risk heritage experience + a high-risk adventure one
    async function listExperience(title, craft, price) {
      const p = await req('POST', '/api/products', { seller_id: sellerId, title, description: 'experience', vertical: 'tourism', craft, price_paise: price, stock: 20, photos: ['data:image/jpeg;base64,x'] }, token);
      await req('POST', '/api/products/' + p.json.id + '/transition', { status: 'pending_review' }, token);
      await req('POST', '/api/products/' + p.json.id + '/transition', { status: 'active' }, FOUNDER);
      return p.json.id;
    }
    const heritageId = await listExperience('Old city heritage walk', 'heritage', 80000);
    const adventureId = await listExperience('Tandem paragliding', 'adventure', 500000);

    sec('Low-risk experience from a licensed operator');
    const ok = await req('POST', '/api/orders', { buyer_phone: '9870001111', buyer_kyc_tier: 0, shipping: SHIP, items: [{ product_id: heritageId, quantity: 2 }] });
    a(ok.status === 201, 'Heritage walk booked even with no buyer KYC (licensed operator, low risk)');

    sec('High-risk experience without operator adventure insurance');
    const blocked = await req('POST', '/api/orders', { buyer_phone: '9870002222', buyer_kyc_tier: 2, shipping: SHIP, items: [{ product_id: adventureId, quantity: 1 }] });
    a(blocked.status === 403, 'Adventure blocked (operator has no bound adventure insurance)');
    a(blocked.json && blocked.json.error === 'tourism_booking_blocked', 'Returns tourism_booking_blocked');
    a(blocked.json.risk_level === 'high', 'Identifies the risk level as high');
    a(Array.isArray(blocked.json.blocks) && blocked.json.blocks.length > 0, 'Explains what is missing');

    sec('Non-tourism order is unaffected by the gate');
    // A normal handicraft product from a different seller
    const o2 = await req('POST', '/api/sellers/otp/request', { phone: '9871239111' });
    const v2 = await req('POST', '/api/sellers/otp/verify', { phone: '9871239111', otp: o2.json.dev_otp });
    const s2 = await req('POST', '/api/sellers', { verification_token: v2.json.verification_token, archetype: 'karigar', profile: { name: 'Potter Ram', language: 'hi', state: 'UP' }, docs: { aadhaar: '1' }, consent_all: true, age: 30 });
    const t2 = s2.json.session_token;
    const craftProd = await req('POST', '/api/products', { seller_id: s2.json.seller.id, title: 'Clay pot', description: 'x', vertical: 'handicraft', craft: 'pottery', price_paise: 120000, stock: 5, photos: ['data:image/jpeg;base64,x'] }, t2);
    await req('POST', '/api/products/' + craftProd.json.id + '/transition', { status: 'pending_review' }, t2);
    await req('POST', '/api/products/' + craftProd.json.id + '/transition', { status: 'active' }, FOUNDER);
    const normalOrder = await req('POST', '/api/orders', { buyer_phone: '9870003333', shipping: SHIP, items: [{ product_id: craftProd.json.id, quantity: 1 }] });
    a(normalOrder.status === 201, 'Handicraft order passes (no tourism gate applied)');

  } catch (e) {
    console.log('  \u2717 EXCEPTION: ' + e.message);
    if (stderr) console.log(stderr.split('\n').slice(0, 6).map(l => '    ' + l).join('\n'));
    fail++;
  } finally {
    proc.kill(); await sleep(200);
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
