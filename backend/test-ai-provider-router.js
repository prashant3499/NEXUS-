'use strict';

const R = require('./src/aiProviderRouter');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Indian-language generation prefers a sovereign Indic model');
{
  const r = R.route({ type: 'generate', language: 'hi' });
  a(r.primary === 'sarvam', 'Hindi listing → Sarvam (sovereign Indic) first');
  a(r.mission_aligned === true, 'Primary is mission-aligned');
  a(r.fallbacks.includes('frontier'), 'Falls back to frontier if unavailable');
  a(/data stays in India|sovereign/i.test(r.rationale), 'Rationale cites sovereignty/data residency');
}

sec('Voice in an Indian language → voice-first sovereign model');
{
  const r = R.route({ type: 'voice', language: 'ta' });
  a(r.primary === 'gnani', 'Tamil voice → Gnani (voice-first sovereign)');
  a(r.chain.includes('sarvam'), 'Sarvam in the chain');
}

sec('Translation routes to the national DPI (Bhashini)');
{
  const r = R.route({ type: 'translate', language: 'bn' });
  a(r.primary === 'bhashini', 'Translation → Bhashini');
}

sec('English / reasoning / code → frontier general model');
{
  a(R.route({ type: 'generate', language: 'en' }).primary === 'frontier', 'English generation → frontier');
  a(R.route({ type: 'reason', language: 'hi' }).primary === 'frontier', 'Complex reasoning → frontier even for Indic');
  a(R.route({ type: 'code' }).primary === 'frontier', 'Code → frontier');
}

sec('Honest seam: live only when a credential exists');
{
  const off = R.route({ type: 'generate', language: 'hi' }, {});
  a(off.live === false && /seam/i.test(off.note), 'No key → not live, honest note + fallback named');
  const on = R.route({ type: 'generate', language: 'hi' }, { sarvam: true });
  a(on.live === true && on.note === null, 'With a key → live');
}

sec('Mission alignment maps onto the IndiaAI pillars');
{
  const m = R.missionAlignment();
  a(m.pillars.length >= 5, 'Maps multiple IndiaAI pillars');
  a(m.pillars.some((p) => /Safe & Trusted/i.test(p.pillar)), 'Includes Safe & Trusted AI (responsible-by-design)');
  a(m.pillars.some((p) => /Foundation Models/i.test(p.pillar)), 'Includes Foundation Models (sovereign)');
  a(m.dpi_stack.some((d) => /Bhashini/.test(d)) && m.dpi_stack.some((d) => /ONDC/.test(d)), 'Built on Bhashini + ONDC DPI');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
