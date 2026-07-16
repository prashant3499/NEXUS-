'use strict';

/**
 * test-wire-completes.js — The test we needed.
 *
 * The script-execution test confirms the SPA loads. The views-render
 * test confirms each view function returns HTML. NEITHER catches the
 * actual user-facing bug: wire() throws partway through, so SOME
 * buttons bind and OTHERS don't.
 *
 * This test actually invokes wire() with a richer DOM stub that tracks
 * which handlers got bound, and asserts wire() completes without throw.
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const code = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

const handlerBindings = [];

function makeEl(tag) {
  const handlers = {};
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    classList: { add: ()=>{}, remove: ()=>{}, toggle: ()=>false, contains: ()=>false },
    style: {}, children: [], dataset: {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: (ev, h) => { handlers[ev] = h; },
    appendChild: (c) => { el.children.push(c); return c; },
    removeChild: () => {}, insertAdjacentHTML: () => {}, remove: () => {}, focus: () => {},
    querySelectorAll: () => [], querySelector: () => null,
    innerHTML: '', textContent: '', value: '',
    set onclick(fn) { handlers.click = fn; handlerBindings.push(this.tagName + ':onclick'); },
    get onclick() { return handlers.click; },
    set onchange(fn) { handlers.change = fn; handlerBindings.push(this.tagName + ':onchange'); },
    get onchange() { return handlers.change; },
    set oninput(fn) { handlers.input = fn; handlerBindings.push(this.tagName + ':oninput'); },
    get oninput() { return handlers.input; },
    parentNode: null,
    offsetWidth: 100, offsetHeight: 100, scrollHeight: 200,
    _handlers: handlers,
  };
  return el;
}

const elementStore = {};
const doc = {
  documentElement: makeEl('html'),
  head: makeEl('head'),
  body: makeEl('body'),
  getElementById: (id) => elementStore[id] || (elementStore[id] = makeEl()),
  querySelector: (sel) => null,
  querySelectorAll: (sel) => {
    // For `[data-go]` and similar selectors, return a few stub elements
    // so the forEach loops in wire() execute properly
    if (sel === '[data-go]') {
      const elems = [];
      for (let i = 0; i < 3; i++) {
        const e = makeEl('button');
        e.dataset = { go: 'dashboard' };
        elems.push(e);
      }
      return elems;
    }
    if (sel === '#content [data-go]') {
      return [makeEl('button')];
    }
    return [];
  },
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
};

// Plain assignment silently no-ops for getter-only built-in globals
// (e.g. `navigator` on Node 22+), so force the override with defineProperty.
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

// Load the script and expose wire()
let runtime = null;
let loadError = null;
try {
  const stripped = code.replace(/^\s*import .+;?$/gm, '').replace(/^\s*export .+;?$/gm, '');
  const fn = new Function(stripped + `
    return {
      wire: typeof wire === 'function' ? wire : null,
      render: typeof render === 'function' ? render : null,
      Shell: typeof Shell === 'function' ? Shell : null,
      FOUNDER_VIEWS: typeof FOUNDER_VIEWS === 'object' ? FOUNDER_VIEWS : null,
      _setRoute: (role, value) => { route[role] = value; },
    };
  `);
  runtime = fn.call(global);
} catch (e) {
  loadError = e;
}

console.log('\n\u2501\u2501\u2501 Script load \u2501\u2501\u2501\n');
a(loadError === null, 'Script loads without throwing' + (loadError ? ' — ' + loadError.message : ''));
a(runtime && runtime.wire !== null, 'wire() function is exposed');

console.log('\n\u2501\u2501\u2501 wire() completes without throwing \u2501\u2501\u2501\n');
['founder', 'seller', 'buyer'].forEach(role => {
  let err = null;
  handlerBindings.length = 0;
  try {
    global.ROLE = role;
    // Pre-populate the elements wire() expects to find
    elementStore.content = makeEl('div');
    elementStore.cfSendBtn = makeEl('button');
    elementStore.cfInput = makeEl('input');
    elementStore.cfBody = makeEl('div');
    elementStore.menuBtn = makeEl('button');
    elementStore.rail = makeEl('aside');
    elementStore.drawerBackdrop = makeEl('div');
    runtime._setRoute(role, role === 'founder' ? 'dashboard' : role === 'seller' ? 'overview' : 'landing');
    runtime.wire();
  } catch (e) {
    err = e;
  }
  a(err === null, `wire() with ROLE=${role}${err ? ' — THROWS: ' + err.message : ''}`);
  if (err) {
    console.log('    Stack:', (err.stack || '').split('\n').slice(0, 4).join('\n           '));
  }
});

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
