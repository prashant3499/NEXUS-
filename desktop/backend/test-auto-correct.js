'use strict';

const AC = require('./src/autoCorrect');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Classifies corrections by safety');
{
  const p = AC.plan({ issues: [
    { type: 'webhook_retryable' }, { type: 'task_stuck' },
    { type: 'payout_mismatch' }, { type: 'pricing_drift' },
    { type: 'invariant_breach' },
  ] });
  a(p.auto.length === 2, 'Safe issues → auto (webhook, task)');
  a(p.pending.length === 2, 'Risky issues → pending approval (payout, pricing)');
  a(p.forbidden.length === 1, 'Invariant breach → forbidden (never auto-fixed)');
}

sec('Safe fixes auto-apply; risky ones queue for the founder');
{
  const applied = [];
  const appliers = { retry_webhook: (c) => applied.push(c.fix), resume_task: (c) => applied.push(c.fix) };
  const queue = { _q: [], push(e) { this._q.push(e); }, list() { return this._q; } };
  const r = AC.runAutoCorrect({ issues: [
    { type: 'webhook_retryable', detail: 'order X' },
    { type: 'task_stuck', detail: 'task Y' },
    { type: 'payout_mismatch', detail: 'maker Z' },
  ] }, appliers, queue);
  a(r.auto_applied.length === 2 && r.auto_applied.every((c) => c.result === 'applied'), 'Both safe fixes auto-applied');
  a(r.pending_approval.length === 1 && r.pending_approval[0].type === 'payout_mismatch', 'Payout mismatch queued, not auto-applied');
  a(queue.list().length === 1 && queue.list()[0].status === 'awaiting_founder_approval', 'It waits for the founder');
  a(r.founder_in_loop === true, 'Founder-in-loop flagged');
}

sec('Money/config is NEVER auto-corrected without approval');
{
  const applied = [];
  const r = AC.runAutoCorrect({ issues: [{ type: 'payout_mismatch' }, { type: 'config_anomaly' }] },
    { reconcile_payout: () => applied.push('payout'), restore_config: () => applied.push('config') });
  a(applied.length === 0, 'Nothing money/config-touching was applied automatically');
  a(r.pending_approval.length === 2, 'Both queued for the founder');
}

sec('Founder approval applies the fix; rejection does not');
{
  const applied = [];
  const appliers = { reconcile_payout: (c) => applied.push(c.id) };
  const entry = { id: 'c1', type: 'payout_mismatch', fix: 'reconcile_payout', class: AC.CLASS.NEEDS_APPROVAL };
  const rej = AC.approve(entry, 'reject', appliers);
  a(rej.applied === false && rej.status === 'rejected_by_founder', 'Rejection → not applied');
  a(applied.length === 0, 'Nothing applied on rejection');
  const ok = AC.approve(entry, 'approve', appliers);
  a(ok.applied === true && ok.status === 'applied_after_approval', 'Approval → applied');
  a(applied[0] === 'c1', 'The fix actually ran on approval');
}

sec('An invariant-breaking correction cannot even be approved');
{
  const forbidden = { id: 'c2', type: 'invariant_breach', class: AC.CLASS.FORBIDDEN };
  const r = AC.approve(forbidden, 'approve', {});
  a(r.ok === false && /forbidden|invariant/i.test(r.reason), 'Founder cannot approve breaking an invariant (defence in depth)');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
