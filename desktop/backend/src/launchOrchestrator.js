'use strict';

/**
 * launchOrchestrator.js
 *
 * The AI co-founder's chief-of-staff brain. A solo founder needs one place
 * that knows EVERYTHING required to launch and operate — and, critically,
 * who can do each thing: the AI can prepare some of it (policy drafts, setup
 * runbooks, document templates), some needs a credential the founder obtains
 * (API keys, KYC), and some is a founder decision (pricing, go-live approval).
 *
 * The orchestrator never acts unilaterally on anything consequential. It
 * classifies every task by OWNER and keeps the founder in the loop:
 *   - ai_prepare    → the AI drafts it; founder reviews + approves
 *   - founder_input → only the founder can supply it (a credential, a KYC doc)
 *   - founder_decide→ a judgment call only the founder makes (price, go-live)
 *
 * It reads real signals (config, policy readiness, deploy readiness, open
 * product work) so the board reflects reality, then produces:
 *   - a categorized task board with status
 *   - the prioritized next actions, split into "AI will prepare for approval"
 *     vs "needs you"
 *   - a launch-readiness percentage + the critical path
 *
 * "Done" is only ever set by founder approval for ai_prepare tasks, or by a
 * real signal flipping (e.g. AUTH_SECRET present) for the others. The AI marks
 * things "prepared, awaiting your approval" — not done.
 */

const OWNER = Object.freeze({
  AI_PREPARE: 'ai_prepare',       // AI drafts; founder approves
  FOUNDER_INPUT: 'founder_input', // credential / document only founder can get
  FOUNDER_DECIDE: 'founder_decide', // judgment call
});

const TASK_STATUS = Object.freeze({
  DONE: 'done',
  PREPARED: 'prepared',           // AI prepared a draft; awaiting founder approval
  BLOCKED: 'blocked',             // waiting on a dependency
  TODO: 'todo',
});

const CATEGORY = Object.freeze({
  LEGAL: 'legal',
  COMPLIANCE: 'compliance',
  CREDENTIALS: 'credentials',
  INFRA: 'infrastructure',
  PRODUCT: 'product',
  GOLIVE: 'go_live',
});

/**
 * Canonical registry of everything needed to launch + operate NEXUS.
 * `check(ctx)` returns true when the task is satisfied by a real signal.
 * `severity`: 'blocker' (can't launch without it) or 'recommended'.
 */
const LAUNCH_TASKS = [
  // ── Legal & policy (AI can prepare drafts; founder + lawyer approve) ──
  { id: 'terms_of_service', title: 'Terms of Service', category: CATEGORY.LEGAL, owner: OWNER.AI_PREPARE, severity: 'blocker',
    policy: 'terms', note: 'AI drafts from the platform model (MoR, status-aware); founder + lawyer review.' },
  { id: 'privacy_policy', title: 'Privacy Policy (DPDP Act 2023)', category: CATEGORY.LEGAL, owner: OWNER.AI_PREPARE, severity: 'blocker',
    policy: 'privacy', note: 'AI drafts a DPDP-aligned policy; founder supplies DPO details + legal review.' },
  { id: 'return_policy', title: 'Return & Refund Policy', category: CATEGORY.LEGAL, owner: OWNER.AI_PREPARE, severity: 'blocker',
    policy: 'returns', note: 'AI drafts; founder confirms windows + conditions.' },
  { id: 'grievance_policy', title: 'Grievance Redressal Policy', category: CATEGORY.LEGAL, owner: OWNER.AI_PREPARE, severity: 'blocker',
    policy: 'grievance', note: 'Required under Consumer Protection (E-Commerce) Rules; AI drafts, founder names the officer.' },

  // ── Compliance (founder obtains; AI prepares the how-to runbook) ──
  { id: 'gstin', title: 'GSTIN registration', category: CATEGORY.COMPLIANCE, owner: OWNER.FOUNDER_INPUT, severity: 'blocker',
    note: 'Platform GST registration — required to remit TCS (Section 52) the platform collects.' },
  { id: 'iec_code', title: 'Importer-Exporter Code (IEC)', category: CATEGORY.COMPLIANCE, owner: OWNER.FOUNDER_INPUT, severity: 'recommended',
    note: 'Needed only once export (EXIM) modality goes live.' },
  { id: 'ad_code', title: 'AD Code + LUT (export banking)', category: CATEGORY.COMPLIANCE, owner: OWNER.FOUNDER_INPUT, severity: 'recommended',
    note: 'Bank AD code + Letter of Undertaking for zero-rated exports.' },

  // ── Credentials (founder obtains keys; AI prepares the setup steps) ──
  { id: 'auth_secret', title: 'Production AUTH_SECRET', category: CATEGORY.CREDENTIALS, owner: OWNER.FOUNDER_INPUT, severity: 'blocker',
    check: (c) => c.authSecretSet === true, note: 'A strong random secret for session signing (not the dev default).' },
  { id: 'razorpay_keys', title: 'Razorpay live keys + Route KYC', category: CATEGORY.CREDENTIALS, owner: OWNER.FOUNDER_INPUT, severity: 'blocker',
    check: (c) => c.paymentsLive === true, note: 'Live keys + Route account so settlements split directly to makers (platform never holds float).' },
  { id: 'anthropic_key', title: 'Anthropic API key', category: CATEGORY.CREDENTIALS, owner: OWNER.FOUNDER_INPUT, severity: 'blocker',
    check: (c) => c.anthropicKeySet === true, note: 'Powers AI listings, ad copy, the co-founder chat.' },
  { id: 'maps_key', title: 'Google Maps API key', category: CATEGORY.CREDENTIALS, owner: OWNER.FOUNDER_INPUT, severity: 'recommended',
    check: (c) => c.mapsLive === true, note: 'Upgrades tourism + supply maps from coordinates to rendered tiles (degrades gracefully without).' },

  // ── Infrastructure (AI prepares the runbook; founder provisions) ──
  { id: 'https', title: 'HTTPS / TLS + domain', category: CATEGORY.INFRA, owner: OWNER.FOUNDER_INPUT, severity: 'blocker',
    note: 'TLS termination + a domain. AI provides the deploy runbook.' },
  { id: 'monitoring', title: 'Monitoring + backups', category: CATEGORY.INFRA, owner: OWNER.AI_PREPARE, severity: 'recommended',
    check: (c) => c.monitoringSet === true, note: 'Error tracking, uptime checks, automated DATA_DIR backups. AI prepares config.' },

  // ── Product (open build work; AI can build with founder review) ──
  { id: 'minor_guardian', title: 'Minor / guardian handling', category: CATEGORY.PRODUCT, owner: OWNER.AI_PREPARE, severity: 'blocker',
    check: (c) => c.minorGuardianBuilt === true, note: 'Guardian-MoR for minors + block unaccompanied minors — required by the legal core (child safety).' },

  // ── Go-live (founder decision; never automatic) ──
  { id: 'golive_approval', title: 'Go-live approval', category: CATEGORY.GOLIVE, owner: OWNER.FOUNDER_DECIDE, severity: 'blocker',
    note: 'Founder reviews the readiness assessment and gives the final go. The AI never launches on its own.' },
];

/**
 * Resolve each task's status from real signals + the founder's approval log.
 * @param {object} ctx — real signals (authSecretSet, paymentsLive, …)
 * @param {object} approvals — { taskId: { status: 'done'|'prepared', at, by } }
 */
function _resolveStatus(task, ctx, approvals) {
  const ap = approvals[task.id];
  // A real signal check wins (objective truth) over the approval log.
  if (typeof task.check === 'function') {
    if (task.check(ctx)) return TASK_STATUS.DONE;
  }
  // For policy/ai_prepare tasks, status comes from the approval log:
  if (ap && ap.status === 'done') return TASK_STATUS.DONE;
  if (ap && ap.status === 'prepared') return TASK_STATUS.PREPARED;
  // Policy tasks: if the founder hasn't supplied required fields, they're todo.
  return TASK_STATUS.TODO;
}

/**
 * assessLaunch — the full launch board.
 * @returns { readiness_pct, blockers_remaining, board (by category), counts }
 */
function assessLaunch(ctx = {}, approvals = {}) {
  const board = {};
  let blockersTotal = 0, blockersDone = 0;
  const counts = { done: 0, prepared: 0, blocked: 0, todo: 0 };

  for (const task of LAUNCH_TASKS) {
    const status = _resolveStatus(task, ctx, approvals);
    counts[status] = (counts[status] || 0) + 1;
    if (task.severity === 'blocker') {
      blockersTotal++;
      if (status === TASK_STATUS.DONE) blockersDone++;
    }
    if (!board[task.category]) board[task.category] = [];
    board[task.category].push({
      id: task.id, title: task.title, owner: task.owner, severity: task.severity,
      status, note: task.note,
    });
  }

  const readinessPct = blockersTotal > 0 ? Math.round((blockersDone / blockersTotal) * 100) : 100;
  return {
    readiness_pct: readinessPct,
    can_launch: blockersDone === blockersTotal,
    blockers_total: blockersTotal,
    blockers_remaining: blockersTotal - blockersDone,
    counts,
    board,
    generated_at: (ctx.now || Date.now)(),
  };
}

/**
 * nextActions — the prioritized worklist, split by who must act.
 * Blockers first, then recommended. "AI will prepare" items are the ones the
 * founder can delegate right now; "needs you" items require the founder.
 */
function nextActions(ctx = {}, approvals = {}) {
  const aiCanPrepare = [];
  const needsFounder = [];

  for (const task of LAUNCH_TASKS) {
    const status = _resolveStatus(task, ctx, approvals);
    if (status === TASK_STATUS.DONE) continue;
    const item = { id: task.id, title: task.title, severity: task.severity, status, note: task.note };
    if (task.owner === OWNER.AI_PREPARE && status !== TASK_STATUS.PREPARED) {
      aiCanPrepare.push(item);
    } else if (status === TASK_STATUS.PREPARED) {
      // Prepared by AI → now needs founder approval
      needsFounder.push({ ...item, action: 'review_and_approve' });
    } else {
      needsFounder.push({ ...item, action: task.owner === OWNER.FOUNDER_DECIDE ? 'decide' : 'provide' });
    }
  }

  const bySeverity = (a, b) => (a.severity === 'blocker' ? 0 : 1) - (b.severity === 'blocker' ? 0 : 1);
  aiCanPrepare.sort(bySeverity);
  needsFounder.sort(bySeverity);

  return {
    ai_can_prepare: aiCanPrepare,
    needs_founder: needsFounder,
    summary: `${aiCanPrepare.length} task${aiCanPrepare.length === 1 ? '' : 's'} the AI can prepare now; ${needsFounder.length} need you.`,
  };
}

/** Look up a task by id (for the prepare/approve endpoints). */
function getTask(taskId) {
  return LAUNCH_TASKS.find((t) => t.id === taskId) || null;
}

module.exports = {
  OWNER,
  TASK_STATUS,
  CATEGORY,
  LAUNCH_TASKS,
  assessLaunch,
  nextActions,
  getTask,
};
