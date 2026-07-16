'use strict';

/**
 * test-ui-parse.js — Smoke test for the SPA.
 *
 * The single-file SPA is a fragile artifact: one stray apostrophe in a
 * template literal breaks the whole page silently. CI must catch this
 * before merge. This suite verifies:
 *   1. index.html exists and is non-trivial in size
 *   2. The <script type="module"> block parses as valid JavaScript
 *   3. PWA assets are present and well-formed
 *   4. Critical handlers and entry points exist
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const PUBLIC = path.join(__dirname, 'public');

// ────────────────────────────────────────────────────────────
sec('index.html exists and is non-trivial');
{
  const file = path.join(PUBLIC, 'index.html');
  a(fs.existsSync(file),                          'index.html exists');
  const html = fs.readFileSync(file, 'utf8');
  a(html.length > 100000,                          'Non-trivial size (>100KB)');
  a(html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>'),
                                                   'Has DOCTYPE');
  a(html.includes('<title>NEXUS</title>'),         'Title is NEXUS');
}

sec('SPA module script parses as valid JavaScript');
{
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  a(m !== null,                                    'Module script block found');
  if (m) {
    let parseError = null;
    try { new Function(m[1]); } catch (e) { parseError = e.message; }
    a(parseError === null,                          'Module script parses' + (parseError ? ' — ' + parseError : ''));
  }
}

sec('SPA script EXECUTES with a DOM stub (catches undefined references)');
{
  // The previous parse check only verifies syntax. This one actually runs
  // the script with stubbed DOM/window globals to catch undefined-reference
  // errors (like SELLER_NAV not defined — found in production by a user).
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const code = m ? m[1] : '';

  // Build a minimal DOM stub. Returns a generic element for any getElementById
  // so the script can find every #id it references without crashing.
  const elStore = {};
  const makeEl = () => ({
    classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
    style: {}, children: [], dataset: {},
    setAttribute: () => {}, getAttribute: () => null, removeAttribute: () => {},
    addEventListener: () => {}, appendChild: () => {}, removeChild: () => {},
    insertAdjacentHTML: () => {}, remove: () => {}, focus: () => {},
    querySelectorAll: () => [], querySelector: () => null,
    innerHTML: '', textContent: '', value: '', onclick: null, parentNode: null,
  });
  const doc = {
    documentElement: makeEl(),
    head: makeEl(),
    body: makeEl(),
    getElementById: (id) => elStore[id] || (elStore[id] = makeEl()),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: makeEl,
    addEventListener: () => {},
    dispatchEvent: () => true,
  };
  const win = {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    location: { hash: '', pathname: '/', protocol: 'http:', search: '' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { language: 'en', serviceWorker: { register: () => Promise.resolve({ addEventListener: () => {} }) } },
    scrollTo: () => {}, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    alert: () => {}, confirm: () => true,
  };
  // Wire globals (some are read-only on Node 22+, so wrap each in try/catch)
  const setGlobal = (k, v) => { try { global[k] = v; } catch (_) {} };
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

  let runtimeError = null;
  try {
    const stripped = code.replace(/^\s*import .+;?$/gm, '').replace(/^\s*export .+;?$/gm, '');
    new Function(stripped).call(global);
  } catch (e) {
    runtimeError = e.message;
  }
  // Allowed exceptions: DOM stubs are incomplete, so some "Cannot read properties of null"
  // errors come from our stubs, not the real code. We tolerate those but FAIL on
  // any "is not defined" reference error (those are real bugs).
  const isReferenceError = runtimeError && /is not defined/.test(runtimeError);
  a(!isReferenceError,                              'No undefined references at script load' + (isReferenceError ? ' — ' + runtimeError : ''));
}

sec('PWA assets present and well-formed');
{
  ['manifest.json', 'sw.js', 'icon-192.svg', 'icon-512.svg'].forEach(f => {
    const file = path.join(PUBLIC, f);
    a(fs.existsSync(file),                          `${f} exists`);
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
  a(manifest.name && manifest.short_name,           'manifest has name + short_name');
  a(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest has ≥2 icons');
  a(manifest.theme_color,                            'manifest has theme_color');
  a(manifest.start_url,                              'manifest has start_url');

  const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');
  a(sw.includes("'install'"),                       'sw.js handles install');
  a(sw.includes("'fetch'"),                         'sw.js handles fetch');
  a(sw.includes("'activate'"),                      'sw.js handles activate');
}

sec('Critical SPA entry points exist');
{
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  a(html.includes('function render('),              'render() function defined');
  a(html.includes('FOUNDER_VIEWS'),                  'FOUNDER_VIEWS object defined');
  a(html.includes('renderPolicyOverlay'),            'renderPolicyOverlay defined');
  a(html.includes('window._addLead'),                'Lead-add handler defined');
  a(html.includes('window._transitionLead'),         'Lead-transition handler defined');
  a(html.includes('SRC_createLead'),                 'Client-side sourcing helpers present');
  a(html.includes('navigator.serviceWorker.register'),'PWA registration code present');
}

sec('AI co-founder chat layer present (v2.13.0)');
{
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  a(html.includes('_chatSystemPrompt'),              '_chatSystemPrompt builder defined');
  a(html.includes('_chatSend'),                       '_chatSend dispatch defined');
  a(html.includes('_renderChatMarkdown'),             'Markdown renderer defined');
  a(html.includes('_renderChatHistory'),              'History renderer defined');
  a(html.includes('api.anthropic.com/v1/messages'),   'Anthropic API endpoint referenced');
  a(html.includes('claude-sonnet-4'),                 'Sonnet 4 model named');
  a(html.includes('answerQuestion'),                   'Static fallback retained for graceful degradation');
}

sec('No common scripting traps in templates');
{
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const js = m ? m[1] : '';
  // The bug pattern (v2.12.0 → v2.12.1 fix): backslash + apostrophe inside
  // a backtick template literal. Built up as character codes to avoid this
  // test file having the same escaping problem we're testing for.
  const trap = String.fromCharCode(92) + String.fromCharCode(39) + 't need';
  a(!js.includes(trap),                            'No backslash-apostrophe escape pattern in templates');
}

sec('All inline-attribute-referenced functions are on window');
{
  // Bug class: <script type="module"> runs in strict mode AND its top-level
  // declarations DO NOT leak to global scope. An inline onclick="foo()" in
  // the HTML runs in the global/browser scope — so it cannot see a function
  // declared with `function foo(){}` inside the module unless `window.foo`
  // was explicitly assigned. This test catches that gap.
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

  // Collect every function-name called from any inline event handler.
  const handlerAttrs = ['onclick', 'onchange', 'oninput', 'onsubmit', 'onkeydown',
                        'onkeyup', 'onblur', 'onfocus', 'onmouseover', 'onload'];
  const fnsCalled = new Set();
  for (const attr of handlerAttrs) {
    const re = new RegExp(attr + '="([^"]*)"', 'g');
    let m;
    while ((m = re.exec(html))) {
      const expr = m[1];
      const callRe = /\b([_a-zA-Z][_a-zA-Z0-9]*)\s*\(/g;
      let cm;
      while ((cm = callRe.exec(expr))) fnsCalled.add(cm[1]);
    }
  }

  // Skip globals, keywords, DOM methods
  const allowed = new Set([
    'confirm','alert','document','window','parseInt','parseFloat','console',
    'JSON','Math','String','Number','Array','Object','setTimeout','clearTimeout',
    'setInterval','Date','Promise','if','else','return','function','new','await',
    'async','this','getElementById','scrollIntoView','querySelector','querySelectorAll',
    'fetch','URL','encodeURIComponent','decodeURIComponent','typeof','void','true','false','null',
  ]);

  const broken = [];
  for (const fn of fnsCalled) {
    if (allowed.has(fn)) continue;
    const onWindow = new RegExp('window\\.' + fn + '\\s*=').test(html);
    const declared = new RegExp('(?:^|\\s)(?:function|const|let|var)\\s+' + fn + '\\b', 'm').test(html);
    if (declared && !onWindow) broken.push(fn);
  }

  a(broken.length === 0,
    'Every function called from inline onclick/onchange/etc. is window-exposed' +
    (broken.length ? ' — broken: ' + broken.join(', ') : ''));
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
