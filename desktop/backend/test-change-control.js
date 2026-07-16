'use strict';

const CC = require('./src/changeControl');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Can change anything — structural, functional, agentic, operational, config');
{
  const cap = CC.capability();
  a(cap.can_change.structural && cap.can_change.functional && cap.can_change.agentic && cap.can_change.operational && cap.can_change.config, 'All change kinds covered');
  a(cap.operations.includes('add') && cap.operations.includes('remove') && cap.operations.includes('substitute') && cap.operations.includes('modify'), 'add/modify/remove/substitute');
}

sec('GATE 1 — invariant-breaking changes are REFUSED (even by founder)');
{
  const r = CC.propose({ kind: 'functional', op: 'remove', target: 'never_in_loss guard', description: 'disable the never-in-loss check' });
  a(r.ok === false && r.refused === true && r.stage === 'invariant_gate', 'Disabling never-in-loss → refused at invariant gate');
  const r2 = CC.propose({ kind: 'functional', op: 'modify', target: 'verification', description: 'fake verification to auto-pass' });
  a(r2.refused === true, 'Faking verification → refused');
  // and cannot be approved
  const ap = CC.approve(r, 'approve');
  a(ap.ok === false, 'A refused change cannot be approved');
}

sec('GATE 2 — code changes need green tests');
{
  const red = CC.propose({ kind: 'structural', op: 'add', target: 'new module', description: 'add a feature' }, { tests_green: false });
  a(red.ok === false && red.stage === 'test_gate', 'Failing tests → blocked at test gate');
  const green = CC.propose({ kind: 'structural', op: 'add', target: 'new module', description: 'add a feature' }, { tests_green: true, audit_trustworthy: true });
  a(green.ok === true && green.stage === 'awaiting_founder_approval', 'Green tests → proceeds to founder');
}

sec('GATE 3 — founder approves structural/functional/agentic changes');
{
  const p = CC.propose({ kind: 'agentic', op: 'remove', target: 'innovation agent', description: 'pause the innovation agent' }, { tests_green: true, audit_trustworthy: true });
  a(p.classification.needs_founder_approval === true, 'Agentic change needs founder approval');
  const rej = CC.approve(p, 'reject');
  a(rej.applied === false && rej.status === 'rejected_by_founder', 'Founder can reject');
  const ok = CC.approve(p, 'approve');
  a(ok.applied === true && /approved by founder/i.test(ok.log), 'Founder approval applies it, logged');
}

sec('Low-risk operational tweaks can auto-apply');
{
  const op = CC.propose({ kind: 'operational', op: 'modify', target: 'retry interval', description: 'increase webhook retry backoff' }, { tests_green: true });
  a(op.stage === 'auto_applicable', 'Operational tweak → auto-applicable');
  a(op.classification.risk === 'low', 'Classified low risk');
}

sec('Honest about being governance, not hands');
{
  const cap = CC.capability();
  a(/does not itself edit source or deploy/i.test(cap.honest_note), 'Honest: governs change, does not edit/deploy itself');
  a(/developer.*founder are the hands/i.test(cap.honest_note), 'Hands = developer + founder');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
