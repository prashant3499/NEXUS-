'use strict';

/**
 * test-seller-consent.js — the legal gate for selling.
 *   - A fresh seller cannot sell (no consents)
 *   - Granting all required consents → canSell
 *   - Withdrawing any required consent → cannot sell
 *   - Stale terms version forces re-consent
 *   - consentStatus reports purposes + missing items
 */

const C = require('./src/sellerConsent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('A fresh seller cannot sell');
{
  const rec = C.emptyConsent();
  const sell = C.canSell(rec);
  a(sell.ok === false, 'No consents → cannot sell');
  a(sell.missing.length === C.REQUIRED_TO_SELL.length, 'All required consents reported missing');
  a(C.canSell(null).ok === false, 'Null record → cannot sell (safe default)');
}

sec('A sourced prospect is not sellable until consent');
{
  // Simulate: a lead was sourced, but no consent handshake yet.
  const prospect = C.emptyConsent();
  a(C.canSell(prospect).ok === false, 'Sourced prospect cannot have live listings');
  a(C.consentStatus(prospect).can_sell === false, 'consentStatus confirms not sellable');
}

sec('Granting all required consents unlocks selling');
{
  let rec = C.emptyConsent();
  rec = C.grantMany(rec, C.REQUIRED_TO_SELL, { method: 'signup_checkbox' });
  const sell = C.canSell(rec);
  a(sell.ok === true, 'All required consents granted → canSell');
  a(sell.missing.length === 0, 'Nothing missing');
  a(rec.consents.selling_authorization.granted === true, 'Selling authorization recorded');
  a(rec.consents.selling_authorization.method === 'signup_checkbox', 'Capture method recorded for audit');
  a(rec.consents.terms.version === C.TERMS_VERSION, 'Terms version stamped');
}

sec('Partial consent still blocks selling');
{
  let rec = C.emptyConsent();
  rec = C.grantMany(rec, [C.CONSENT_TYPES.TERMS, C.CONSENT_TYPES.DATA_PROCESSING]);
  const sell = C.canSell(rec);
  a(sell.ok === false, 'Missing selling_authorization → still cannot sell');
  a(sell.missing.includes('selling_authorization'), 'Names selling_authorization as missing');
  a(sell.missing.includes('content_license'), 'Names content_license as missing');
}

sec('Withdrawing a required consent stops selling');
{
  let rec = C.grantMany(C.emptyConsent(), C.REQUIRED_TO_SELL);
  a(C.canSell(rec).ok === true, 'Initially can sell');
  rec = C.withdrawConsent(rec, C.CONSENT_TYPES.SELLING_AUTHORIZATION, { at: Date.now() });
  const sell = C.canSell(rec);
  a(sell.ok === false, 'Withdrawing selling authorization → cannot sell');
  a(sell.missing.includes('selling_authorization'), 'Withdrawn consent shows as missing');
  a(rec.consents.selling_authorization.withdrawn_at != null, 'Withdrawal timestamp recorded');
}

sec('Stale terms version forces re-consent');
{
  let rec = C.grantMany(C.emptyConsent(), C.REQUIRED_TO_SELL);
  // Simulate an old terms version
  rec.consents.terms.version = '2020-01-01';
  const sell = C.canSell(rec);
  a(sell.ok === false, 'Outdated terms → cannot sell until re-accepted');
  a(sell.missing.some((m) => /terms.*outdated/.test(m)), 'Flags terms as outdated');
}

sec('consentStatus — audit view');
{
  let rec = C.grantMany(C.emptyConsent(), [C.CONSENT_TYPES.TERMS]);
  const status = C.consentStatus(rec);
  a(status.consents.terms.granted === true, 'Shows granted consents');
  a(status.consents.selling_authorization.granted === false, 'Shows ungranted consents');
  a(typeof status.consents.selling_authorization.purpose === 'string', 'Each consent carries its human-readable purpose');
  a(status.current_terms_version === C.TERMS_VERSION, 'Reports current terms version');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
