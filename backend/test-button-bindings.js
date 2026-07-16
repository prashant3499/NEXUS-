'use strict';

/**
 * test-button-bindings.js
 *
 * Catches the bug class "button rendered but unbound" — visible UI
 * affordance with no handler, no id for wire() to find, no data-go
 * for the generic nav delegator. The user clicks it and nothing happens.
 *
 * The previous test suite caught: parse errors, undefined identifiers,
 * nav/view mismatches, mirror drift. It did NOT catch this one because
 * the buttons LOOK fine on render — they just don't do anything when
 * clicked.
 *
 * Strategy: scan every <button> tag in the script's template strings.
 * Each must have at least one binding mechanism:
 *   - onclick="..."          (inline handler)
 *   - id="..."               (wire() likely binds this by id)
 *   - data-go="..."          (generic nav delegator)
 *   - data-util="..."        (top-bar utility delegator)
 *   - class containing "tool-approve" or "tool-reject"  (dynamic binding)
 *   - class containing "menu-btn"                       (drawer)
 *   - data-*                 (any other custom data attribute)
 */

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const script = scriptMatch[1];

const BUTTON_PATTERN = /<button[^>]*?>([^<]{0,200})<\/button>/g;
const ID_PATTERN = /\bid=/;
const DATA_PATTERN = /\bdata-/;
const SPECIAL_CLASSES = ['tool-approve', 'tool-reject', 'menu-btn'];

function isBound(tag) {
  if (tag.includes('onclick=')) return true;
  if (ID_PATTERN.test(tag)) return true;
  if (DATA_PATTERN.test(tag)) return true;
  for (const cls of SPECIAL_CLASSES) {
    if (tag.includes(cls)) return true;
  }
  return false;
}

sec('Every <button> in the SPA has a binding mechanism');
{
  const buttons = [];
  let m;
  const re = new RegExp(BUTTON_PATTERN.source, 'g');
  while ((m = re.exec(script)) !== null) {
    const tag = m[0];
    const text = m[1].trim();
    buttons.push({ tag, text });
  }

  a(buttons.length > 30, `Found ${buttons.length} <button> elements`);

  const unbound = buttons.filter(b => !isBound(b.tag));

  a(unbound.length === 0,
    unbound.length === 0
      ? `All ${buttons.length} buttons have a binding (onclick, id, or data-*)`
      : `${unbound.length} buttons have NO binding mechanism`);

  if (unbound.length > 0) {
    console.log('\n  Unbound buttons that will silently fail when clicked:');
    unbound.forEach(b => {
      const truncatedText = b.text.length > 60 ? b.text.slice(0, 60) + '…' : b.text;
      console.log(`    "${truncatedText}"`);
      console.log(`      → ${b.tag.slice(0, 100)}${b.tag.length > 100 ? '…' : ''}`);
    });
  }
}

sec('Every onclick handler calls a function that exists');
{
  // Extract every onclick handler and check the functions it calls
  const onclickPattern = /onclick="([^"]+)"/g;
  const handlers = [];
  let m;
  while ((m = onclickPattern.exec(script)) !== null) {
    handlers.push(m[1]);
  }
  a(handlers.length > 0, `Found ${handlers.length} onclick handlers`);

  // Build set of defined functions
  const defined = new Set();
  // function name(...)
  for (const m of script.matchAll(/function\s+(\w+)\s*\(/g)) defined.add(m[1]);
  // window.name = ...
  for (const m of script.matchAll(/window\.(\w+)\s*=/g)) defined.add(m[1]);
  // const name = ...
  for (const m of script.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) defined.add(m[1]);

  // Standard JS / DOM / keywords that are not "missing"
  const builtins = new Set([
    'alert', 'confirm', 'prompt',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'String', 'Number', 'Boolean', 'Array', 'Object', 'Math', 'Date', 'JSON', 'RegExp', 'Promise',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'fetch', 'sendPrompt',
    'if', 'else', 'return', 'this', 'typeof', 'new', 'void', 'await', 'async',
    'getElementById', 'querySelector', 'querySelectorAll', 'scrollIntoView',
    'addEventListener', 'removeEventListener', 'appendChild', 'removeChild', 'createElement',
    'stopPropagation', 'preventDefault', 'stopImmediatePropagation', 'focus', 'blur', 'remove', 'click', 'reload',
    'document', 'window', 'console', 'localStorage', 'navigator',
  ]);

  // Collect every function-name called from onclick. Strip string
  // literals first so we don't match words inside toast('...') messages.
  const stripStrings = (s) => {
    let result = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === "'" || c === '"') {
        // Find matching close (handle backslash-escape)
        let j = i + 1;
        while (j < s.length && s[j] !== c) {
          if (s[j] === '\\') j += 2;
          else j++;
        }
        i = j + 1;
      } else {
        result += c;
        i++;
      }
    }
    return result;
  };

  const called = new Set();
  for (const h of handlers) {
    const codeOnly = stripStrings(h);
    for (const m of codeOnly.matchAll(/(?:window\.)?(\w+)\s*\(/g)) {
      const name = m[1];
      called.add(name);
    }
  }

  const missing = [];
  for (const name of called) {
    if (defined.has(name)) continue;
    if (builtins.has(name)) continue;
    missing.push(name);
  }

  a(missing.length === 0,
    missing.length === 0
      ? `All ${called.size} functions called from onclick are defined`
      : `${missing.length} functions called from onclick are NOT defined: ${missing.join(', ')}`);
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
