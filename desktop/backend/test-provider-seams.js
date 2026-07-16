'use strict';

/**
 * test-provider-seams.js
 *
 * Verifies the claim "swap one env var and the live provider is wired."
 * Tests the integration point — not the providers themselves.
 *
 * This is the test that would have caught: "the factory exists but the
 * calling code calls `new PaymentGateway()` without passing a provider."
 * (Which was the actual state of platform.js before this turn's audit.)
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ════════════════════════════════════════════════════════════
sec('Razorpay seam — factory wiring');
{
  const { makeProvider } = require('./src/razorpayProvider');
  const { MockProvider } = require('./src/payments');

  // 1. Default config (no env vars) → MockProvider
  const defaultConfig = { payments: { provider: 'mock' }, isProd: false };
  const provider1 = makeProvider(defaultConfig, MockProvider);
  a(provider1 instanceof MockProvider,           'Default config returns MockProvider');

  // 2. PAYMENTS_PROVIDER=razorpay but no keys, dev mode → warn + MockProvider
  const partialConfig = {
    payments: { provider: 'razorpay', razorpayKeyId: null, razorpayKeySecret: null },
    isProd: false,
  };
  const _warn = console.warn; console.warn = () => {};  // silence the expected warning
  const provider2 = makeProvider(partialConfig, MockProvider);
  console.warn = _warn;
  a(provider2 instanceof MockProvider,           'Partial razorpay config falls back to MockProvider (dev)');

  // 3. PAYMENTS_PROVIDER=razorpay but no keys, prod mode → THROWS
  const partialProdConfig = {
    payments: { provider: 'razorpay', razorpayKeyId: null, razorpayKeySecret: null },
    isProd: true,
  };
  let threw = false;
  try { makeProvider(partialProdConfig, MockProvider); } catch (e) { threw = true; }
  a(threw,                                       'Production with no keys throws loudly');
}

sec('Platform actually USES the factory');
{
  // This is the test that catches "factory exists but nobody calls it"
  const { Platform } = require('./src/platform');
  const { MockProvider } = require('./src/payments');
  const { RazorpayProvider } = require('./src/razorpayProvider');

  // 1. No opts → uses factory with default config (mock provider)
  const p1 = new Platform();
  a(p1.gateway.provider instanceof MockProvider,
                                                  'Default Platform() uses MockProvider via factory');

  // 2. Explicit provider in opts → uses that provider
  const customMock = new MockProvider();
  const p2 = new Platform(null, { provider: customMock });
  a(p2.gateway.provider === customMock,           'opts.provider is honored');

  // 3. opts.config drives the factory
  const p3 = new Platform(null, { config: { payments: { provider: 'mock' }, isProd: false } });
  a(p3.gateway.provider instanceof MockProvider, 'opts.config drives the factory');

  // 4. opts.config with razorpay + no keys (dev) → falls back to mock
  const _warn = console.warn; console.warn = () => {};
  const p4 = new Platform(null, {
    config: { payments: { provider: 'razorpay', razorpayKeyId: null }, isProd: false }
  });
  console.warn = _warn;
  a(p4.gateway.provider instanceof MockProvider, 'razorpay-w/o-keys in dev → MockProvider (no crash)');
}

sec('Razorpay seam — interface shape is identical to MockProvider');
{
  const { MockProvider } = require('./src/payments');
  const { RazorpayProvider } = require('./src/razorpayProvider');
  const mock = new MockProvider();
  // RazorpayProvider needs keys, so check method shape on the prototype
  const requiredMethods = ['createOrder', 'authorize', 'capture', 'routeSplit', 'settle', 'refund'];
  requiredMethods.forEach(method => {
    a(typeof mock[method] === 'function',
                                                    `MockProvider.${method}() exists`);
    a(typeof RazorpayProvider.prototype[method] === 'function',
                                                    `RazorpayProvider.prototype.${method}() exists`);
  });
}

sec('DocVerification provider seam — same pattern');
{
  const docV = require('./src/docVerification');
  // The factory is exposed
  a(typeof docV.getProvider === 'function',      'docVerification.getProvider() exposed');
  // No env → MockProvider
  const provider = docV.getProvider();
  a(provider === docV.MockProvider,              'getProvider() returns MockProvider by default');
  // Check the actual MockProvider interface methods
  const requiredMethods = ['aadhaar', 'pan', 'gstin'];
  requiredMethods.forEach(method => {
    a(typeof provider[method] === 'function',     `MockProvider.${method}() exists`);
  });
}

sec('Bhashini seam — present and gated by config');
{
  const bhashini = require('./src/bhashini');
  a(typeof bhashini.getProvider === 'function',  'bhashini.getProvider() exposed');
  a(typeof bhashini.supports === 'function',     'bhashini.supports() exposed');
  // getProvider without env → MockBhashiniProvider
  const provider = bhashini.getProvider({});
  a(provider !== null && provider !== undefined, 'getProvider() returns a provider with no config');
  a(provider.name === 'mock' || provider === bhashini.MockBhashiniProvider,
                                                  'Default provider is the mock');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
