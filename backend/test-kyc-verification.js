'use strict';

const K = require('./src/kycVerification');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// A format-valid Aadhaar (passes Verhoeff). 234123412346 is a known-valid test value.
const VALID_AADHAAR = '234123412346';
const VALID_PAN = 'ABCDE1234F';

sec('Format check is the floor');
{
  const bad = K.verifyDocument('aadhaar', '1234', null);
  a(bad.status === 'invalid' && bad.verified === false, 'Bad-format Aadhaar → invalid');
  const unsupported = K.verifyDocument('passport', 'X', null);
  a(unsupported.status === 'unsupported', 'Unsupported doc type flagged');
}

sec('Format-valid is NOT verified without a registry');
{
  const r = K.verifyDocument('aadhaar', VALID_AADHAAR, null);
  a(r.status === 'format_only', 'Format-valid Aadhaar without registry → format_only');
  a(r.verified === false, 'Crucially: format_only is NOT verified');
  a(/NOT a verified identity/i.test(r.note), 'Note is honest about the distinction');
}

sec('Mock verifier never falsely verifies');
{
  const v = K.makeVerifier({});
  a(v.kind === 'mock' && v.live === false, 'Mock verifier by default');
  const r = K.verifyDocument('aadhaar', VALID_AADHAAR, v);
  a(r.verified === false, 'Mock does NOT mark a maker verified (honest)');
  a(r.method === 'format_only', 'Mock result is format-only');
}

sec('A real verifier (simulated) confirms identity');
{
  const realish = { check: (type, val) => ({ verified: true, name_match: true }) };
  const r = K.verifyDocument('aadhaar', VALID_AADHAAR, realish);
  a(r.verified === true && r.status === 'verified', 'Registry-confirmed → verified');
  a(r.method === 'registry', 'Method is registry');
}

sec('Seller-level trust level');
{
  const realish = { check: () => ({ verified: true }) };
  const full = K.verifySeller({ aadhaar: VALID_AADHAAR, pan: VALID_PAN }, realish);
  a(full.fully_verified === true && full.trust_level === 'registry_verified', 'All docs verified → registry_verified');
  const formatOnly = K.verifySeller({ aadhaar: VALID_AADHAAR }, null);
  a(formatOnly.fully_verified === false && formatOnly.trust_level === 'format_only', 'No registry → format_only, not fully verified');
  const none = K.verifySeller({}, null);
  a(none.trust_level === 'unverified', 'No docs → unverified');
  // Live credentials → partner slot
  a(K.makeVerifier({ kycApiKey: 'k', kycProvider: 'signzy' }).live === true, 'Credentials → live partner verifier');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
