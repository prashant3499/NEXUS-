'use strict';

const C = require('./src/complianceRegistry');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Registry shape');
{
  a(C.REQUIREMENTS.length >= 12, 'Covers the key legal/financial requirements');
  a(C.REQUIREMENTS.every(r => r.name && r.issuer && r.why), 'Each names what/who/why');
  a(C.REQUIREMENTS.some(r => r.id === 'gst_registration' && r.blocks_launch), 'GST blocks launch');
  a(C.REQUIREMENTS.some(r => r.id === 'tcs_registration'), 'TCS registration is listed (the MoR core)');
  a(C.REQUIREMENTS.some(r => r.id === 'payment_aggregator' && /never hold/i.test(r.note)), 'PA item explains the never-hold-funds design');
}

sec('Status with nothing obtained');
{
  const s = C.status([]);
  a(s.summary.obtained === 0, 'Nothing obtained');
  a(s.summary.launch_legal === false, 'Not launch-legal with blockers outstanding');
  a(s.summary.still_blocking_launch.length > 0, 'Lists blockers');
  a(/not legal advice/i.test(s.summary.disclaimer), 'Carries the not-legal-advice disclaimer');
}

sec('Status with all blockers obtained');
{
  const blockers = C.REQUIREMENTS.filter(r => r.blocks_launch).map(r => r.id);
  const s = C.status(blockers);
  a(s.summary.launch_legal === true, 'Launch-legal once all blockers obtained');
  a(s.summary.still_blocking_launch.length === 0, 'No blockers remain');
  a(s.summary.headline.includes('in place'), 'Headline confirms readiness');
}

sec('Optional items do not block launch');
{
  const s = C.status([]);
  const iec = s.requirements.find(r => r.id === 'iec');
  const insurer = s.requirements.find(r => r.id === 'insurance_intermediary');
  a(iec.blocks_launch === false, 'IEC (export) is not a launch blocker');
  a(insurer.blocks_launch === false, 'Insurance intermediary is optional (facilitator model)');
}

sec('Grouped by area');
{
  const g = C.byArea([]);
  a(g.tax && g.tax.length >= 2, 'Tax area groups GST + TCS');
  a(Object.keys(g).length >= 5, 'Multiple regulatory areas represented');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
