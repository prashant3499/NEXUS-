'use strict';

const L = require('./src/governmentLiaisonAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Prepares a tailored package for a STATE body');
{
  const p = L.prepareEngagement({ body: 'UP ODOP Cell', level: 'state', vertical: 'gi', cluster: 'Varanasi weaving', artisans: 500 });
  a(/adopt NEXUS/i.test(p.pitch), 'State pitch is adoption-framed');
  a(p.alignment_points.length > 0, 'Includes state alignment points');
  a(p.impact_projection.formalisation.artisans_formalised === 500, 'Impact projection for the cluster');
  a(/Subject:/.test(p.draft_outreach), 'Drafts an outreach note');
}

sec('Prepares a tailored package for a CENTRAL body');
{
  const p = L.prepareEngagement({ body: 'Ministry of Textiles', level: 'central', vertical: 'handicraft', artisans: 2000 });
  a(/formalises informal artisans|exchequer/i.test(p.pitch), 'Central pitch is formalisation/fiscal-framed');
  a(p.impact_projection.exchequer.tax_to_exchequer_rupees_est > 0, 'Shows tax-to-exchequer the ministry measures on');
}

sec('Honest about who does what');
{
  const p = L.prepareEngagement({ level: 'state', vertical: 'gi', artisans: 300 });
  a(p.who_does_what.agent_prepared.length >= 3, 'Lists what the agent prepared');
  a(p.who_does_what.founder_must_do.some((x) => /relationship|meeting|negotiate|sign/i.test(x)), 'Founder must build the relationship / sign');
  a(/not a relationship|cannot connect with government on its own/i.test(p.honest_note), 'Honest: prepares a briefcase, not a relationship');
}

sec('Pipeline: agent advances prep stages, founder advances the rest');
{
  const early = L.advance('identified');
  a(early.who === 'agent_can_advance', 'Early stage → agent can advance');
  const mid = L.advance('outreach_drafted');
  a(mid.who === 'founder', 'After drafting → only the founder advances (contact/meeting)');
  const meeting = L.advance('meeting');
  a(meeting.who === 'founder', 'Meeting → founder');
  const live = L.advance('live');
  a(live.done === true, 'Live → done');
  a(L.advance('nonsense').ok === false, 'Unknown stage → error');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
