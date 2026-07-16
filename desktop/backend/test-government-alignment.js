'use strict';

const G = require('./src/governmentAlignment');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Maps central economic priorities');
{
  a(G.CENTRAL.length >= 6, `Multiple central priorities (${G.CENTRAL.length})`);
  a(G.CENTRAL.some((c) => /Formalisation/i.test(c.priority)), 'Formalisation of the informal economy');
  a(G.CENTRAL.some((c) => /Export/i.test(c.priority)), 'Exports & forex');
  a(G.CENTRAL.some((c) => /Financial inclusion/i.test(c.priority)), 'Financial inclusion');
  a(G.CENTRAL.every((c) => c.priority && c.vehicle && c.fit), 'Each maps priority → vehicle → fit');
}

sec('Maps state / regional programs (the part often missed)');
{
  a(G.STATE.length >= 5, `Multiple state programs (${G.STATE.length})`);
  a(G.STATE.some((s) => /ODOP/i.test(s.program)), 'ODOP (One District One Product)');
  a(G.STATE.some((s) => /SHG/i.test(s.program)), 'State SHG / livelihood missions');
  a(G.STATE.some((s) => /Kudumbashree|JEEViKA/i.test(s.body)), 'Names real state SHG missions');
  a(G.STATE.some((s) => /GI/i.test(s.program)), 'Regional GI clusters');
}

sec('Economic impact: the metrics governments measure');
{
  const i = G.economicImpact({ artisans: 1000, avgAnnualGmvRupees: 120000 });
  a(i.formalisation.artisans_formalised === 1000, 'Counts artisans formalised');
  a(i.exchequer.gmv_rupees === 120000000, 'Computes GMV');
  a(i.exchequer.tax_to_exchequer_rupees_est > 0, 'Estimates tax to exchequer');
  a(i.exports.export_gmv_rupees_est > 0, 'Estimates export GMV (forex)');
  a(i.livelihoods.women_artisans_est > 0, 'Estimates women artisans supported');
  a(i.financial_inclusion.bank_accounts_activated_est === 1000, 'Counts bank accounts activated');
  a(/PROJECTION/i.test(i.disclaimer), 'Honestly labelled a projection, not a result');
}

sec('Partnership pathways + summary');
{
  const p = G.partnershipPathways();
  a(p.length >= 4, 'Multiple partnership mechanisms');
  a(p.some((x) => /scheme-delivery/i.test(x.mechanism)), 'Scheme-delivery rail pathway');
  a(p.some((x) => /PPP|viability/i.test(x.mechanism)), 'PPP / viability-gap pathway');
  const s = G.alignmentSummary();
  a(/lowers the government\u2019s cost/i.test(s.thesis), 'Thesis: lowers cost of formalisation');
  a(/not proof of demand|does not replace it/i.test(s.honest_note), 'Honest: alignment funds the pilot, not replaces it');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
