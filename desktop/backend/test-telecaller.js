'use strict';

/**
 * test-telecaller.js — the outbound onboarding motion.
 *   - Multilingual scripts (native hi/en, translation flag otherwise)
 *   - Segment-appropriate pitch
 *   - Campaign planning skips done/opted-out, ranks by score
 *   - Call outcomes map to lead-funnel statuses
 *   - Campaign stats compute connect + conversion
 */

const T = require('./src/telecaller');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Script generation — multilingual + segment-aware');
{
  const hi = T.buildScript({ name: 'Ramvati', segment: 'karigar_prospect' }, 'hi');
  a(hi.native === true, 'Hindi script is native (shipped)');
  a(/नमस्ते/.test(hi.full), 'Hindi greeting present');
  a(hi.lines.length === 5, 'Five script steps (greeting→pitch→trust→consent→close)');
  a(/GST/.test(hi.full), 'Karigar pitch mentions no-GST handling');

  const en = T.buildScript({ name: 'Ramvati', segment: 'niryatak_prospect' }, 'en');
  a(/export/i.test(en.full), 'Niryatak pitch is export-focused');

  // A language we don't ship natively → flagged for translation, English body
  const ta = T.buildScript({ name: 'Murugan', segment: 'karigar_prospect' }, 'ta');
  a(ta.native === false && ta.needs_translation === true, 'Non-shipped language flagged for translation');
  a(ta.full.length > 0, 'Still returns a usable (English) body to translate');
}

sec('Trust + consent are always in the script');
{
  const s = T.buildScript({ name: 'X', segment: 'karigar_prospect' }, 'en');
  a(/no legal risk|responsibility/i.test(s.full), 'Always states zero legal risk (the core promise)');
  a(/consent/i.test(s.full), 'Always asks for consent before signup');
}

sec('Campaign planning');
{
  const leads = [
    { id: 'l1', name: 'A', segment: 'karigar_prospect', score: 0.9, status: 'new' },
    { id: 'l2', name: 'B', segment: 'vyapari_prospect', score: 0.5, status: 'new' },
    { id: 'l3', name: 'C', segment: 'karigar_prospect', score: 0.99, status: 'onboarded' }, // skip
    { id: 'l4', name: 'D', segment: 'karigar_prospect', score: 0.7, status: 'new', do_not_call: true }, // skip
  ];
  const plan = T.planCampaign(leads);
  a(plan.count === 2, 'Skips onboarded + do-not-call leads');
  a(plan.queue[0].lead_id === 'l1', 'Ranks highest-score first');
  a(plan.queue[0].language === 'hi', 'Defaults to Hindi');
}

sec('Call outcomes → lead-funnel transitions');
{
  const interested = T.logCall({ leadId: 'l1', disposition: 'interested', by: 'agent1' });
  a(interested.ok && interested.lead_status === 'responded', 'interested → responded');
  const onboarded = T.logCall({ leadId: 'l1', disposition: 'onboarded' });
  a(onboarded.lead_status === 'onboarded', 'onboarded → onboarded');
  const dnc = T.logCall({ leadId: 'l2', disposition: 'do_not_call' });
  a(dnc.do_not_call === true && dnc.lead_status === 'rejected', 'do_not_call honoured + lead rejected');
  const cb = T.logCall({ leadId: 'l3', disposition: 'callback', callbackAt: 123 });
  a(cb.follow_up === 123, 'Callback records the follow-up time');
  const bad = T.logCall({ leadId: 'l4', disposition: 'nonsense' });
  a(bad.ok === false, 'Rejects an invalid disposition');
  const noId = T.logCall({ disposition: 'interested' });
  a(noId.ok === false, 'Requires a leadId');
}

sec('Campaign stats');
{
  const records = [
    { disposition: 'no_answer' }, { disposition: 'no_answer' },
    { disposition: 'interested' }, { disposition: 'onboarded' }, { disposition: 'not_interested' },
  ];
  const s = T.campaignStats(records);
  a(s.calls === 5, 'Counts calls');
  a(s.reached === 3, 'Reached = total minus no-answer/wrong-number');
  a(s.connect_rate === 60, 'Connect rate %');
  a(s.onboarded === 1 && s.conversion_rate === 20, 'Conversion rate %');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
