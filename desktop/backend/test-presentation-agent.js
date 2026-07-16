'use strict';

const P = require('./src/presentationAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Presents to every audience, tailored');
{
  for (const aud of Object.values(P.AUDIENCE)) {
    const p = P.present(aud);
    a(p.headline && p.how_it_helps_you.length > 0, `${aud}: has a headline + specific benefits`);
    a(p.what_it_is && p.how_it_grows && p.honest_status, `${aud}: includes what-it-is, growth, honest status`);
  }
}

sec('Benefits are actually audience-specific');
{
  const seller = P.present('seller');
  a(seller.how_it_helps_you.some((b) => /97%|3%|liability|language/.test(b)), 'Seller hears about money kept + no liability');
  const investor = P.present('investor');
  a(investor.how_it_helps_you.some((b) => /margin|moat|commission/.test(b)), 'Investor hears about margin + moat');
  const buyer = P.present('buyer');
  a(buyer.how_it_helps_you.some((b) => /verified|provenance|reviews/.test(b)), 'Buyer hears about verification + provenance');
  const gov = P.present('government');
  a(gov.how_it_helps_you.some((b) => /GST|GI|ONDC|welfare|scheme/.test(b)), 'Government hears about formalisation + GI + schemes');
  const showroom = P.present('showroom');
  a(showroom.how_it_helps_you.some((b) => /sourcing|consignment|wholesale|compliance/.test(b)), 'Showroom hears about zero sourcing risk');
}

sec('Honest about stage (no fake traction)');
{
  const p = P.present('investor');
  a(/pilot|pre-revenue|no pilot/i.test(p.honest_status), 'Pre-revenue stage stated honestly by default');
  // With real customers, it updates
  const live = P.present('investor', { customers: 25 });
  a(/25 customer/.test(live.honest_status), 'Reports real customers when present');
}

sec('Growth story = the compounding flywheel');
{
  a(/flywheel|compound|portable|ONDC|provenance/i.test(P.flywheel()), 'Flywheel describes the compounding moat');
  const p = P.present('investor');
  a(p.how_it_grows === P.flywheel(), 'Each pitch includes the growth flywheel');
}

sec('Quick multi-audience deck + unknown audience');
{
  a(P.deck().length === Object.values(P.AUDIENCE).length, 'Deck covers every audience');
  a(P.present('martian').error, 'Unknown audience returns an error + the valid list');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
