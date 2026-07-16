'use strict';

const A = require('./src/asyncTaskManager');
const F = require('./src/feedbackLoop');
const S = require('./src/customerSourcing');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Async task manager — pause & resume from checkpoint');
{
  const m = A.makeManager();
  const t = m.create({ kind: 'sourcing_outreach', label: 'GI seller outreach', checkpoint: { step: 0 } });
  a(t.state === 'pending', 'New task is pending');
  m.start(t.id);
  m.checkpoint(t.id, { step: 3, processed: 3 });
  const paused = m.pause(t.id);
  a(paused.ok && m.get(t.id).state === 'paused', 'Running task pauses');
  const resumed = m.resume(t.id);
  a(resumed.ok && resumed.resumed_from.step === 3, 'Resumes FROM the checkpoint (step 3, not 0)');
  a(m.get(t.id).state === 'running', 'Back to running after resume');
  m.complete(t.id, { sent: 10 });
  a(m.get(t.id).state === 'completed' && m.get(t.id).result.sent === 10, 'Completes with a result');
}

sec('Async — Beckn-style callback wait');
{
  const m = A.makeManager();
  const t = m.create({ kind: 'beckn_search' });
  m.start(t.id);
  m.waitForCallback(t.id, { txn: 'abc' });
  a(m.get(t.id).state === 'awaiting_callback', 'Waits for the on_search callback');
  const r = m.onCallback(t.id, { catalog: {} });
  a(r.ok && m.get(t.id).state === 'running', 'Callback resumes the task');
}

sec('Async — founder approval gate');
{
  const m = A.makeManager();
  const t = m.create({ kind: 'agent_action', needs_approval: true });
  m.start(t.id);
  m.requestApproval(t.id, { action: 'send 500 outreach emails' });
  a(m.get(t.id).state === 'awaiting_approval', 'Pauses for founder approval');
  a(m.resumable().some((x) => x.id === t.id), 'Shows up as resumable');
  m.approve(t.id);
  a(m.get(t.id).state === 'running', 'Approval resumes it');
  // reject path
  const t2 = m.create({ kind: 'agent_action' }); m.start(t2.id); m.requestApproval(t2.id);
  m.reject(t2.id, 'too risky');
  a(m.get(t2.id).state === 'cancelled', 'Rejection cancels');
}

sec('Async — invalid transitions blocked');
{
  const m = A.makeManager();
  const t = m.create({});
  const bad = m.complete(t.id); // can't complete a pending task
  a(bad.ok === false, 'Cannot complete a pending task (invalid transition)');
  a(m.stats().total === 1, 'Stats track tasks');
}

sec('Feedback loop — signals to insights');
{
  let st = F.emptyState();
  // Lots of returns in handicraft → should surface
  for (let i = 0; i < 4; i++) F.record(st, { type: 'return', vertical: 'handicraft' });
  F.record(st, { type: 'review', vertical: 'handicraft', value: 2 });
  F.record(st, { type: 'review', vertical: 'gi', value: 5 });
  const r = F.analyze(st, { orders_by_vertical: { handicraft: 10, gi: 8 } });
  a(r.insights.length > 0, 'Produces insights from signals');
  a(r.insights.some((i) => i.vertical === 'handicraft' && i.signal === 'returns'), 'High returns flagged for handicraft');
  a(r.insights[0].severity === 'critical' || r.insights[0].severity === 'watch', 'Worst insight sorted first');
  a(r.insights.every((i) => i.action && i.who), 'Each insight has an action + owner');
}

sec('Feedback loop — positive signal compounds');
{
  let st = F.emptyState();
  for (let i = 0; i < 6; i++) F.record(st, { type: 'review', vertical: 'tourism', value: 5 });
  const r = F.analyze(st, { orders_by_vertical: { tourism: 6 } });
  a(r.insights.some((i) => i.severity === 'positive' && /double down/i.test(i.action)), 'High ratings → "double down" insight');
}

sec('Partner / channel segments');
{
  a(S.allPartnerPlans().length === 4, 'Four partner segments (showroom, travel agent, creator, social)');
  const show = S.partnerPlan('showroom');
  a(show && /consignment|wholesale|stock/i.test(show.model), 'Showroom model described');
  const ta = S.partnerPlan('travel_agent');
  a(ta && ta.channel === 'tourism_distribution', 'Travel agent → tourism distribution');
  const creator = S.partnerPlan('creator');
  a(creator && /affiliate/i.test(creator.channel), 'Creator → affiliate channel');
  a(S.partnerPlan('nope') === null, 'Unknown segment → null');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
