'use strict';

const D = require('./src/dataSources');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Every data input is classified by source + status');
{
  a(D.INPUTS.length >= 20, `Comprehensive input map (${D.INPUTS.length})`);
  a(D.INPUTS.every((i) => i.key && i.source && i.status && i.desc && i.how), 'Each input has source, status, description, and how-to-source');
  a(['user', 'reference', 'provider', 'derived'].every((s) => D.bySource(s).length > 0), 'All four source types present');
}

sec('Honest about what is real vs mock vs missing');
{
  const r = D.readiness();
  a(r.mock > 0, 'Acknowledges provider data is on mocks');
  a(r.not_sourced > 0, 'Acknowledges reference datasets not yet sourced');
  a(r.pilot_blockers.includes('payments_payouts') && r.pilot_blockers.includes('kyc_verification'), 'Money + KYC flagged as pilot blockers');
  a(/must be real before any pilot/i.test(r.summary), 'Summary states money+KYC must be real first');
}

sec('Key inputs classified correctly');
{
  const get = (k) => D.INPUTS.find((i) => i.key === k);
  a(get('payments_payouts').source === 'provider' && get('payments_payouts').status === 'mock', 'Payments → provider, mock');
  a(get('product_listings').source === 'user' && get('product_listings').status === 'collected_at_runtime', 'Listings → user, runtime');
  a(get('gi_registry').source === 'reference' && get('gi_registry').status === 'have', 'GI registry → reference, have');
  a(get('money_split').source === 'derived' && get('money_split').status === 'have', 'Money split → derived, have');
  a(get('product_photos').status === 'not_yet_sourced', 'Product photography honestly flagged as a real gap');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
