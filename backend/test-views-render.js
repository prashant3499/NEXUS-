'use strict';

/**
 * test-views-render.js — Actually exercise every view function.
 *
 * The script-execution smoke test catches load-time errors. THIS test
 * catches errors that only surface when a view's render function is
 * called — which happens on user interaction (clicking the role switch,
 * navigating to a page, etc.).
 *
 * For each role × archetype × view, call the view function and verify
 * it returns a string without throwing.
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const code = scriptMatch[1];

// ────────────────────────────────────────────────────────────
// Build a more complete DOM stub so views can render
// ────────────────────────────────────────────────────────────

const elStore = {};
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>{}, contains: ()=>false },
    style: {}, children: [], dataset: {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: () => {}, appendChild: (c) => { el.children.push(c); return c; },
    removeChild: () => {}, insertAdjacentHTML: () => {}, remove: () => {}, focus: () => {},
    querySelectorAll: () => [], querySelector: () => null,
    innerHTML: '', textContent: '', value: '', onclick: null, parentNode: null,
    offsetWidth: 100, offsetHeight: 100, scrollHeight: 200,
  };
  return el;
}

const doc = {
  documentElement: makeEl('html'),
  head: makeEl('head'),
  body: makeEl('body'),
  getElementById: (id) => elStore[id] || (elStore[id] = makeEl()),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: makeEl,
  addEventListener: () => {},
  dispatchEvent: () => true,
  activeElement: makeEl(),
};
const win = {
  addEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  location: { hash: '', pathname: '/', protocol: 'http:', search: '' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { language: 'en', serviceWorker: {
    register: () => Promise.resolve({ addEventListener: () => {} }),
    addEventListener: () => {}, controller: null,
    ready: Promise.resolve({ addEventListener: () => {} }),
  } },
  scrollTo: () => {}, setTimeout: setTimeout, clearTimeout: clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ leads: [], result: null }) }),
  alert: () => {}, confirm: () => true,
  toggleAI: () => {},
};
// Plain assignment silently no-ops for getter-only built-in globals
// (e.g. `navigator` on Node 20), so force the override with defineProperty.
const setGlobal = (k, v) => {
  try { Object.defineProperty(global, k, { value: v, configurable: true, writable: true }); }
  catch (_) { try { global[k] = v; } catch (_) {} }
};
setGlobal('document', doc);
setGlobal('window', win);
setGlobal('navigator', win.navigator);
setGlobal('localStorage', win.localStorage);
setGlobal('location', win.location);
setGlobal('fetch', win.fetch);
setGlobal('alert', win.alert);
setGlobal('confirm', win.confirm);
setGlobal('matchMedia', win.matchMedia);
setGlobal('scrollTo', win.scrollTo);
setGlobal('requestAnimationFrame', (fn) => setTimeout(fn, 0));

// ────────────────────────────────────────────────────────────
// Load the script + expose key internals via return
// ────────────────────────────────────────────────────────────

let runtime = null;
try {
  const stripped = code.replace(/^\s*import .+;?$/gm, '').replace(/^\s*export .+;?$/gm, '');
  const fn = new Function(stripped + `
    return {
      Shell: typeof Shell === 'function' ? Shell : null,
      FOUNDER_VIEWS: typeof FOUNDER_VIEWS === 'object' ? FOUNDER_VIEWS : null,
      SELLER_VIEWS: typeof SELLER_VIEWS === 'object' ? SELLER_VIEWS : null,
      BUYER_VIEWS: typeof BUYER_VIEWS === 'object' ? BUYER_VIEWS : null,
      SELLER_PROFILES: typeof SELLER_PROFILES === 'object' ? SELLER_PROFILES : null,
      BUYER_DISPLAY: typeof BUYER_DISPLAY === 'object' ? BUYER_DISPLAY : null,
      SELLER_NAV: typeof SELLER_NAV === 'function' ? SELLER_NAV : null,
      BUYER_NAV: typeof BUYER_NAV === 'function' ? BUYER_NAV : null,
      FOUNDER_NAV: typeof FOUNDER_NAV !== 'undefined' ? FOUNDER_NAV : null,
      setRole: (r) => { ROLE = r; },
      setSellerKey: (k) => { SELLER_KEY = k; SELLER = SELLER_PROFILES[k]; },
      setBuyerMod: (m) => { BUYER_MOD = m; BUYER = BUYER_DISPLAY[m]; MODALITY = m; },
    };
  `);
  runtime = fn.call(global);
} catch (e) {
  console.error('Script failed to load:', e.message);
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
// Exercise everything
// ────────────────────────────────────────────────────────────

sec('Script loaded successfully — internals accessible');
{
  a(runtime.Shell !== null,            'Shell() function exists');
  a(runtime.FOUNDER_VIEWS !== null,    'FOUNDER_VIEWS object exists');
  a(runtime.SELLER_VIEWS !== null,     'SELLER_VIEWS object exists');
  a(runtime.SELLER_PROFILES !== null,  'SELLER_PROFILES object exists');
  a(runtime.SELLER_NAV !== null,       'SELLER_NAV() function exists (the regression we fixed)');
  a(runtime.BUYER_NAV !== null,        'BUYER_NAV() function exists');
  a(runtime.FOUNDER_NAV !== null,      'FOUNDER_NAV constant exists');
}

sec('Shell() renders for all 3 roles');
['buyer', 'seller', 'founder'].forEach(role => {
  let err = null, html = null;
  try {
    runtime.setRole(role);
    html = runtime.Shell();
  } catch (e) { err = e.message; }
  a(err === null && typeof html === 'string' && html.length > 100,
    `Shell() with ROLE=${role} returns HTML${err ? ` — ${err}` : ` (${html ? html.length : 0} chars)`}`);
});

sec('Shell() renders for all 4 seller archetypes');
runtime.setRole('seller');
['mor', 'saas', 'umbrella', 'agent'].forEach(key => {
  let err = null, html = null;
  try {
    runtime.setSellerKey(key);
    html = runtime.Shell();
  } catch (e) { err = e.message; }
  a(err === null && typeof html === 'string' && html.length > 100,
    `Shell() with SELLER_KEY=${key}${err ? ` — ${err}` : ` (${html ? html.length : 0} chars)`}`);
});

sec('Shell() renders for all 5 buyer modalities');
runtime.setRole('buyer');
['d2c', 'b2b', 'b2b2c', 'exim', 'pos'].forEach(mod => {
  let err = null, html = null;
  try {
    runtime.setBuyerMod(mod);
    html = runtime.Shell();
  } catch (e) { err = e.message; }
  a(err === null && typeof html === 'string' && html.length > 100,
    `Shell() with BUYER_MOD=${mod}${err ? ` — ${err}` : ` (${html ? html.length : 0} chars)`}`);
});

sec('Every SELLER_VIEW renders for every archetype');
runtime.setRole('seller');
const sellerArchetypes = ['mor', 'saas', 'umbrella', 'agent'];
const sellerViews = Object.keys(runtime.SELLER_VIEWS);
sellerArchetypes.forEach(key => {
  runtime.setSellerKey(key);
  sellerViews.forEach(viewName => {
    let err = null, html = null;
    try {
      html = runtime.SELLER_VIEWS[viewName]();
    } catch (e) { err = e.message; }
    a(err === null,
      `SELLER_VIEWS.${viewName}() with SELLER_KEY=${key}${err ? ` — ${err}` : ''}`);
  });
});

sec('Every FOUNDER_VIEW renders');
runtime.setRole('founder');
const founderViews = Object.keys(runtime.FOUNDER_VIEWS);
founderViews.forEach(viewName => {
  let err = null, html = null;
  try {
    html = runtime.FOUNDER_VIEWS[viewName]();
  } catch (e) { err = e.message; }
  a(err === null,
    `FOUNDER_VIEWS.${viewName}()${err ? ` — ${err}` : ''}`);
});

sec('SELLER_NAV() returns valid nav for each archetype');
sellerArchetypes.forEach(key => {
  runtime.setSellerKey(key);
  let err = null, nav = null;
  try { nav = runtime.SELLER_NAV(); } catch (e) { err = e.message; }
  a(err === null && Array.isArray(nav) && nav.length > 0,
    `SELLER_NAV() for ${key}${err ? ` — ${err}` : ` (${nav ? nav.length : 0} items)`}`);
  // Each nav item should have id + label
  if (Array.isArray(nav)) {
    const allValid = nav.every(n => n.id && n.label);
    a(allValid, `  all ${nav.length} nav items have id + label`);
  }
});

sec('NAV ↔ VIEW consistency — no orphan nav items or views');
{
  // Read the SPA source and verify every nav id maps to a view key
  const navMatch = code.match(/const FOUNDER_NAV\s*=\s*\[([\s\S]*?)\];/);
  const navItems = navMatch
    ? [...navMatch[1].matchAll(/id\s*:\s*['"]([\w-]+)['"]/g)].map(m => m[1])
    : [];
  const viewsMatch = code.match(/const FOUNDER_VIEWS\s*=\s*\{([\s\S]*?)\n\};/);
  const viewKeys = viewsMatch
    ? [...viewsMatch[1].matchAll(/^\s*(\w+)\s*\(\s*\)\s*\{/gm)].map(m => m[1])
    : [];
  const orphanNav = navItems.filter(n => !viewKeys.includes(n));
  const orphanViews = viewKeys.filter(k => !navItems.includes(k));

  a(navItems.length > 0,                              `FOUNDER_NAV has ${navItems.length} items`);
  a(viewKeys.length > 0,                              `FOUNDER_VIEWS has ${viewKeys.length} keys`);
  a(orphanNav.length === 0,
    `All FOUNDER_NAV ids have a matching view${orphanNav.length ? ' — orphan ids: ' + orphanNav.join(', ') : ''}`);
  a(orphanViews.length === 0,
    `All FOUNDER_VIEWS are reachable from nav${orphanViews.length ? ' — orphan views: ' + orphanViews.join(', ') : ''}`);

  // Same for SELLER (the function-based nav uses literal id strings)
  const sViewsMatch = code.match(/const SELLER_VIEWS\s*=\s*\{([\s\S]*?)\n\};/);
  const sViewKeys = sViewsMatch
    ? [...sViewsMatch[1].matchAll(/^\s*(\w+)\s*\(\s*\)\s*\{/gm)].map(m => m[1])
    : [];
  // Pull every id literal from SELLER_NAV function body
  const sNavMatch = code.match(/function SELLER_NAV[\s\S]*?\n\}/);
  const sNavIds = sNavMatch
    ? [...new Set([...sNavMatch[0].matchAll(/id:\s*['"]([\w-]+)['"]/g)].map(m => m[1]))]
    : [];
  // Also the static default 'overview'
  if (!sNavIds.includes('overview')) sNavIds.push('overview');
  const sOrphanNav = sNavIds.filter(n => !sViewKeys.includes(n));
  a(sOrphanNav.length === 0,
    `All SELLER_NAV ids have a matching view${sOrphanNav.length ? ' — orphan ids: ' + sOrphanNav.join(', ') : ''}`);
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
