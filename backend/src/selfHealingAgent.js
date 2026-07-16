'use strict';

/**
 * selfHealingAgent.js
 *
 * The recovery half of the autonomous loop: self-audit DETECTS, this agent
 * RECOVERS. It watches for operational faults and applies safe, bounded fixes
 * automatically — so a transient failure doesn't become an outage or a stuck
 * order — while escalating anything it must not touch.
 *
 * THE HARD BOUNDARY (this is the whole point):
 *   The agent NEVER heals by weakening an invariant. It will not relax
 *   never-in-loss to push through a blocked sale, will not skip a consent or
 *   child-safety gate to "unstick" an onboarding, will not fabricate a
 *   verification. An invariant breach triggers a HALT + founder escalation —
 *   not a workaround. A system that "self-heals" by lowering its own safety is
 *   not healing; it is failing quietly. So healing is restricted to:
 *     • retrying failed webhook deliveries,
 *     • resuming or safely failing stuck async tasks,
 *     • falling back to a mock provider when a real one is down (and flagging it),
 *     • re-running the self-audit to confirm recovery.
 *   Everything financial, legal, identity, or invariant-related is ESCALATED.
 *
 * Pure; actuators (webhook queue, task manager) are injected so it's testable.
 */

const HEAL_ACTION = Object.freeze({
  RETRY_WEBHOOKS: 'retry_failed_webhooks',
  RESUME_TASKS: 'resume_stuck_tasks',
  PROVIDER_FALLBACK: 'provider_fallback',
  REAUDIT: 'reaudit',
  ESCALATE: 'escalate_to_founder',
  HALT: 'halt_and_escalate',
});

/**
 * diagnose — inspect platform state, list issues + whether each is auto-healable
 * or must be escalated.
 * @param {object} state {
 *   webhookStats:{dead}, deadLetters:[], stuckTasks:[], providersDown:[],
 *   auditVerdict:{trustworthy}
 * }
 */
function diagnose(state = {}) {
  const issues = [];

  const dead = (state.webhookStats && state.webhookStats.dead) || (state.deadLetters || []).length || 0;
  if (dead > 0) issues.push({ kind: 'dead_webhooks', count: dead, severity: 'warn', auto_healable: true, action: HEAL_ACTION.RETRY_WEBHOOKS });

  const stuck = (state.stuckTasks || []).length;
  if (stuck > 0) issues.push({ kind: 'stuck_tasks', count: stuck, severity: 'warn', auto_healable: true, action: HEAL_ACTION.RESUME_TASKS });

  const down = state.providersDown || [];
  for (const pr of down) {
    // A DOWN PAYMENT/PAYOUT provider is NOT silently mocked — money must escalate.
    const isMoney = pr === 'razorpay' || pr === 'payout' || pr === 'payment';
    issues.push({
      kind: 'provider_down', provider: pr, severity: isMoney ? 'critical' : 'warn',
      auto_healable: !isMoney,
      action: isMoney ? HEAL_ACTION.ESCALATE : HEAL_ACTION.PROVIDER_FALLBACK,
      note: isMoney ? 'A money provider is down — escalated, never silently mocked.' : 'Non-money provider — safe to fall back to mock with a flag.',
    });
  }

  // An invariant breach is the one thing the agent must NOT fix — only halt.
  if (state.auditVerdict && state.auditVerdict.trustworthy === false) {
    issues.push({
      kind: 'invariant_breach', severity: 'critical', auto_healable: false,
      action: HEAL_ACTION.HALT,
      note: 'A business invariant is broken. The agent HALTS the affected path and escalates — it will NOT self-heal by weakening a safety rule.',
    });
  }

  return {
    healthy: issues.length === 0,
    auto_healable: issues.filter((i) => i.auto_healable),
    escalations: issues.filter((i) => !i.auto_healable),
    issues,
  };
}

/**
 * heal — apply safe recovery for the auto-healable issues, using injected
 * actuators. Returns an action log. Escalations are returned, never acted on.
 */
async function heal(diagnosis, actuators = {}) {
  const log = [];
  for (const issue of diagnosis.auto_healable) {
    if (issue.action === HEAL_ACTION.RETRY_WEBHOOKS && actuators.retryWebhooks) {
      const r = await actuators.retryWebhooks();
      log.push({ action: issue.action, result: r, ok: true });
    } else if (issue.action === HEAL_ACTION.RESUME_TASKS && actuators.resumeTasks) {
      const r = await actuators.resumeTasks();
      log.push({ action: issue.action, result: r, ok: true });
    } else if (issue.action === HEAL_ACTION.PROVIDER_FALLBACK && actuators.fallbackProvider) {
      const r = actuators.fallbackProvider(issue.provider);
      log.push({ action: issue.action, provider: issue.provider, result: r, ok: true, flagged: true });
    } else {
      log.push({ action: issue.action, ok: false, note: 'no actuator wired' });
    }
  }
  // After healing, re-audit if possible to confirm recovery.
  let postAudit = null;
  if (actuators.reaudit) { postAudit = actuators.reaudit(); log.push({ action: HEAL_ACTION.REAUDIT, ok: true, trustworthy: postAudit.trustworthy }); }

  return {
    healed: log.filter((l) => l.ok).length,
    escalated: diagnosis.escalations.map((e) => ({ kind: e.kind, note: e.note, who: 'founder' })),
    log,
    post_audit: postAudit,
    summary: `${log.filter((l) => l.ok).length} issue(s) auto-healed, ${diagnosis.escalations.length} escalated to the founder.`,
  };
}

module.exports = { HEAL_ACTION, diagnose, heal };
