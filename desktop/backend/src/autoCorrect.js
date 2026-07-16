'use strict';

/**
 * autoCorrect.js
 *
 * The closed loop that lets the platform correct itself — WITH THE FOUNDER IN
 * THE LOOP for anything consequential. It sits on top of the self-audit +
 * self-healing agents and adds the missing piece: an approval queue.
 *
 * The principle, which is the whole point of "founder in loop":
 *   • SAFE corrections (retry a webhook, resume a stuck task, clear a transient
 *     error) are applied AUTOMATICALLY — they cannot harm money, identity, or
 *     an invariant, so waiting for a human would only add downtime.
 *   • RISKY corrections (anything touching money, pricing, config, identity,
 *     payouts, or that could affect a maker's livelihood) are NEVER auto-applied.
 *     They are queued with a clear description and wait for the founder's
 *     explicit approval, then applied.
 *   • A correction that would break a hard invariant is REFUSED outright — not
 *     even offered for approval. The founder cannot approve self-harm to the
 *     platform's guarantees.
 *
 * This is auto-correction that is safe by construction: the system fixes what it
 * provably can, and asks before touching anything that matters.
 *
 * Pure + dependency-free (operates on injected diagnosis + a queue object).
 */

// Classify a detected issue by how it may be corrected.
const CLASS = Object.freeze({ SAFE_AUTO: 'safe_auto', NEEDS_APPROVAL: 'needs_approval', FORBIDDEN: 'forbidden' });

// Issue types the loop knows how to handle, and their correction class.
const ISSUE_RULES = Object.freeze({
  webhook_retryable:   { class: CLASS.SAFE_AUTO,      fix: 'retry_webhook',        why: 'Idempotent retry; cannot harm money or state.' },
  task_stuck:          { class: CLASS.SAFE_AUTO,      fix: 'resume_task',          why: 'Resuming a stuck async task is safe and idempotent.' },
  transient_error:     { class: CLASS.SAFE_AUTO,      fix: 'clear_and_retry',      why: 'Transient; safe to retry.' },
  cache_stale:         { class: CLASS.SAFE_AUTO,      fix: 'refresh_cache',        why: 'Recompute from source; no side effects.' },
  payout_mismatch:     { class: CLASS.NEEDS_APPROVAL, fix: 'reconcile_payout',     why: 'Touches a maker\u2019s money \u2014 founder must approve.' },
  pricing_drift:       { class: CLASS.NEEDS_APPROVAL, fix: 'reset_price',          why: 'Changes pricing \u2014 founder must approve.' },
  config_anomaly:      { class: CLASS.NEEDS_APPROVAL, fix: 'restore_config',       why: 'Changes platform config \u2014 founder must approve.' },
  provider_down:       { class: CLASS.NEEDS_APPROVAL, fix: 'failover_provider',    why: 'May affect live transactions \u2014 founder must approve.' },
  invariant_breach:    { class: CLASS.FORBIDDEN,      fix: null,                   why: 'A breach of a hard invariant is halted + escalated; never auto-"fixed" by altering the invariant.' },
});

let _seq = 0;
function _id() { return 'corr_' + (++_seq) + '_' + Date.now().toString(36); }

/**
 * plan — from a diagnosis (list of issues), decide what to auto-apply, what to
 * queue for the founder, and what to refuse.
 * @param diagnosis { issues: [{ type, detail }] }
 */
function plan(diagnosis = {}) {
  const issues = Array.isArray(diagnosis.issues) ? diagnosis.issues : [];
  const auto = [], pending = [], forbidden = [];
  for (const issue of issues) {
    const rule = ISSUE_RULES[issue.type] || { class: CLASS.NEEDS_APPROVAL, fix: 'manual_review', why: 'Unknown issue \u2014 default to founder review.' };
    const entry = { id: _id(), type: issue.type, detail: issue.detail || '', fix: rule.fix, why: rule.why, class: rule.class };
    if (rule.class === CLASS.SAFE_AUTO) auto.push(entry);
    else if (rule.class === CLASS.FORBIDDEN) forbidden.push(entry);
    else pending.push(entry);
  }
  return { auto, pending, forbidden };
}

/**
 * runAutoCorrect — apply the safe fixes now (via injected appliers), QUEUE the
 * risky ones for the founder, and halt/escalate the forbidden ones.
 * @param diagnosis  from selfHealingAgent.diagnose
 * @param appliers   { retry_webhook, resume_task, clear_and_retry, refresh_cache } funcs
 * @param queue      { push(entry) } the founder-approval queue
 */
function runAutoCorrect(diagnosis, appliers = {}, queue = { _q: [], push(e) { this._q.push(e); }, list() { return this._q; } }) {
  const p = plan(diagnosis);
  const applied = [];
  for (const c of p.auto) {
    const fn = appliers[c.fix];
    let result = 'no_applier';
    if (typeof fn === 'function') { try { fn(c); result = 'applied'; } catch (e) { result = 'failed:' + e.message; } }
    applied.push({ ...c, result });
  }
  for (const c of p.pending) queue.push({ ...c, status: 'awaiting_founder_approval', queued_at: Date.now() });
  // forbidden: halted + escalated, never auto-fixed
  return {
    auto_applied: applied,
    pending_approval: p.pending.map((c) => ({ id: c.id, type: c.type, fix: c.fix, why: c.why })),
    forbidden_halted: p.forbidden.map((c) => ({ type: c.type, why: c.why, action: 'halted_and_escalated' })),
    founder_in_loop: p.pending.length > 0 || p.forbidden.length > 0,
    summary: `${applied.length} safe fix(es) auto-applied; ${p.pending.length} awaiting your approval; ${p.forbidden.length} halted as invariant-protecting.`,
  };
}

/**
 * approve — the founder approves (or rejects) a queued correction. Applies it
 * only on approval. A correction that would break an invariant cannot be
 * approved (defence in depth).
 */
function approve(entry, decision, appliers = {}) {
  if (!entry) return { ok: false, reason: 'No correction provided.' };
  if (entry.class === CLASS.FORBIDDEN) return { ok: false, reason: 'This correction is forbidden (would break an invariant) and cannot be approved.' };
  if (decision !== 'approve') return { ok: true, applied: false, status: 'rejected_by_founder', id: entry.id };
  const fn = appliers[entry.fix];
  if (typeof fn !== 'function') return { ok: false, reason: `No applier for ${entry.fix}` };
  try { fn(entry); return { ok: true, applied: true, status: 'applied_after_approval', id: entry.id }; }
  catch (e) { return { ok: false, reason: e.message, id: entry.id }; }
}

module.exports = { CLASS, ISSUE_RULES, plan, runAutoCorrect, approve };
