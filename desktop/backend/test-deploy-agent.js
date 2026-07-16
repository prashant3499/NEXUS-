'use strict';

/**
 * test-deploy-agent.js
 *
 * Tests the release-readiness gate + maintenance cycle:
 *   - Critical blockers produce NO-GO
 *   - Clean state produces GO
 *   - Platform-in-loss always vetoes (never-in-loss invariant at deploy time)
 *   - Founder approval is ALWAYS required (human in the loop)
 *   - Deploy plan steps carry correct autonomy tiers
 *   - Maintenance cycle splits auto vs founder actions, escalates on critical
 */

const D = require('./src/deployAgent');
const operations = require('./src/operations');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const READY_CTX = {
  tests: { total: 2617, passed: 2617, failed: 0, suites: 40 },
  auth: { enabled: true, mutatingRoutesProtected: true },
  profitGuard: { aiBoundary: true, orderBoundary: true, platformInLoss: false },
  payments: { provider: 'razorpay', routeConfigured: true, kycComplete: true },
  env: { name: 'production', hasAnthropicKey: true, httpsTerminated: true },
  compliance: { gstin: true, iec: true, adCode: true, lut: true, privacyPolicy: true, grievanceOfficer: true },
  monitoring: { errorTracking: true, uptimeChecks: true, backups: true },
};

sec('Constants');
{
  a(D.SEVERITY.CRITICAL === 'critical', 'SEVERITY.CRITICAL');
  a(D.RELEASE_VERDICT.GO === 'go' && D.RELEASE_VERDICT.NO_GO === 'no_go', 'Release verdicts');
  a(D.RELEASE_CHECKS.length === 7, '7 release checks defined');
}

sec('assessReleaseReadiness — clean state is GO');
{
  const r = D.assessReleaseReadiness(READY_CTX);
  a(r.verdict === 'go', 'Verdict GO');
  a(r.can_deploy === true, 'Can deploy');
  a(r.critical_blockers.length === 0, 'No critical blockers');
  a(r.warnings.length === 0, 'No warnings');
  a(r.requires_founder_approval === true, 'STILL requires founder approval (human in the loop)');
}

sec('assessReleaseReadiness — empty context is NO-GO');
{
  const r = D.assessReleaseReadiness({});
  a(r.verdict === 'no_go', 'Empty ctx → NO-GO');
  a(r.can_deploy === false, 'Cannot deploy');
  a(r.critical_blockers.length > 0, 'Has critical blockers');
}

sec('assessReleaseReadiness — failing tests veto');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, tests: { total: 100, passed: 95, failed: 5, suites: 3 } });
  a(r.verdict === 'no_go', 'Failing tests → NO-GO');
  a(r.critical_blockers.some(b => b.id === 'tests_green'), 'tests_green is a blocker');
}

sec('assessReleaseReadiness — auth=none vetoes');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, auth: { enabled: false, mutatingRoutesProtected: false } });
  a(r.verdict === 'no_go', 'auth=none → NO-GO');
  a(r.critical_blockers.some(b => b.id === 'auth_enabled'), 'auth_enabled is a blocker');
  a(/unauthenticated/i.test(r.critical_blockers.find(b => b.id === 'auth_enabled').evidence), 'Evidence explains the risk');
}

sec('assessReleaseReadiness — mock payments veto');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, payments: { provider: 'mock' } });
  a(r.verdict === 'no_go', 'Mock payments → NO-GO');
  a(r.critical_blockers.some(b => b.id === 'payments_settlement'), 'payments_settlement blocker');
}

sec('assessReleaseReadiness — platform in loss ALWAYS vetoes');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, profitGuard: { aiBoundary: true, orderBoundary: true, platformInLoss: true } });
  a(r.verdict === 'no_go', 'In-loss → NO-GO');
  const blocker = r.critical_blockers.find(b => b.id === 'profit_guard_intact');
  a(blocker && /loss/i.test(blocker.evidence), 'Never-in-loss invariant enforced at deploy boundary');
}

sec('assessReleaseReadiness — missing profit guard boundary vetoes');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, profitGuard: { aiBoundary: true, orderBoundary: false, platformInLoss: false } });
  a(r.verdict === 'no_go', 'Missing order-boundary guard → NO-GO');
}

sec('assessReleaseReadiness — partial compliance is GO_WITH_WARNINGS or NO_GO');
{
  // 4 of 6 compliance → warn (domestic-launch viable, export not)
  const r = D.assessReleaseReadiness({
    ...READY_CTX,
    compliance: { gstin: true, privacyPolicy: true, grievanceOfficer: true, lut: true },
  });
  a(r.verdict === 'go_with_warnings', '4/6 compliance → GO_WITH_WARNINGS');
  a(r.warnings.some(w => w.id === 'compliance_pack'), 'compliance_pack is a warning');
  // 2 of 6 → critical
  const r2 = D.assessReleaseReadiness({ ...READY_CTX, compliance: { gstin: true, privacyPolicy: true } });
  a(r2.verdict === 'no_go', '2/6 compliance → NO-GO');
}

sec('assessReleaseReadiness — missing monitoring is a warning not a blocker');
{
  const r = D.assessReleaseReadiness({ ...READY_CTX, monitoring: {} });
  a(r.verdict === 'go_with_warnings', 'No monitoring → GO_WITH_WARNINGS');
  a(r.warnings.some(w => w.id === 'monitoring'), 'monitoring is a warning');
  a(r.can_deploy === true, 'Can still deploy with monitoring warning');
}

sec('planDeploy — ordered steps with autonomy tiers');
{
  const plan = D.planDeploy(READY_CTX);
  a(plan.can_proceed === true, 'Ready ctx → can proceed');
  a(Array.isArray(plan.steps) && plan.steps.length === 6, '6 deploy steps');
  a(plan.steps[0].id === 'gate' && plan.steps[0].autonomy === operations.AUTONOMY.MANUAL, 'First step is MANUAL founder gate');
  a(plan.steps.some(s => s.id === 'deploy' && s.autonomy === operations.AUTONOMY.MANUAL), 'Cutover is MANUAL');
  a(plan.steps.some(s => s.id === 'backup' && s.autonomy === operations.AUTONOMY.AUTO), 'Backup is AUTO');
  a(typeof plan.rollback_plan === 'string' && plan.rollback_plan.length > 0, 'Has a rollback plan');
}

sec('planDeploy — blocked when not ready');
{
  const plan = D.planDeploy({});
  a(plan.can_proceed === false, 'Empty ctx → cannot proceed');
  a(typeof plan.blocked_reason === 'string', 'Blocked reason given');
}

sec('runMaintenanceCycle — health + windows + runbooks');
{
  const cycle = D.runMaintenanceCycle({
    state: { products_v2: new Map(), orders_v2: new Map(), sellers: new Map() },
    now: Date.now(),
    lastWindowRuns: {},
  });
  a(cycle.overall_health !== undefined, 'Reports overall health');
  a(Array.isArray(cycle.auto_actions), 'auto_actions is an array');
  a(Array.isArray(cycle.founder_actions), 'founder_actions is an array');
  a(Array.isArray(cycle.due_windows), 'due_windows is an array');
  a(typeof cycle.escalate_to_founder === 'boolean', 'escalate flag present');
  a(typeof cycle.ran_at === 'number', 'Timestamped');
}

sec('runMaintenanceCycle — splits autonomy correctly');
{
  const cycle = D.runMaintenanceCycle({ state: {}, now: Date.now() });
  // Every auto action must be AUTO tier; every founder action must NOT be
  const autoOk = cycle.auto_actions.every(r => r.autonomy === operations.AUTONOMY.AUTO);
  const founderOk = cycle.founder_actions.every(r => r.autonomy !== operations.AUTONOMY.AUTO);
  a(autoOk, 'All auto_actions are AUTO tier');
  a(founderOk, 'All founder_actions are NOTIFY/MANUAL tier');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
