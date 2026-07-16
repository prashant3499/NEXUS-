'use strict';

const B = require('./src/branding');
const P = require('./src/presentationAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Default brand + change');
{
  B.reset();
  a(B.get().name === 'NEXUS' && B.get().is_default === true, 'Defaults to NEXUS');
  const r = B.set({ name: 'KalaSetu', tagline: 'Bridge to the world\u2019s craft buyers.' });
  a(r.ok && r.brand.name === 'KalaSetu', 'Founder renames the brand');
  a(r.brand.short === 'KalaSetu', 'Short name derived');
  a(B.get().is_default === false, 'No longer default');
  a(/trademark-clear/i.test(r.reminder || ''), 'Reminds founder to check trademark (legal step)');
}

sec('Validation — well-formed, not "true"');
{
  B.reset();
  a(B.set({ name: 'A' }).ok === false, 'Too-short name refused');
  a(B.set({ name: 'X'.repeat(50) }).ok === false, 'Too-long name refused');
  a(B.set({ name: 'Bad<script>' }).ok === false, 'Invalid characters refused');
  a(B.set({ logo: { colors: ['#GGGGGG'] } }).ok === false, 'Invalid hex colour refused');
  a(B.set({ logo: { type: 'hologram' } }).ok === false, 'Unknown logo type refused');
  a(B.set({ name: 'CraftTrust', logo: { type: 'wordmark', colors: ['#1E1B4B'] } }).ok === true, 'Valid brand + logo accepted');
}

sec('Branding changes the label, presentations follow');
{
  B.reset();
  B.set({ name: 'KalaSetu' });
  const brand = B.get().name;
  const cust = P.present('customer', { brand });
  a(JSON.stringify(cust).includes('KalaSetu'), 'Customer presentation uses the new brand name');
  a(!JSON.stringify(cust).includes('NEXUS'), 'Old name no longer appears');
  const govt = P.present('government', { brand });
  a(JSON.stringify(govt).includes('KalaSetu'), 'Government presentation uses the new brand name');
  // substance unchanged
  a(/honest|pre-revenue|pilot/i.test(JSON.stringify(govt).toLowerCase()), 'Substance + honesty unchanged by rename');
  B.reset();
}

sec('Honest: branding is label, not substance');
{
  const r = B.set({ name: 'TrustCraft' });
  a(/not the platform\u2019s substance|not.*substance/i.test(r.note), 'Note states branding doesn\u2019t change substance');
  B.reset();
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
