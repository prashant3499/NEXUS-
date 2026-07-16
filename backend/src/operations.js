/**
 * NEXUS — Operations & Maintenance.
 *
 * This module is the answer to one question: how does a solo founder
 * with an AI co-founder maintain backend operations sustainably?
 *
 * Three responsibilities:
 *
 *   1. HEALTH CHECKS — for each domain (store, payments, inference,
 *      sourcing, returns, etc.), define what "healthy" means. Run
 *      them on demand from the founder console or on a schedule.
 *      Each check returns { healthy, level: ok|warn|fail, evidence }.
 *
 *   2. RUNBOOKS — for each common ops scenario (DB filling up, LLM
 *      cost spike, SSL expiring, store-file corruption, etc.), a
 *      structured procedure with concrete steps and an explicit
 *      autonomy tier: AUTO (AI co-founder can run it), NOTIFY (run
 *      but tell the founder), or MANUAL (founder must do it).
 *
 *   3. MAINTENANCE WINDOWS — scheduled jobs (backups, log rotation,
 *      stale-data cleanup, etc.) with safety gates. Each window
 *      declares its frequency, last-run timestamp, and the runbook
 *      that fires inside it.
 *
 * Design philosophy: this module does NOT execute anything destructive
 * by itself. It DECIDES, RECOMMENDS, and TRACKS — actual command
 * execution still flows through the existing control plane HITL gates.
 * The AI co-founder reads from this module to know what's broken and
 * what to do about it; the founder decides whether to actually run
 * the patch.
 *
 * Pure logic. Same pattern as grievance.js / returns.js / sourcing.js.
 * No external dependencies.
 */

'use strict';

const crypto = require('crypto');

// ════════════════════════════════════════════════════════════
// HEALTH LEVELS
// ════════════════════════════════════════════════════════════

const HEALTH_LEVEL = {
  OK:   'ok',     // nothing to do
  WARN: 'warn',   // attention needed soon
  FAIL: 'fail',   // attention needed now
};

// ════════════════════════════════════════════════════════════
// AUTONOMY TIERS — what AI co-founder can do without asking
// ════════════════════════════════════════════════════════════

const AUTONOMY = {
  AUTO:   'auto',    // AI runs without notifying — safe, reversible, routine
  NOTIFY: 'notify',  // AI runs but tells founder afterwards
  MANUAL: 'manual',  // only founder runs — irreversible, risky, or judgment-required
};

// ════════════════════════════════════════════════════════════
// HEALTH CHECK REGISTRY
// Each entry: { domain, label, check(state) → result, frequency, severity }
// ════════════════════════════════════════════════════════════

const HEALTH_CHECKS = {
  store_size: {
    domain: 'persistence',
    label: 'Store file size',
    description: 'JSON file store grows linearly. At ~50MB, migrate to Postgres.',
    frequency: 'hourly',
    check(state = {}) {
      const bytes = state.storeFileBytes || 0;
      if (bytes < 5_000_000)   return { healthy: true,  level: HEALTH_LEVEL.OK,   evidence: `${(bytes/1024/1024).toFixed(2)}MB — well within file-store comfort` };
      if (bytes < 25_000_000)  return { healthy: true,  level: HEALTH_LEVEL.WARN, evidence: `${(bytes/1024/1024).toFixed(2)}MB — plan Postgres migration` };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `${(bytes/1024/1024).toFixed(2)}MB — migrate now`, runbook: 'migrate_to_postgres' };
    },
  },

  inference_cost_share: {
    domain: 'cost',
    label: 'Inference share of opex',
    description: 'LLM cost should not eat the platform. >70% is a routing problem.',
    frequency: 'daily',
    check(state = {}) {
      const total = state.totalCostPaise || 0;
      const inference = (state.byCategory && state.byCategory.inference) || 0;
      if (total === 0) return { healthy: true, level: HEALTH_LEVEL.OK, evidence: 'no cost recorded yet' };
      const pct = Math.round((inference / total) * 1000) / 10;
      if (pct < 70) return { healthy: true,  level: HEALTH_LEVEL.OK,   evidence: `${pct}% of opex on inference — acceptable` };
      // WARN now also points to the runbook — AI co-founder can pre-emptively reroute simple queries to Haiku without waiting for it to become a FAIL.
      if (pct < 85) return { healthy: true,  level: HEALTH_LEVEL.WARN, evidence: `${pct}% on inference — review Sonnet/Haiku routing`, runbook: 'reroute_to_haiku' };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `${pct}% on inference — routing emergency`, runbook: 'reroute_to_haiku' };
    },
  },

  ready_gate: {
    domain: 'config',
    label: 'Production readiness',
    description: 'Non-code gates (incorporation, GST, RCMC, etc.) must all be set before prod traffic.',
    frequency: 'on_deploy',
    check(state = {}) {
      const missing = state.missingConfig || [];
      if (missing.length === 0) return { healthy: true, level: HEALTH_LEVEL.OK, evidence: 'all gates green' };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `${missing.length} gates open: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`, runbook: 'close_config_gates' };
    },
  },

  returns_sla: {
    domain: 'returns',
    label: 'Returns SLA breaches',
    description: 'Any return stuck past its SLA target is a customer waiting.',
    frequency: 'hourly',
    check(state = {}) {
      const breaches = state.returnsBreaches || 0;
      if (breaches === 0) return { healthy: true, level: HEALTH_LEVEL.OK,   evidence: 'no SLA breaches' };
      if (breaches < 3)   return { healthy: true, level: HEALTH_LEVEL.WARN, evidence: `${breaches} return${breaches>1?'s':''} breaching SLA`, runbook: 'clear_returns_queue' };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `${breaches} returns breaching SLA — escalate`, runbook: 'clear_returns_queue' };
    },
  },

  sourcing_freshness: {
    domain: 'sourcing',
    label: 'Sourcing pipeline freshness',
    description: 'No new leads added in a week = pipeline drying up.',
    frequency: 'daily',
    check(state = {}) {
      const days = state.daysSinceLastLead;
      if (days === undefined || days === null) return { healthy: true, level: HEALTH_LEVEL.OK, evidence: 'no lead history yet' };
      if (days < 7)  return { healthy: true,  level: HEALTH_LEVEL.OK,   evidence: `last lead added ${days} day${days===1?'':'s'} ago` };
      if (days < 14) return { healthy: true,  level: HEALTH_LEVEL.WARN, evidence: `last lead ${days} days ago — refresh sources`, runbook: 'refresh_lead_sources' };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `last lead ${days} days ago — pipeline stalled`, runbook: 'refresh_lead_sources' };
    },
  },

  approvals_age: {
    domain: 'hitl',
    label: 'Pending founder approvals',
    description: 'Stale approvals queue means the platform stalled waiting on the founder.',
    frequency: 'hourly',
    check(state = {}) {
      const oldestHours = state.oldestApprovalHours || 0;
      if (oldestHours < 12) return { healthy: true, level: HEALTH_LEVEL.OK, evidence: `oldest approval ${oldestHours}h old` };
      if (oldestHours < 48) return { healthy: true, level: HEALTH_LEVEL.WARN, evidence: `oldest approval ${oldestHours}h old — clear today`, runbook: 'clear_approvals_queue' };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `oldest approval ${oldestHours}h old — sellers waiting`, runbook: 'clear_approvals_queue' };
    },
  },

  test_coverage: {
    domain: 'engineering',
    label: 'Test suite green',
    description: 'CI must pass on every change. A red suite is the only true emergency.',
    frequency: 'on_change',
    check(state = {}) {
      const passed = state.testsPassed || 0;
      const failed = state.testsFailed || 0;
      if (passed === 0 && failed === 0) return { healthy: true, level: HEALTH_LEVEL.OK, evidence: 'no run recorded' };
      if (failed === 0) return { healthy: true,  level: HEALTH_LEVEL.OK,   evidence: `${passed} tests passing` };
      return { healthy: false, level: HEALTH_LEVEL.FAIL, evidence: `${failed} test${failed>1?'s':''} failing`, runbook: 'fix_failing_tests' };
    },
  },
};

// ════════════════════════════════════════════════════════════
// RUNBOOK REGISTRY
// Concrete procedures for the common ops scenarios. Each runbook
// declares autonomy tier + a sequence of steps the AI co-founder
// can execute or the founder must follow.
// ════════════════════════════════════════════════════════════

const RUNBOOKS = {
  migrate_to_postgres: {
    title: 'Migrate from file store to Postgres',
    autonomy: AUTONOMY.MANUAL,
    triggered_by: ['store_size:fail'],
    estimated_minutes: 240,
    steps: [
      { id: 's1', action: 'Provision managed Postgres on Neon / Supabase / Railway', autonomy: AUTONOMY.MANUAL, evidence_needed: 'connection string' },
      { id: 's2', action: 'Add `pg` dependency to package.json and write the migration script', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'script reviewed' },
      { id: 's3', action: 'Run schema creation script', autonomy: AUTONOMY.MANUAL, evidence_needed: 'tables exist' },
      { id: 's4', action: 'Dual-write phase: write to both file store and Postgres, read from file', autonomy: AUTONOMY.NOTIFY, evidence_needed: '1 week of dual-write logs' },
      { id: 's5', action: 'Bulk-load existing data from file store to Postgres', autonomy: AUTONOMY.MANUAL, evidence_needed: 'row counts match' },
      { id: 's6', action: 'Switch reads to Postgres, keep file-store writes for safety', autonomy: AUTONOMY.NOTIFY, evidence_needed: '24h of reads stable' },
      { id: 's7', action: 'Cut over fully to Postgres, archive file store', autonomy: AUTONOMY.MANUAL, evidence_needed: 'final read consistency check' },
    ],
  },

  reroute_to_haiku: {
    title: 'Reduce LLM cost by routing simple queries to Haiku',
    autonomy: AUTONOMY.NOTIFY,
    triggered_by: ['inference_cost_share:warn', 'inference_cost_share:fail'],
    estimated_minutes: 30,
    steps: [
      { id: 's1', action: 'Audit the last 1,000 LLM calls and categorise by Sonnet vs Haiku', autonomy: AUTONOMY.AUTO, evidence_needed: 'category report' },
      { id: 's2', action: 'Identify call patterns that Haiku can serve (support replies, simple translation, classification)', autonomy: AUTONOMY.AUTO, evidence_needed: 'pattern list' },
      { id: 's3', action: 'Update costEngine.js routing rules to prefer Haiku for those patterns', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'PR + tests' },
      { id: 's4', action: 'Monitor inference cost share for 7 days', autonomy: AUTONOMY.AUTO, evidence_needed: 'cost trend' },
    ],
  },

  close_config_gates: {
    title: 'Close the non-code production readiness gates',
    autonomy: AUTONOMY.MANUAL,
    triggered_by: ['ready_gate:fail'],
    estimated_minutes: 1440,  // multi-day effort
    steps: [
      { id: 's1', action: 'List incorporation + bank account + GSTIN + IEC + RCMC status', autonomy: AUTONOMY.AUTO, evidence_needed: 'each item documented' },
      { id: 's2', action: 'Engage CA for incorporation + GST + LUT', autonomy: AUTONOMY.MANUAL, evidence_needed: 'CA assignment' },
      { id: 's3', action: 'Engage payments lawyer for MoR float + working-capital + FEMA opinion', autonomy: AUTONOMY.MANUAL, evidence_needed: 'opinion letter' },
      { id: 's4', action: 'Apply Razorpay Route + complete linked-account KYC', autonomy: AUTONOMY.MANUAL, evidence_needed: 'Route enabled in dashboard' },
      { id: 's5', action: 'Designate Grievance + Nodal + DPO officers in policies + on website', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'officer names + emails published' },
      { id: 's6', action: 'Set production env vars; verify /ready returns 200', autonomy: AUTONOMY.NOTIFY, evidence_needed: '/ready 200 in staging' },
    ],
  },

  clear_returns_queue: {
    title: 'Clear returns SLA breaches',
    autonomy: AUTONOMY.NOTIFY,
    triggered_by: ['returns_sla:warn', 'returns_sla:fail'],
    estimated_minutes: 60,
    steps: [
      { id: 's1', action: 'Fetch the breached returns list from /api/returns/breaches', autonomy: AUTONOMY.AUTO, evidence_needed: 'list of return IDs' },
      { id: 's2', action: 'For each: identify stuck stage and contact the right party (seller for approval, carrier for transit, buyer for shipping)', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'contact log per return' },
      { id: 's3', action: 'Transition each return to the next stage or to rejected with clear note', autonomy: AUTONOMY.MANUAL, evidence_needed: 'queue cleared' },
    ],
  },

  refresh_lead_sources: {
    title: 'Refresh sourcing pipeline',
    autonomy: AUTONOMY.NOTIFY,
    triggered_by: ['sourcing_freshness:warn', 'sourcing_freshness:fail'],
    estimated_minutes: 90,
    steps: [
      { id: 's1', action: 'Pick 2 sources from LEAD_SOURCES that the founder hasn\u2019t mined this month', autonomy: AUTONOMY.AUTO, evidence_needed: 'source names' },
      { id: 's2', action: 'Manually browse those sources and add 20+ leads via the Leads page', autonomy: AUTONOMY.MANUAL, evidence_needed: '20 new lead records' },
      { id: 's3', action: 'AI co-founder ranks them and surfaces top 5 for first-touch', autonomy: AUTONOMY.AUTO, evidence_needed: 'ranking output' },
      { id: 's4', action: 'Founder sends first-touch messages from Outreach drafts page', autonomy: AUTONOMY.MANUAL, evidence_needed: 'messages sent' },
    ],
  },

  clear_approvals_queue: {
    title: 'Clear pending HITL approvals',
    autonomy: AUTONOMY.MANUAL,
    triggered_by: ['approvals_age:warn', 'approvals_age:fail'],
    estimated_minutes: 30,
    steps: [
      { id: 's1', action: 'Open Approvals tab in founder console', autonomy: AUTONOMY.MANUAL, evidence_needed: 'queue visible' },
      { id: 's2', action: 'For each item: read the agent\u2019s reasoning + reasons-for-hold', autonomy: AUTONOMY.MANUAL, evidence_needed: 'reasons reviewed' },
      { id: 's3', action: 'Decide approve / reject with note explaining override if any', autonomy: AUTONOMY.MANUAL, evidence_needed: 'decision recorded' },
    ],
  },

  fix_failing_tests: {
    title: 'Fix failing tests immediately',
    autonomy: AUTONOMY.MANUAL,
    triggered_by: ['test_coverage:fail'],
    estimated_minutes: 60,
    steps: [
      { id: 's1', action: 'Identify which suite is red and read the test output', autonomy: AUTONOMY.AUTO, evidence_needed: 'failure log' },
      { id: 's2', action: 'Reproduce locally', autonomy: AUTONOMY.AUTO, evidence_needed: 'local repro' },
      { id: 's3', action: 'Fix the code OR fix the test, with clear commit message explaining which', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'PR + green CI' },
      { id: 's4', action: 'Block all other work until green', autonomy: AUTONOMY.MANUAL, evidence_needed: 'merged' },
    ],
  },

  backup_verification: {
    title: 'Verify store backup is restorable',
    autonomy: AUTONOMY.NOTIFY,
    triggered_by: ['scheduled:weekly'],
    estimated_minutes: 15,
    steps: [
      { id: 's1', action: 'Copy latest store file to a scratch location', autonomy: AUTONOMY.AUTO, evidence_needed: 'copy created' },
      { id: 's2', action: 'Boot a test instance pointing at the scratch copy', autonomy: AUTONOMY.AUTO, evidence_needed: 'instance up' },
      { id: 's3', action: 'Run sanity checks: count records per domain, sample a few entries', autonomy: AUTONOMY.AUTO, evidence_needed: 'counts match production' },
      { id: 's4', action: 'Log result; alert founder if anything fails', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'audit entry' },
    ],
  },

  dependency_audit: {
    title: 'Check for security advisories in dependencies',
    autonomy: AUTONOMY.NOTIFY,
    triggered_by: ['scheduled:weekly'],
    estimated_minutes: 20,
    steps: [
      { id: 's1', action: 'Run `npm audit` and capture the JSON output', autonomy: AUTONOMY.AUTO, evidence_needed: 'audit report' },
      { id: 's2', action: 'For low/moderate advisories: queue for the next routine update window', autonomy: AUTONOMY.AUTO, evidence_needed: 'queue entry' },
      { id: 's3', action: 'For high/critical advisories: alert founder immediately', autonomy: AUTONOMY.NOTIFY, evidence_needed: 'alert sent' },
      { id: 's4', action: 'NEXUS is currently zero-dependency, so this is usually a no-op — verify and move on', autonomy: AUTONOMY.AUTO, evidence_needed: 'confirmation' },
    ],
  },
};

// ════════════════════════════════════════════════════════════
// MAINTENANCE WINDOWS — scheduled jobs
// ════════════════════════════════════════════════════════════

const MAINTENANCE_WINDOWS = {
  weekly_backup_verify: {
    label: 'Weekly backup verification',
    runbook: 'backup_verification',
    frequency_days: 7,
    autonomy: AUTONOMY.NOTIFY,
  },
  weekly_dep_audit: {
    label: 'Weekly dependency audit',
    runbook: 'dependency_audit',
    frequency_days: 7,
    autonomy: AUTONOMY.NOTIFY,
  },
  daily_inference_cost: {
    label: 'Daily inference cost review',
    runbook: 'reroute_to_haiku',
    frequency_days: 1,
    autonomy: AUTONOMY.AUTO,           // just runs the check; only acts if WARN/FAIL
  },
};

// ════════════════════════════════════════════════════════════
// API — run checks, evaluate state, recommend runbooks
// ════════════════════════════════════════════════════════════

/**
 * Run every health check against a state snapshot. Returns the
 * structured result + a recommended action list.
 */
function runHealthChecks(state = {}) {
  const results = {};
  let okCount = 0, warnCount = 0, failCount = 0;
  for (const [key, check] of Object.entries(HEALTH_CHECKS)) {
    const r = check.check(state);
    results[key] = { ...r, domain: check.domain, label: check.label };
    if (r.level === HEALTH_LEVEL.OK) okCount++;
    else if (r.level === HEALTH_LEVEL.WARN) warnCount++;
    else failCount++;
  }
  return {
    summary: { ok: okCount, warn: warnCount, fail: failCount, total: okCount + warnCount + failCount },
    results,
    overallHealth: failCount > 0 ? HEALTH_LEVEL.FAIL
                  : warnCount > 0 ? HEALTH_LEVEL.WARN
                  : HEALTH_LEVEL.OK,
  };
}

/**
 * Given health check results, return the prioritized runbook queue:
 * FAILs first, then WARNs. Each entry includes the runbook content
 * for one-click founder review.
 */
function recommendedRunbooks(healthResults) {
  const queue = [];
  for (const [key, r] of Object.entries(healthResults.results || {})) {
    if (r.level !== HEALTH_LEVEL.OK && r.runbook && RUNBOOKS[r.runbook]) {
      queue.push({
        triggeredBy: key,
        level: r.level,
        evidence: r.evidence,
        runbook: { id: r.runbook, ...RUNBOOKS[r.runbook] },
      });
    }
  }
  // FAIL before WARN
  return queue.sort((a, b) => {
    if (a.level === HEALTH_LEVEL.FAIL && b.level !== HEALTH_LEVEL.FAIL) return -1;
    if (b.level === HEALTH_LEVEL.FAIL && a.level !== HEALTH_LEVEL.FAIL) return 1;
    return 0;
  });
}

/**
 * Find which maintenance windows are due to run now. Each window has a
 * frequency_days and an optional lastRunAt; if (now - lastRunAt) exceeds
 * frequency, it's due.
 */
function dueWindows(state = {}, now = Date.now()) {
  const lastRuns = state.windowLastRuns || {};
  const due = [];
  for (const [key, win] of Object.entries(MAINTENANCE_WINDOWS)) {
    const lastRun = lastRuns[key] || 0;
    const elapsedMs = now - lastRun;
    const intervalMs = win.frequency_days * 86400000;
    if (elapsedMs >= intervalMs) {
      due.push({
        key, label: win.label, runbook: win.runbook,
        autonomy: win.autonomy,
        overdueMs: elapsedMs - intervalMs,
        overdueDays: Math.round((elapsedMs - intervalMs) / 86400000 * 10) / 10,
      });
    }
  }
  return due.sort((a, b) => b.overdueMs - a.overdueMs);
}

/**
 * Record that a maintenance window ran. Returns a new lastRuns object
 * (immutable pattern — caller persists it).
 */
function recordWindowRun(state = {}, windowKey, now = Date.now()) {
  if (!MAINTENANCE_WINDOWS[windowKey]) throw new Error(`Unknown window: ${windowKey}`);
  const lastRuns = state.windowLastRuns || {};
  return {
    ...lastRuns,
    [windowKey]: now,
  };
}

/**
 * Audit-log entry shape for an ops action (check run / runbook step /
 * window completed). Caller persists these into the immutable ledger.
 */
function auditEntry({ action, key, level, evidence, autonomy, by, now = Date.now() }) {
  return Object.freeze({
    id: 'ops_' + crypto.randomBytes(5).toString('hex'),
    at: now,
    action,                            // 'check' | 'runbook_step' | 'window_complete'
    key,                                // health-check id, runbook id, or window id
    level: level || null,
    evidence: evidence || '',
    autonomy: autonomy || AUTONOMY.MANUAL,
    by: by || 'system',                // 'system' (AI co-founder) | 'founder' | seller-id etc.
  });
}

module.exports = {
  HEALTH_LEVEL, AUTONOMY,
  HEALTH_CHECKS, RUNBOOKS, MAINTENANCE_WINDOWS,
  runHealthChecks, recommendedRunbooks, dueWindows, recordWindowRun, auditEntry,
};
