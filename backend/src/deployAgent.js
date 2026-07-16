'use strict';

/**
 * deployAgent.js
 *
 * The release-readiness + operational-runtime layer. This is what makes
 * "ready to operate as a real business" concrete and checkable, rather than
 * a claim. It does NOT actually push to a cloud — no network, no real
 * credentials in this environment. What it DOES is enforce that a deploy is
 * only permitted when a hard checklist of preconditions passes, and it
 * surfaces the exact blockers when they don't. A real CD pipeline calls
 * assessReleaseReadiness() as its gate.
 *
 * Philosophy mirrors the rest of NEXUS:
 *   - Founder / Human-in-the-loop: a deploy is NEVER auto-executed. The
 *     agent assesses, recommends, and waits for explicit founder approval.
 *   - Never in loss: the agent refuses to green-light a release that would
 *     remove the profit guard or ship with the platform in net loss.
 *   - Fail safe: any blocker at CRITICAL severity vetoes the deploy.
 *
 * Two roles:
 *   1. DEPLOY AGENT — pre-release gate. Is the build safe to ship?
 *   2. MAINTENANCE AGENT — post-release runtime. Is the running system
 *      healthy, and what scheduled maintenance is due?
 */

const operations = require('./operations');

// ════════════════════════════════════════════════════════════
// SEVERITY + VERDICTS
// ════════════════════════════════════════════════════════════

const SEVERITY = Object.freeze({
  CRITICAL: 'critical',  // vetoes deploy
  WARN: 'warn',          // deploy allowed but flagged
  OK: 'ok',
});

const RELEASE_VERDICT = Object.freeze({
  GO: 'go',                    // all critical checks pass
  GO_WITH_WARNINGS: 'go_with_warnings',
  NO_GO: 'no_go',              // at least one critical blocker
});

// ════════════════════════════════════════════════════════════
// RELEASE-READINESS CHECKLIST
// ════════════════════════════════════════════════════════════

/**
 * Each check is a pure function of the supplied release context. It returns
 * { id, label, severity, level, evidence, remediation }.
 *
 * The context is assembled by the caller (server) and contains:
 *   {
 *     tests: { total, passed, failed, suites },
 *     auth: { enabled, mutatingRoutesProtected },
 *     profitGuard: { aiBoundary, orderBoundary, platformInLoss },
 *     payments: { provider, routeConfigured, kycComplete },
 *     env: { name, hasAnthropicKey, hasRazorpayKey, dataDir, httpsTerminated },
 *     compliance: { gstin, iec, adCode, lut, privacyPolicy, grievanceOfficer },
 *     monitoring: { errorTracking, uptimeChecks, backups },
 *   }
 */
const RELEASE_CHECKS = [
  {
    id: 'tests_green',
    label: 'All automated tests pass',
    severity: SEVERITY.CRITICAL,
    run: (ctx) => {
      const t = ctx.tests || {};
      const ok = t.failed === 0 && t.total > 0;
      return {
        level: ok ? SEVERITY.OK : SEVERITY.CRITICAL,
        evidence: `${t.passed || 0}/${t.total || 0} passing across ${t.suites || 0} suites, ${t.failed || 0} failing`,
        remediation: ok ? null : 'Fix failing tests before shipping. A red suite is a veto.',
      };
    },
  },
  {
    id: 'auth_enabled',
    label: 'Authentication protects mutating routes',
    severity: SEVERITY.CRITICAL,
    run: (ctx) => {
      const a = ctx.auth || {};
      const ok = a.enabled && a.mutatingRoutesProtected;
      return {
        level: ok ? SEVERITY.OK : SEVERITY.CRITICAL,
        evidence: a.enabled
          ? (a.mutatingRoutesProtected ? 'Auth on; mutating routes protected' : 'Auth on but some mutating routes are open')
          : 'auth=none — every POST is unauthenticated',
        remediation: ok ? null : 'Ship session auth (phone OTP + signed session token). Without it anyone can approve sellers or transition orders.',
      };
    },
  },
  {
    id: 'profit_guard_intact',
    label: 'Never-in-loss profit guard active at both boundaries',
    severity: SEVERITY.CRITICAL,
    run: (ctx) => {
      const p = ctx.profitGuard || {};
      const ok = p.aiBoundary && p.orderBoundary && !p.platformInLoss;
      let evidence;
      if (p.platformInLoss) evidence = 'Platform is currently in NET LOSS — refusing to ship';
      else if (!p.aiBoundary || !p.orderBoundary) evidence = `Guard missing at ${!p.aiBoundary ? 'AI tool' : 'order'} boundary`;
      else evidence = 'Guard enforced at AI-tool + order boundaries; platform profitable';
      return {
        level: ok ? SEVERITY.OK : SEVERITY.CRITICAL,
        evidence,
        remediation: ok ? null : 'The core invariant is "platform never in loss". Restore the guard or fix the loss before shipping.',
      };
    },
  },
  {
    id: 'payments_settlement',
    label: 'Payment split-settlement is real (not mock)',
    severity: SEVERITY.CRITICAL,
    run: (ctx) => {
      const pay = ctx.payments || {};
      const ok = pay.provider !== 'mock' && pay.routeConfigured && pay.kycComplete;
      return {
        level: ok ? SEVERITY.OK : SEVERITY.CRITICAL,
        evidence: pay.provider === 'mock'
          ? 'Payments are MOCK — no real money moves'
          : `Provider ${pay.provider}; Route ${pay.routeConfigured ? 'configured' : 'NOT configured'}; KYC ${pay.kycComplete ? 'done' : 'incomplete'}`,
        remediation: ok ? null : 'Integrate Razorpay Route with linked accounts + complete platform KYC before taking real orders.',
      };
    },
  },
  {
    id: 'secrets_present',
    label: 'Required API keys + HTTPS present',
    severity: SEVERITY.CRITICAL,
    run: (ctx) => {
      const e = ctx.env || {};
      const ok = e.hasAnthropicKey && e.httpsTerminated;
      const missing = [];
      if (!e.hasAnthropicKey) missing.push('ANTHROPIC_API_KEY');
      if (!e.httpsTerminated) missing.push('HTTPS/TLS');
      return {
        level: ok ? SEVERITY.OK : SEVERITY.CRITICAL,
        evidence: ok ? `env=${e.name}, keys present, TLS terminated` : `Missing: ${missing.join(', ')}`,
        remediation: ok ? null : 'Set production secrets and terminate TLS at the load balancer.',
      };
    },
  },
  {
    id: 'compliance_pack',
    label: 'Legal + compliance pack in place',
    severity: SEVERITY.WARN,
    run: (ctx) => {
      const c = ctx.compliance || {};
      const have = ['gstin', 'iec', 'adCode', 'lut', 'privacyPolicy', 'grievanceOfficer'].filter(k => c[k]);
      const ok = have.length >= 4;  // can launch D2C-domestic with a subset; export needs all
      return {
        level: ok ? (have.length === 6 ? SEVERITY.OK : SEVERITY.WARN) : SEVERITY.CRITICAL,
        evidence: `${have.length}/6 compliance items present (${have.join(', ') || 'none'})`,
        remediation: have.length === 6 ? null : 'GSTIN + privacy policy + grievance officer are minimum for domestic; add IEC + AD code + LUT before export orders.',
      };
    },
  },
  {
    id: 'monitoring',
    label: 'Error tracking, uptime checks, backups',
    severity: SEVERITY.WARN,
    run: (ctx) => {
      const m = ctx.monitoring || {};
      const have = ['errorTracking', 'uptimeChecks', 'backups'].filter(k => m[k]);
      const ok = have.length === 3;
      return {
        level: ok ? SEVERITY.OK : SEVERITY.WARN,
        evidence: `${have.length}/3 in place (${have.join(', ') || 'none'})`,
        remediation: ok ? null : 'Wire Sentry (errors), an uptime ping, and automated daily backups of DATA_DIR.',
      };
    },
  },
];

/**
 * assessReleaseReadiness — the deploy gate.
 *
 * @param {object} ctx — release context (see RELEASE_CHECKS docblock)
 * @returns {object} {
 *   verdict, can_deploy, summary, critical_blockers, warnings, checks, assessed_at
 * }
 *
 * The agent never deploys on its own — can_deploy is advisory. The server
 * still requires explicit founder approval to actually flip the switch.
 */
function assessReleaseReadiness(ctx = {}, opts = {}) {
  const now = (opts.now || Date.now)();
  const checks = RELEASE_CHECKS.map((chk) => {
    const result = chk.run(ctx);
    return {
      id: chk.id,
      label: chk.label,
      declared_severity: chk.severity,
      level: result.level,
      evidence: result.evidence,
      remediation: result.remediation,
    };
  });

  const criticalBlockers = checks.filter(c => c.level === SEVERITY.CRITICAL);
  const warnings = checks.filter(c => c.level === SEVERITY.WARN);

  let verdict;
  if (criticalBlockers.length > 0) verdict = RELEASE_VERDICT.NO_GO;
  else if (warnings.length > 0) verdict = RELEASE_VERDICT.GO_WITH_WARNINGS;
  else verdict = RELEASE_VERDICT.GO;

  const summary = verdict === RELEASE_VERDICT.NO_GO
    ? `NO-GO — ${criticalBlockers.length} critical blocker(s) must be resolved`
    : verdict === RELEASE_VERDICT.GO_WITH_WARNINGS
      ? `GO with ${warnings.length} warning(s) — founder approval required`
      : 'GO — all checks pass; founder approval required';

  return {
    verdict,
    can_deploy: verdict !== RELEASE_VERDICT.NO_GO,
    requires_founder_approval: true,   // ALWAYS — human in the loop
    summary,
    critical_blockers: criticalBlockers.map(c => ({ id: c.id, label: c.label, evidence: c.evidence, remediation: c.remediation })),
    warnings: warnings.map(c => ({ id: c.id, label: c.label, evidence: c.evidence, remediation: c.remediation })),
    checks,
    assessed_at: now,
  };
}

/**
 * planDeploy — produces an ordered, auditable deploy plan. Each step has an
 * autonomy tier; CRITICAL steps require founder confirmation. This is what a
 * real CD runner would execute step-by-step, pausing at MANUAL gates.
 */
function planDeploy(ctx = {}) {
  const readiness = assessReleaseReadiness(ctx);
  const steps = [
    { id: 'gate', label: 'Release-readiness gate', autonomy: operations.AUTONOMY.MANUAL, detail: 'Founder reviews readiness assessment and approves' },
    { id: 'backup', label: 'Snapshot current data + config', autonomy: operations.AUTONOMY.AUTO, detail: 'Backup DATA_DIR before any change' },
    { id: 'migrate', label: 'Run forward-only data migrations', autonomy: operations.AUTONOMY.NOTIFY, detail: 'Apply schema changes; notify founder of each' },
    { id: 'deploy', label: 'Roll out new build (blue/green)', autonomy: operations.AUTONOMY.MANUAL, detail: 'Deploy to green, smoke-test, then cut over' },
    { id: 'smoke', label: 'Post-deploy smoke tests', autonomy: operations.AUTONOMY.AUTO, detail: 'Hit /ready, place a test order, verify slicer + profit guard' },
    { id: 'watch', label: 'Watch error rate for 30 min', autonomy: operations.AUTONOMY.NOTIFY, detail: 'Auto-rollback if error rate spikes' },
  ];
  return {
    can_proceed: readiness.can_deploy,
    blocked_reason: readiness.can_deploy ? null : readiness.summary,
    readiness,
    steps,
    rollback_plan: 'Cut traffic back to blue; restore DATA_DIR snapshot if migrations ran.',
  };
}

// ════════════════════════════════════════════════════════════
// MAINTENANCE AGENT — post-release runtime
// ════════════════════════════════════════════════════════════

/**
 * runMaintenanceCycle — the recurring operational heartbeat. Wraps the
 * existing operations.runHealthChecks + dueWindows and adds deploy-aware
 * recommendations. A cron calls this; AUTO actions self-heal, NOTIFY/MANUAL
 * actions surface to the founder.
 *
 * @param {object} ctx — { state, now, lastWindowRuns }
 * @returns {object} {
 *   health, due_windows, recommended_runbooks, auto_actions, founder_actions, ran_at
 * }
 */
function runMaintenanceCycle(ctx = {}) {
  const now = typeof ctx.now === 'number' ? ctx.now : Date.now();

  const health = operations.runHealthChecks();
  const due = operations.dueWindows(ctx.lastWindowRuns || {});
  const runbooks = operations.recommendedRunbooks(health);

  // health.results is an object keyed by check id → { healthy, level, ... }
  const resultList = Object.values(health.results || {});

  // Split recommended runbooks by autonomy tier
  const autoActions = [];
  const founderActions = [];
  for (const rb of runbooks) {
    if (rb.autonomy === operations.AUTONOMY.AUTO) autoActions.push(rb);
    else founderActions.push(rb);
  }

  // If health is critical anywhere, the maintenance agent escalates
  const criticalChecks = resultList.filter(r => r.level === operations.HEALTH_LEVEL.CRITICAL);
  const escalate = criticalChecks.length > 0;

  return {
    overall_health: health.overallHealth,
    health_summary: health.summary,
    critical_count: criticalChecks.length,
    escalate_to_founder: escalate,
    due_windows: due,
    recommended_runbooks: runbooks,
    auto_actions: autoActions,
    founder_actions: founderActions,
    ran_at: now,
  };
}

module.exports = {
  SEVERITY,
  RELEASE_VERDICT,
  RELEASE_CHECKS,
  assessReleaseReadiness,
  planDeploy,
  runMaintenanceCycle,
};
