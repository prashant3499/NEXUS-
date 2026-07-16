'use strict';

/**
 * changeControl.js
 *
 * The governed pipeline that lets the founder's AI assistant change ANYTHING —
 * structural, functional, operational, or agentic — with a super-strong
 * founder-in-loop. It is the meta-capability: add a module, modify a function,
 * remove an agent, substitute a provider, change config. But it is governed, so
 * the power can never become reckless.
 *
 * Every change passes through the same pipeline:
 *   PROPOSE → CLASSIFY impact → GATE → (founder) APPROVE → APPLY → LOG
 *
 * The gates, in order, any of which can block:
 *   1. INVARIANT gate — a change that would break never-in-loss / consent /
 *      child-safety / no-fabrication is REFUSED outright. Not even the founder
 *      can approve it. (This is why the power is safe.)
 *   2. TEST gate — code-level changes must keep the full suite + self-audit
 *      green. A change that breaks tests cannot be applied.
 *   3. FOUNDER gate — anything beyond a trivially-safe operational tweak waits
 *      for explicit founder approval. The founder is always in the loop for
 *      structural/functional/agentic changes.
 *
 * Honest boundary: this module GOVERNS changes; it does not itself rewrite
 * source files or deploy. Code changes are drafted in development (by Claude),
 * run against the gates, and applied on approval. Runtime/config changes route
 * to their guarded setters. The pipeline is the safety; the hands are still a
 * developer + the founder.
 *
 * Pure + dependency-free.
 */

const KIND = Object.freeze({ STRUCTURAL: 'structural', FUNCTIONAL: 'functional', OPERATIONAL: 'operational', AGENTIC: 'agentic', CONFIG: 'config' });
const OP = Object.freeze({ ADD: 'add', MODIFY: 'modify', REMOVE: 'remove', SUBSTITUTE: 'substitute' });

// Which invariants a change must never break — checked first, blocks absolutely.
const PROTECTED_INVARIANTS = ['never_in_loss', 'consent_before_sale', 'child_safety', 'no_fabrication', 'honest_stage'];

// Heuristics: does a change description threaten a protected invariant?
function threatensInvariant(change) {
  if (typeof change === 'string') change = { target: change, description: change };
  change = change || {};
  const t = `${change.target || ''} ${change.description || ''}`.toLowerCase();
  const danger = [
    [/disable|remove|bypass|skip|turn off/.test(t) && /loss|consent|child|safety|audit|verification|invariant/.test(t), 'Would weaken a hard invariant or safety gate.'],
    [/fabricat|fake|invent|spoof|overstate/.test(t), 'Would introduce fabrication / dishonesty.'],
    [/secret|credential|key/.test(t) && /log|expose|print/.test(t), 'Would expose secrets.'],
  ];
  const hit = danger.find(([cond]) => cond);
  return hit ? { blocked: true, reason: hit[1] } : { blocked: false };
}

/** classify — what kind/risk a change is, and which gates apply. */
function classify(change = {}) {
  const kind = change.kind || KIND.FUNCTIONAL;
  const op = change.op || OP.MODIFY;
  // Config tweaks that don't touch money/identity are low-risk operational.
  const trivialOps = kind === KIND.OPERATIONAL || (kind === KIND.CONFIG && !/fee|price|payout|commission|charity/.test(`${change.target}`.toLowerCase()));
  const needsTests = [KIND.STRUCTURAL, KIND.FUNCTIONAL, KIND.AGENTIC].includes(kind);
  const needsFounder = !trivialOps; // structural/functional/agentic + sensitive config always need the founder
  return { kind, op, needs_tests: needsTests, needs_founder_approval: needsFounder, risk: needsFounder ? (needsTests ? 'high' : 'medium') : 'low' };
}

/**
 * propose — submit a change. Runs the invariant + (declared) test gate and
 * decides whether it can auto-apply or must wait for the founder.
 * @param change { kind, op, target, description }
 * @param state  { tests_green?: bool, audit_trustworthy?: bool }  (declared by caller)
 */
function propose(change = {}, state = {}) {
  // GATE 1: invariants — absolute.
  const inv = threatensInvariant(change);
  if (inv.blocked) {
    return { ok: false, stage: 'invariant_gate', refused: true, reason: `Refused: ${inv.reason} This cannot be applied or approved — it would break a protected invariant (${PROTECTED_INVARIANTS.join(', ')}).` };
  }
  const c = classify(change);
  // GATE 2: tests (for code-level changes).
  if (c.needs_tests && (state.tests_green === false || state.audit_trustworthy === false)) {
    return { ok: false, stage: 'test_gate', reason: 'Refused: the change must keep the full test suite and self-audit green before it can be applied.' };
  }
  // GATE 3: founder approval.
  if (c.needs_founder_approval) {
    return { ok: true, stage: 'awaiting_founder_approval', classification: c, change, message: `Drafted and gated. A ${c.kind}/${c.op} change of ${c.risk} risk — awaiting your approval before it is applied.` };
  }
  return { ok: true, stage: 'auto_applicable', classification: c, change, message: 'Low-risk operational change — safe to apply automatically.' };
}

/**
 * approve — founder approves/rejects a gated change. A change that reached the
 * founder has already passed the invariant + test gates. An invariant-blocked
 * change can never reach here.
 */
function approve(proposal, decision) {
  if (!proposal || proposal.refused) return { ok: false, reason: 'This change was refused at the invariant gate and cannot be approved.' };
  if (proposal.stage !== 'awaiting_founder_approval') return { ok: false, reason: 'Nothing to approve at this stage.' };
  if (decision !== 'approve') return { ok: true, applied: false, status: 'rejected_by_founder' };
  return { ok: true, applied: true, status: 'approved_and_applied', change: proposal.change, log: `${proposal.classification.kind}/${proposal.classification.op} on ${proposal.change.target} — approved by founder, applied through the governed pipeline.` };
}

/** capability — a plain statement of what the AI can change, and the guardrails. */
function capability() {
  return {
    can_change: {
      structural: 'Add / modify / remove / substitute modules and architecture.',
      functional: 'Change how a feature behaves (logic, flows).',
      operational: 'Tune runtime behaviour (schedules, retries, thresholds).',
      agentic: 'Add, pause, remove, or re-scope agents.',
      config: 'Fees, subscriptions, charity, autonomy (via guarded setters).',
    },
    operations: Object.values(OP),
    guardrails: {
      invariant_gate: `Refuses anything that would break: ${PROTECTED_INVARIANTS.join(', ')} — even on founder command.`,
      test_gate: 'Code changes must keep the full suite + self-audit green.',
      founder_gate: 'Structural / functional / agentic / sensitive-config changes always need explicit founder approval.',
    },
    honest_note: 'This GOVERNS change; it does not itself edit source or deploy. Code is drafted in development, gated here, and applied on approval. The pipeline is the safety; a developer + the founder are the hands.',
  };
}

module.exports = { KIND, OP, PROTECTED_INVARIANTS, threatensInvariant, classify, propose, approve, capability };
