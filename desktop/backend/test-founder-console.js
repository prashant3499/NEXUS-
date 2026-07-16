'use strict';

const FC = require('./src/founderConsole');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Interpret — founder commands map to the right capability');
{
  a(FC.interpret('audit the platform').intent === 'audit', 'audit → audit');
  a(FC.interpret('fix any stuck tasks').intent === 'heal', 'fix → heal');
  a(FC.interpret('what should I do next?').intent === 'advise', 'next → advise');
  a(FC.interpret('scan for opportunities').intent === 'innovate', 'opportunities → innovate');
  a(FC.interpret('show the investor pitch').intent === 'present', 'pitch → present');
  a(FC.interpret('how are we doing').intent === 'status', 'status → status');
  a(FC.interpret('set the karigar price to 399').capability === FC.CAPABILITY.CONFIG, 'set price → config');
  a(FC.interpret('xyzzy nonsense').matched === false, 'gibberish → not matched, with guidance');
}

sec('Real-world tasks are honestly handed back to the founder');
{
  a(FC.interpret('register the company').capability === FC.CAPABILITY.HUMAN, 'company reg → human task');
  a(FC.interpret('get GST registration').capability === FC.CAPABILITY.HUMAN, 'GST → human task');
  a(FC.interpret('connect Razorpay with a real key').capability === FC.CAPABILITY.HUMAN, 'real credential → human task');
  a(/lawyer|legal/i.test(FC.interpret('get a lawyer to review the MoR').say), 'legal sign-off → human task');
}

sec('Execute — routes to handlers, honest about who acted');
{
  return (async () => {
    const handlers = {
      audit: async () => ({ trustworthy: true, verdict: 'TRUSTWORTHY' }),
      present: async (inp) => ({ audience: inp.audience, headline: 'tailored' }),
      config: async (instr) => ({ ok: /399/.test(instr), applied: instr }),
    };
    const auditRun = await FC.execute(FC.interpret('audit the platform'), {}, handlers);
    a(auditRun.ok && auditRun.did_it && auditRun.who === 'ai', 'Agent command runs and is attributed to the AI');
    a(auditRun.result.trustworthy === true, 'Audit result returned');

    const present = await FC.execute(FC.interpret('present to investor'), { audience: 'investor' }, handlers);
    a(present.result.audience === 'investor', 'Presentation routed with the audience');

    const human = await FC.execute(FC.interpret('register the company'), {}, handlers);
    a(human.ok && human.did_it === false && human.who === 'founder', 'Human task: NOT done by AI, handed to founder');

    const cfg = await FC.execute(FC.interpret('set the karigar price to 399'), { instruction: 'set the karigar price to 399' }, handlers);
    a(cfg.did_it === true && /invariant/i.test(cfg.note), 'Config routed + notes invariant guard');

    const bad = await FC.execute(FC.interpret('flibberty'), {}, handlers);
    a(bad.ok === false, 'Unmatched command does not execute');

    console.log('\n' + '='.repeat(50));
    console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
    console.log('='.repeat(50));
    process.exit(fail > 0 ? 1 : 0);
  })();
}
