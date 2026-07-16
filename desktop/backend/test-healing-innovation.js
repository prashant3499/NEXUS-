'use strict';

const H = require('./src/selfHealingAgent');
const I = require('./src/innovationAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Self-healing — diagnose');
{
  const healthy = H.diagnose({ auditVerdict: { trustworthy: true } });
  a(healthy.healthy === true, 'No issues → healthy');

  const d = H.diagnose({ webhookStats: { dead: 3 }, stuckTasks: [{ id: 't1' }], providersDown: ['bhashini'], auditVerdict: { trustworthy: true } });
  a(d.auto_healable.some((i) => i.kind === 'dead_webhooks'), 'Dead webhooks → auto-healable');
  a(d.auto_healable.some((i) => i.kind === 'stuck_tasks'), 'Stuck tasks → auto-healable');
  a(d.auto_healable.some((i) => i.kind === 'provider_down' && i.provider === 'bhashini'), 'Non-money provider down → auto-healable (fallback)');
}

sec('Self-healing — the hard boundary');
{
  // A money provider down must ESCALATE, never silently mock.
  const money = H.diagnose({ providersDown: ['razorpay'] });
  a(money.escalations.some((i) => i.provider === 'razorpay'), 'Money provider down → ESCALATED, not auto-mocked');
  a(money.auto_healable.every((i) => i.provider !== 'razorpay'), 'Razorpay is NOT in the auto-heal list');

  // An invariant breach must HALT, never self-heal.
  const breach = H.diagnose({ auditVerdict: { trustworthy: false } });
  a(breach.escalations.some((i) => i.kind === 'invariant_breach' && i.action === H.HEAL_ACTION.HALT), 'Invariant breach → HALT + escalate (never worked around)');
  a(breach.auto_healable.every((i) => i.kind !== 'invariant_breach'), 'Invariant breach is NEVER auto-healable');
}

sec('Self-healing — heal applies safe recovery');
{
  let webhookRetries = 0, tasksResumed = 0, fellBack = null;
  const actuators = {
    retryWebhooks: async () => { webhookRetries = 3; return { retried: 3 }; },
    resumeTasks: async () => { tasksResumed = 1; return { resumed: 1 }; },
    fallbackProvider: (p) => { fellBack = p; return 'mock'; },
    reaudit: () => ({ trustworthy: true }),
  };
  return (async () => {
    const d = H.diagnose({ webhookStats: { dead: 3 }, stuckTasks: [{ id: 't1' }], providersDown: ['bhashini'], auditVerdict: { trustworthy: true } });
    const r = await H.heal(d, actuators);
    a(webhookRetries === 3, 'Retried dead webhooks');
    a(tasksResumed === 1, 'Resumed stuck tasks');
    a(fellBack === 'bhashini', 'Fell back the non-money provider (flagged)');
    a(r.post_audit && r.post_audit.trustworthy === true, 'Re-audited after healing');
    a(/auto-healed/.test(r.summary), 'Summarizes the heal');

    sec('Innovation — proposes, never acts');
    {
      const out = I.propose({
        feedbackInsights: [{ vertical: 'handicraft', severity: 'critical', signal: 'returns', action: 'Investigate quality', who: 'founder' },
          { vertical: 'tourism', severity: 'positive', signal: 'ratings', action: 'double down' }],
        verticalPerformance: { tourism: { gmv_paise: 900000 }, gems: { gmv_paise: 200000 } },
        partnersActive: ['showroom'], partnersAvailable: ['showroom', 'travel_agent', 'creator'],
        schemesMatched: 2,
        idle: { verticalsWithNoSellers: ['environment'] },
      });
      a(out.opportunities.length >= 4, 'Proposes multiple opportunities');
      a(out.opportunities[0].priority === 1, 'Critical fix ranked first');
      a(out.opportunities.some((o) => o.kind === 'grow' && /travel_agent|distribution/.test(o.title + o.rationale)), 'Suggests an unused channel for the top vertical');
      a(out.opportunities.some((o) => o.kind === 'new' && /environment/.test(o.title)), 'Flags the empty vertical as supply opportunity');
      a(/proposals only/i.test(out.disclaimer), 'Carries the suggest-not-act disclaimer');
    }

    console.log('\n' + '='.repeat(50));
    console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
    console.log('='.repeat(50));
    process.exit(fail > 0 ? 1 : 0);
  })();
}
