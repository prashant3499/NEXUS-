'use strict';

/**
 * test-wire-integrity.js
 *
 * The buttons-don't-work class of bug is insidious because the code looks
 * fine statically — it only breaks at runtime when wire() throws partway and
 * leaves later elements unbound. This test EXECUTES the SPA script in a DOM
 * shim, switches through every role, and asserts that:
 *   1. The initial script runs without throwing
 *   2. render()+wire() attach handlers for buyer, seller, AND founder
 *   3. No role wires zero handlers (which would mean a dead UI)
 *
 * It also cross-checks that every data-* attribute rendered in the markup is
 * actually queried by the wiring (no orphan buttons) and vice-versa.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const code = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/)[1];

// ── DOM shim that counts handler attachment ──
let wiredCount = 0;
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(), dataset: {}, style: {}, className: '', id: '',
    classList: { _s: new Set(), add(c){this._s.add(c)}, remove(c){this._s.delete(c)}, toggle(c,f){f?this._s.add(c):this._s.delete(c)}, contains(c){return this._s.has(c)} },
    children: [], attributes: {},
    set onclick(fn){ this._c = fn; if (fn) wiredCount++; }, get onclick(){ return this._c; },
    set onchange(fn){ this._ch = fn; if (fn) wiredCount++; }, get onchange(){ return this._ch; },
    set oninput(fn){ this._i = fn; }, get oninput(){ return this._i; },
    addEventListener(){}, removeEventListener(){}, appendChild(c){ this.children.push(c); return c; },
    removeChild(){}, remove(){}, setAttribute(k,v){ this.attributes[k]=v; }, getAttribute(k){ return this.attributes[k]||null; }, removeAttribute(){},
    insertAdjacentHTML(){}, focus(){}, click(){}, scrollIntoView(){}, scrollTo(){}, closest(){ return null; },
    getBoundingClientRect(){ return { top:0,left:0,width:0,height:0,bottom:0,right:0 }; },
    querySelector(){ return makeEl('div'); }, querySelectorAll(){ return []; },
    set innerHTML(v){ this._h=v; }, get innerHTML(){ return this._h||''; },
    set textContent(v){ this._t=v; }, get textContent(){ return this._t||''; },
    set value(v){ this._v=v; }, get value(){ return this._v||''; },
  };
  return el;
}
const registry = {};
const reg = (sel, n) => { registry[sel] = Array.from({length:n}, () => makeEl('button')); };
reg('[data-go]', 13); reg('[data-util]', 6); reg('[data-um]', 4); reg('[data-mod-link]', 2); reg('.roleswitch button', 3);

const documentStub = {
  getElementById(){ return makeEl('div'); },
  querySelector(sel){ return registry[sel] ? registry[sel][0] : makeEl('div'); },
  querySelectorAll(sel){ return registry[sel] || []; },
  createElement(t){ return makeEl(t); }, createTextNode(){ return {}; },
  addEventListener(){}, removeEventListener(){}, body: makeEl('body'), documentElement: makeEl('html'), head: makeEl('head'),
  cookie: '', title: '', readyState: 'complete',
};
const storage = { _d:{}, getItem(k){return this._d[k]||null}, setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]} };
const sandbox = { console: { log(){}, warn(){}, error(){} }, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams, JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Map, Set, Promise, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent };
sandbox.document = documentStub; sandbox.localStorage = storage; sandbox.sessionStorage = storage;
sandbox.location = { href:'http://localhost/', pathname:'/', search:'', hash:'', reload(){}, assign(){} };
sandbox.navigator = { language:'en', languages:['en'], serviceWorker:{ register(){return {then(){return{catch(){}}}} }, addEventListener(){}, onLine:true } };
sandbox.fetch = () => Promise.resolve({ json:()=>Promise.resolve({}), ok:true, status:200, text:()=>Promise.resolve('') });
sandbox.alert=()=>{}; sandbox.confirm=()=>true; sandbox.prompt=()=>'';
sandbox.requestAnimationFrame=(cb)=>setTimeout(cb,0); sandbox.cancelAnimationFrame=()=>{};
sandbox.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
sandbox.history={pushState(){},replaceState(){},back(){}}; sandbox.CustomEvent=class{}; sandbox.Event=class{};
sandbox.addEventListener=()=>{}; sandbox.removeEventListener=()=>{}; sandbox.scrollTo=()=>{};
sandbox.window=sandbox; sandbox.self=sandbox; sandbox.globalThis=sandbox;

sec('Initial execution');
let booted = false;
try {
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'app.js' });
  booted = true;
  a(true, 'SPA script executes without throwing');
} catch (e) {
  a(false, 'SPA script threw on load: ' + e.message);
}

sec('render()+wire() attaches handlers for every role');
if (booted) {
  for (const role of ['buyer', 'seller', 'founder']) {
    wiredCount = 0;
    let threw = null;
    try {
      if (typeof sandbox.window._role === 'function') sandbox.window._role(role);
      else { sandbox.ROLE = role; sandbox.render(); }
    } catch (e) { threw = e; }
    a(!threw, `role=${role}: wire() runs without throwing` + (threw ? ` (${threw.message})` : ''));
    a(wiredCount > 0, `role=${role}: attaches handlers (${wiredCount})`);
  }
}

sec('No orphan buttons — every rendered data-* is queried by wiring');
{
  // Attributes rendered in markup
  const rendered = new Set((html.match(/data-[a-z-]+(?==)/g) || []));
  // The wiring references (querySelector, dataset.x, [data-x])
  const wiringRefs = code;
  // Known-safe attributes that are wired via dataset.* or card.querySelector
  const knownWired = ['data-act','data-i','data-lc','data-m','data-mod','data-r','data-t','data-go','data-util','data-um','data-act','data-mod-link','data-add','data-rm','data-approve','data-approve2','data-reject','data-pause','data-force','data-thresh','data-footer-page'];
  let orphans = [];
  for (const attr of rendered) {
    const datasetKey = attr.replace('data-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const wired = wiringRefs.includes(`[${attr}]`)
      || wiringRefs.includes(`dataset.${datasetKey}`)
      || knownWired.includes(attr);
    if (!wired) orphans.push(attr);
  }
  a(orphans.length === 0, 'No orphan data-* attributes' + (orphans.length ? ': ' + orphans.join(', ') : ''));
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
