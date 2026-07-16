'use strict';

const OP = require('./src/operations');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('HEALTH LEVELS — well-defined enum');
{
  a(OP.HEALTH_LEVEL.OK === 'ok',          'OK level defined');
  a(OP.HEALTH_LEVEL.WARN === 'warn',       'WARN level defined');
  a(OP.HEALTH_LEVEL.FAIL === 'fail',       'FAIL level defined');
}

sec('AUTONOMY TIERS — well-defined enum');
{
  a(OP.AUTONOMY.AUTO === 'auto',           'AUTO defined');
  a(OP.AUTONOMY.NOTIFY === 'notify',        'NOTIFY defined');
  a(OP.AUTONOMY.MANUAL === 'manual',        'MANUAL defined');
}

// ────────────────────────────────────────────────────────────
sec('HEALTH CHECKS — store size thresholds');
{
  const ok   = OP.HEALTH_CHECKS.store_size.check({ storeFileBytes: 1_000_000 });
  a(ok.level === 'ok',                      'Small store → ok');
  a(ok.healthy === true,                    'Healthy flag set');

  const warn = OP.HEALTH_CHECKS.store_size.check({ storeFileBytes: 15_000_000 });
  a(warn.level === 'warn',                  '15MB store → warn');

  const fail = OP.HEALTH_CHECKS.store_size.check({ storeFileBytes: 60_000_000 });
  a(fail.level === 'fail',                  '60MB store → fail');
  a(fail.runbook === 'migrate_to_postgres', 'Fail names the runbook');
}

sec('HEALTH CHECKS — inference cost share');
{
  const ok = OP.HEALTH_CHECKS.inference_cost_share.check({
    totalCostPaise: 100_000, byCategory: { inference: 50_000, infra: 50_000 },
  });
  a(ok.level === 'ok',                       '50% inference → ok');

  const warn = OP.HEALTH_CHECKS.inference_cost_share.check({
    totalCostPaise: 100_000, byCategory: { inference: 78_000, infra: 22_000 },
  });
  a(warn.level === 'warn',                   '78% inference → warn');

  const fail = OP.HEALTH_CHECKS.inference_cost_share.check({
    totalCostPaise: 100_000, byCategory: { inference: 92_000, infra: 8_000 },
  });
  a(fail.level === 'fail',                   '92% inference → fail');
  a(fail.runbook === 'reroute_to_haiku',     'Fail routes to Haiku rerouting');
}

sec('HEALTH CHECKS — zero-cost edge case');
{
  const r = OP.HEALTH_CHECKS.inference_cost_share.check({ totalCostPaise: 0 });
  a(r.level === 'ok',                        'Zero cost → ok, no divide-by-zero');
}

sec('HEALTH CHECKS — production readiness');
{
  const ok = OP.HEALTH_CHECKS.ready_gate.check({ missingConfig: [] });
  a(ok.level === 'ok',                       'No missing config → ok');

  const fail = OP.HEALTH_CHECKS.ready_gate.check({
    missingConfig: ['razorpay.key_id', 'gst.iec_code'],
  });
  a(fail.level === 'fail',                   'Missing config → fail');
  a(fail.evidence.includes('2 gates'),       'Counts gates in evidence');
  a(fail.runbook === 'close_config_gates',    'Routes to close-gates runbook');
}

sec('HEALTH CHECKS — returns SLA');
{
  const ok = OP.HEALTH_CHECKS.returns_sla.check({ returnsBreaches: 0 });
  a(ok.level === 'ok',                       'No breaches → ok');

  const warn = OP.HEALTH_CHECKS.returns_sla.check({ returnsBreaches: 2 });
  a(warn.level === 'warn',                   '2 breaches → warn');

  const fail = OP.HEALTH_CHECKS.returns_sla.check({ returnsBreaches: 7 });
  a(fail.level === 'fail',                   '7 breaches → fail');
}

sec('HEALTH CHECKS — sourcing freshness');
{
  const fresh = OP.HEALTH_CHECKS.sourcing_freshness.check({ daysSinceLastLead: 3 });
  a(fresh.level === 'ok',                    'Fresh sourcing → ok');

  const stale = OP.HEALTH_CHECKS.sourcing_freshness.check({ daysSinceLastLead: 10 });
  a(stale.level === 'warn',                  '10 days → warn');

  const dead = OP.HEALTH_CHECKS.sourcing_freshness.check({ daysSinceLastLead: 20 });
  a(dead.level === 'fail',                   '20 days → fail');
  a(dead.runbook === 'refresh_lead_sources', 'Routes to refresh runbook');

  const undef = OP.HEALTH_CHECKS.sourcing_freshness.check({});
  a(undef.level === 'ok',                    'No history → ok (not punished)');
}

sec('HEALTH CHECKS — approvals age');
{
  const fresh = OP.HEALTH_CHECKS.approvals_age.check({ oldestApprovalHours: 4 });
  a(fresh.level === 'ok',                    'Fresh queue → ok');

  const warn = OP.HEALTH_CHECKS.approvals_age.check({ oldestApprovalHours: 24 });
  a(warn.level === 'warn',                   '24h → warn');

  const fail = OP.HEALTH_CHECKS.approvals_age.check({ oldestApprovalHours: 72 });
  a(fail.level === 'fail',                   '72h → fail');
}

sec('HEALTH CHECKS — test coverage');
{
  const ok = OP.HEALTH_CHECKS.test_coverage.check({ testsPassed: 1000, testsFailed: 0 });
  a(ok.level === 'ok',                       'All green → ok');

  const fail = OP.HEALTH_CHECKS.test_coverage.check({ testsPassed: 990, testsFailed: 10 });
  a(fail.level === 'fail',                   'Any failure → fail');
  a(fail.runbook === 'fix_failing_tests',    'Routes to fix-tests runbook');
}

// ────────────────────────────────────────────────────────────
sec('RUNBOOKS — registry shape');
{
  const rb = OP.RUNBOOKS.migrate_to_postgres;
  a(rb.title,                                'Has title');
  a(rb.autonomy === OP.AUTONOMY.MANUAL,      'Migration is manual (high-risk)');
  a(Array.isArray(rb.steps),                 'Has step list');
  a(rb.steps.length >= 5,                    'Migration runbook has ≥5 steps');
  a(rb.estimated_minutes > 0,                'Time estimate provided');
  a(rb.steps[0].autonomy,                    'First step has autonomy tier');
}

sec('RUNBOOKS — every health-check fail-routing points to a real runbook');
{
  for (const [key, check] of Object.entries(OP.HEALTH_CHECKS)) {
    // Drive the check into a failure state where possible
    const sample = {
      storeFileBytes: 60_000_000,
      totalCostPaise: 100, byCategory: { inference: 95, infra: 5 },
      missingConfig: ['x'],
      returnsBreaches: 7,
      daysSinceLastLead: 20,
      oldestApprovalHours: 72,
      testsPassed: 1, testsFailed: 1,
    };
    const r = check.check(sample);
    if (r.runbook) {
      a(OP.RUNBOOKS[r.runbook] !== undefined,  `${key}'s runbook "${r.runbook}" exists`);
    }
  }
}

sec('RUNBOOKS — autonomy tiers are sensible');
{
  // Destructive things should be MANUAL
  a(OP.RUNBOOKS.migrate_to_postgres.autonomy === OP.AUTONOMY.MANUAL,
                                              'DB migration is MANUAL');
  a(OP.RUNBOOKS.close_config_gates.autonomy === OP.AUTONOMY.MANUAL,
                                              'Closing config gates is MANUAL');
  a(OP.RUNBOOKS.fix_failing_tests.autonomy === OP.AUTONOMY.MANUAL,
                                              'Fixing tests is MANUAL');
  // Routine things can be NOTIFY or AUTO
  a(OP.RUNBOOKS.backup_verification.autonomy === OP.AUTONOMY.NOTIFY,
                                              'Backup verify is NOTIFY');
  a(OP.RUNBOOKS.dependency_audit.autonomy === OP.AUTONOMY.NOTIFY,
                                              'Dep audit is NOTIFY');
}

// ────────────────────────────────────────────────────────────
sec('runHealthChecks — aggregate state snapshot');
{
  const r = OP.runHealthChecks({
    storeFileBytes: 1_000_000,
    totalCostPaise: 100_000, byCategory: { inference: 50_000, infra: 50_000 },
    missingConfig: [],
    returnsBreaches: 0,
    daysSinceLastLead: 2,
    oldestApprovalHours: 4,
    testsPassed: 1000, testsFailed: 0,
  });
  a(r.overallHealth === 'ok',                'Healthy snapshot → overall ok');
  a(r.summary.fail === 0,                    'No failures');
  a(r.summary.warn === 0,                    'No warnings');
  a(r.summary.ok >= 5,                       'All checks reported');
}

sec('runHealthChecks — mixed state');
{
  const r = OP.runHealthChecks({
    storeFileBytes: 60_000_000,              // FAIL
    totalCostPaise: 100_000, byCategory: { inference: 78_000 },  // WARN
    missingConfig: [],
    returnsBreaches: 0,
    daysSinceLastLead: 2,
    oldestApprovalHours: 4,
    testsPassed: 1000, testsFailed: 0,
  });
  a(r.overallHealth === 'fail',              'Mixed with FAIL → overall fail');
  a(r.summary.fail >= 1,                     'At least one fail');
  a(r.summary.warn >= 1,                     'At least one warn');
  a(r.results.store_size.level === 'fail',   'Store size flagged fail');
  a(r.results.inference_cost_share.level === 'warn', 'Inference flagged warn');
}

sec('runHealthChecks — empty state still runs');
{
  const r = OP.runHealthChecks({});
  a(r.results,                               'Empty state returns results');
  a(r.overallHealth === 'ok',                'No data → ok by default');
}

// ────────────────────────────────────────────────────────────
sec('recommendedRunbooks — FAIL before WARN');
{
  // Both FAILs and WARNs route to runbooks now. FAILs come first in the queue.
  const health = OP.runHealthChecks({
    storeFileBytes: 60_000_000,              // FAIL → migrate_to_postgres
    totalCostPaise: 100_000, byCategory: { inference: 78_000 },  // WARN → reroute_to_haiku
    daysSinceLastLead: 20,                    // FAIL → refresh_lead_sources
  });
  const queue = OP.recommendedRunbooks(health);
  a(queue.length >= 3,                       'At least 3 runbooks queued');
  a(queue[0].level === 'fail',               'First entry is FAIL');
  // All FAILs should come before any WARN
  let seenWarn = false;
  let ordered = true;
  for (const item of queue) {
    if (item.level === 'warn') seenWarn = true;
    if (seenWarn && item.level === 'fail') { ordered = false; break; }
  }
  a(ordered,                                  'FAILs all before WARNs');
  a(queue[0].runbook.steps !== undefined,    'Runbook content included');
}

sec('recommendedRunbooks — empty when all green');
{
  const health = OP.runHealthChecks({
    storeFileBytes: 1_000_000,
    totalCostPaise: 100_000, byCategory: { inference: 50_000 },
    missingConfig: [],
    returnsBreaches: 0,
    daysSinceLastLead: 2,
    oldestApprovalHours: 4,
    testsPassed: 1000, testsFailed: 0,
  });
  const queue = OP.recommendedRunbooks(health);
  a(queue.length === 0,                      'All green → no recommendations');
}

// ────────────────────────────────────────────────────────────
sec('MAINTENANCE WINDOWS — registry shape');
{
  a('weekly_backup_verify' in OP.MAINTENANCE_WINDOWS, 'Backup window defined');
  a('weekly_dep_audit' in OP.MAINTENANCE_WINDOWS,      'Dep audit window defined');
  a('daily_inference_cost' in OP.MAINTENANCE_WINDOWS,  'Daily inference window defined');

  const win = OP.MAINTENANCE_WINDOWS.weekly_backup_verify;
  a(win.frequency_days > 0,                  'Frequency set');
  a(win.runbook,                              'Window names its runbook');
  a(OP.RUNBOOKS[win.runbook],                 'Referenced runbook exists');
}

sec('dueWindows — never run → all due');
{
  const due = OP.dueWindows({});
  a(due.length === Object.keys(OP.MAINTENANCE_WINDOWS).length,
                                              'All windows due when never run');
  a(due[0].overdueMs >= 0,                    'Overdue time computed');
}

sec('dueWindows — recently run → not due');
{
  const now = Date.now();
  const due = OP.dueWindows({
    windowLastRuns: {
      weekly_backup_verify: now - 86400000,    // 1 day ago — not due yet (7d freq)
      weekly_dep_audit:     now - 86400000,
      daily_inference_cost: now - 3600000,     // 1 hour ago — not due yet (1d freq)
    },
  }, now);
  a(due.length === 0,                         'Recently run → nothing due');
}

sec('dueWindows — overdue ordering');
{
  const now = Date.now();
  const due = OP.dueWindows({
    windowLastRuns: {
      weekly_backup_verify: now - 10 * 86400000,    // 3 days overdue
      weekly_dep_audit:     now - 20 * 86400000,    // 13 days overdue (worst)
      daily_inference_cost: now - 2 * 86400000,     // 1 day overdue
    },
  }, now);
  a(due.length === 3,                         'All three due');
  a(due[0].key === 'weekly_dep_audit',        'Most overdue first');
  a(due[0].overdueDays > due[1].overdueDays,  'Sorted by overdue descending');
}

sec('recordWindowRun — produces new lastRuns');
{
  const before = { windowLastRuns: {} };
  const after = OP.recordWindowRun(before, 'weekly_backup_verify', 12345);
  a(after.weekly_backup_verify === 12345,    'Window recorded');
  a(Object.keys(before.windowLastRuns).length === 0,
                                              'Original state untouched');

  let threw = false;
  try { OP.recordWindowRun({}, 'unknown_window'); } catch (e) { threw = true; }
  a(threw,                                    'Unknown window throws');
}

// ────────────────────────────────────────────────────────────
sec('auditEntry — well-formed log records');
{
  const e = OP.auditEntry({
    action: 'check', key: 'store_size', level: 'warn',
    evidence: '15MB', autonomy: OP.AUTONOMY.AUTO, by: 'system', now: 12345,
  });
  a(e.id.startsWith('ops_'),                  'ID prefixed');
  a(e.at === 12345,                            'Timestamp preserved');
  a(e.action === 'check',                      'Action recorded');
  a(e.key === 'store_size',                    'Key recorded');
  a(Object.isFrozen(e),                        'Entry is immutable');
}

// ────────────────────────────────────────────────────────────
sec('END-TO-END — solo founder daily ops sequence');
{
  // Simulate: founder boots system, AI checks health, surfaces fails
  const state = {
    storeFileBytes: 30_000_000,              // FAIL → migrate
    totalCostPaise: 1_000_000, byCategory: { inference: 880_000 },  // FAIL → reroute
    missingConfig: [],
    returnsBreaches: 0,
    daysSinceLastLead: 8,                     // WARN → refresh sources
    oldestApprovalHours: 4,
    testsPassed: 1154, testsFailed: 0,
    windowLastRuns: { weekly_backup_verify: Date.now() - 8 * 86400000 },  // 1d overdue
  };

  // 1. Run health
  const health = OP.runHealthChecks(state);
  a(health.overallHealth === 'fail',          '2 fails → overall fail');

  // 2. Get prioritized runbooks
  const runbooks = OP.recommendedRunbooks(health);
  a(runbooks.length >= 2,                     'Multiple runbooks queued');
  a(runbooks[0].level === 'fail',             'Top of queue is fail');
  a(runbooks[0].runbook.steps.length > 0,     'Runbook has actionable steps');

  // 3. Find due windows
  const windows = OP.dueWindows(state);
  a(windows.some(w => w.key === 'weekly_backup_verify'),
                                              'Overdue backup is in due list');

  // 4. Founder approves running backup verify → record it
  const newLastRuns = OP.recordWindowRun(state, 'weekly_backup_verify');
  a(newLastRuns.weekly_backup_verify !== undefined,
                                              'Window run recorded');

  // 5. Audit entry for the action
  const audit = OP.auditEntry({
    action: 'window_complete', key: 'weekly_backup_verify',
    level: 'ok', evidence: 'restore test passed',
    autonomy: OP.AUTONOMY.NOTIFY, by: 'founder',
  });
  a(audit.action === 'window_complete',      'Audit action correct');
  a(audit.by === 'founder',                   'Audit captures who');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
