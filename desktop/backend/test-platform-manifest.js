'use strict';

/**
 * test-platform-manifest.js — the AI co-founder's self-knowledge.
 *   - Manifest exposes identity, legal model, invariants, modules, API, arch
 *   - Documented modules actually exist in src/ (no drift / no fiction)
 *   - Core invariants are present
 *   - describeModule + relevantInvariants helpers work
 */

const fs = require('fs');
const path = require('path');
const M = require('./src/platformManifest');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Manifest shape');
{
  const m = M.manifest();
  a(m.identity && m.identity.name === 'NEXUS', 'Has identity');
  a(m.legal_model && m.legal_model.models.merchant_of_record, 'Describes the status-aware legal model');
  a(Array.isArray(m.invariants) && m.invariants.length >= 5, 'Lists the invariants');
  a(m.modules && m.module_count === Object.keys(m.modules).length, 'Module count matches');
  a(m.api_areas && m.architecture, 'Has API areas + architecture');
  // Narrowing
  a(Object.keys(M.manifest('invariants')).length === 1, 'Can narrow to one area');
}

sec('No drift — documented modules exist in src/');
{
  const srcFiles = new Set(fs.readdirSync(path.join(__dirname, 'src')).filter(f => f.endsWith('.js')).map(f => f.replace('.js', '')));
  const documented = Object.keys(M.MODULES);
  const fictional = documented.filter(name => !srcFiles.has(name));
  a(fictional.length === 0, `Every documented module exists in src/ (${fictional.length ? 'fictional: ' + fictional.join(', ') : 'all real'})`);
}

sec('Core invariants present');
{
  const inv = M.INVARIANTS.join(' ').toLowerCase();
  a(/never-in-loss/.test(inv), 'Never-in-loss invariant documented');
  a(/consent/.test(inv), 'Consent-before-sale invariant documented');
  a(/child safety|minor|guardian/.test(inv), 'Child-safety invariant documented');
  a(/founder/.test(inv), 'Founder-in-the-loop invariant documented');
}

sec('Helpers');
{
  a(/splits|transaction|paise/i.test(M.describeModule('slicer')), 'describeModule returns a real description');
  a(M.describeModule('nonexistent') === null, 'Unknown module → null');
  const rel = M.relevantInvariants(['consent']);
  a(rel.length >= 1 && /consent/i.test(rel[0]), 'relevantInvariants finds consent-related rules');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
