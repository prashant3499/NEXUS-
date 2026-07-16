'use strict';

/**
 * test-launch-orchestrator.js — the AI chief-of-staff.
 *   - Every task is owned + categorized + severity-tagged
 *   - Real signals flip credential/product tasks to done
 *   - AI-prepare tasks become done only via founder approval
 *   - nextActions splits "AI can prepare" from "needs you"
 *   - readiness_pct + can_launch reflect blocker completion
 */

const L = require('./src/launchOrchestrator');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Task registry integrity');
{
  a(L.LAUNCH_TASKS.length >= 10, `Registry has ${L.LAUNCH_TASKS.length} launch tasks`);
  a(L.LAUNCH_TASKS.every(t => t.id && t.title && t.category && t.owner && t.severity), 'Every task is fully specified');
  a(L.LAUNCH_TASKS.every(t => Object.values(L.OWNER).includes(t.owner)), 'Every owner is valid');
  a(L.LAUNCH_TASKS.some(t => t.id === 'minor_guardian'), 'Tracks the open minor/guardian item (not forgotten)');
  a(L.LAUNCH_TASKS.some(t => t.id === 'golive_approval' && t.owner === L.OWNER.FOUNDER_DECIDE), 'Go-live is a founder decision, never automatic');
}

sec('Fresh platform (dev) — mostly not ready');
{
  const r = L.assessLaunch({}, {});
  a(r.readiness_pct < 100, `Fresh platform not launch-ready (${r.readiness_pct}%)`);
  a(r.can_launch === false, 'Cannot launch yet');
  a(r.blockers_remaining > 0, 'Has remaining blockers');
  a(r.board[L.CATEGORY.LEGAL].length === 4, 'Legal category has the 4 policy docs');
}

sec('Real signals flip credential tasks to done');
{
  const ctx = { authSecretSet: true, paymentsLive: true, anthropicKeySet: true, mapsLive: true, monitoringSet: true, minorGuardianBuilt: true };
  const r = L.assessLaunch(ctx, {});
  const cred = r.board[L.CATEGORY.CREDENTIALS];
  a(cred.find(t => t.id === 'auth_secret').status === 'done', 'AUTH_SECRET present → done');
  a(cred.find(t => t.id === 'razorpay_keys').status === 'done', 'Razorpay live → done');
  a(cred.find(t => t.id === 'anthropic_key').status === 'done', 'Anthropic key → done');
  a(r.board[L.CATEGORY.PRODUCT].find(t => t.id === 'minor_guardian').status === 'done', 'minor/guardian built → done');
}

sec('AI-prepare tasks need founder approval to be done');
{
  // Just preparing a draft → status "prepared", not done
  const prepared = L.assessLaunch({}, { terms_of_service: { status: 'prepared' } });
  a(prepared.board[L.CATEGORY.LEGAL].find(t => t.id === 'terms_of_service').status === 'prepared', 'Prepared draft shows as "prepared" (awaiting approval)');
  // Founder approves → done
  const approved = L.assessLaunch({}, { terms_of_service: { status: 'done' } });
  a(approved.board[L.CATEGORY.LEGAL].find(t => t.id === 'terms_of_service').status === 'done', 'Founder approval → done');
}

sec('nextActions — split by who must act');
{
  const n = L.nextActions({}, {});
  a(Array.isArray(n.ai_can_prepare) && n.ai_can_prepare.length > 0, 'Lists tasks the AI can prepare now');
  a(n.ai_can_prepare.some(t => t.id === 'terms_of_service'), 'Terms of Service is AI-preparable');
  a(Array.isArray(n.needs_founder) && n.needs_founder.length > 0, 'Lists tasks that need the founder');
  a(n.needs_founder.some(t => t.id === 'razorpay_keys' && t.action === 'provide'), 'Credentials → "provide"');
  a(n.needs_founder.some(t => t.id === 'golive_approval' && t.action === 'decide'), 'Go-live → "decide"');
  a(/AI can prepare/.test(n.summary), 'Summary frames the split');
  // Blockers sort first
  a(n.ai_can_prepare[0].severity === 'blocker', 'Blockers prioritised in the AI worklist');
}

sec('Prepared items move to the founder-approval queue');
{
  const n = L.nextActions({}, { privacy_policy: { status: 'prepared' } });
  a(!n.ai_can_prepare.some(t => t.id === 'privacy_policy'), 'Prepared item leaves the AI worklist');
  a(n.needs_founder.some(t => t.id === 'privacy_policy' && t.action === 'review_and_approve'), 'Prepared item enters the approval queue');
}

sec('Fully ready → can launch');
{
  const ctx = { authSecretSet: true, paymentsLive: true, anthropicKeySet: true, mapsLive: true, monitoringSet: true, minorGuardianBuilt: true };
  const approvals = { terms_of_service: { status: 'done' }, privacy_policy: { status: 'done' }, return_policy: { status: 'done' }, grievance_policy: { status: 'done' }, gstin: { status: 'done' }, https: { status: 'done' }, golive_approval: { status: 'done' } };
  // gstin + https are founder_input without a check fn; approve them in the log
  const r = L.assessLaunch(ctx, approvals);
  a(r.readiness_pct === 100, `All blockers cleared → 100% (${r.readiness_pct}%)`);
  a(r.can_launch === true, 'Can launch when every blocker is done');
}

sec('getTask');
{
  a(L.getTask('terms_of_service').policy === 'terms', 'Resolves a task by id');
  a(L.getTask('nonexistent') === null, 'Unknown id → null');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
