'use strict';

/**
 * agentAuthority.js
 *
 * One question every serious autonomous system must answer precisely: "what is
 * each agent allowed to touch, and where does the human stay in the loop?"
 * This is the single source of truth for that — a declarative authority matrix
 * covering every agent on the platform, plus a checker that decides whether a
 * given action is permitted.
 *
 * Three scopes per agent:
 *   • read[]        — data the agent may read to do its job.
 *   • autonomous[]  — actions it may take on its own (operational, reversible).
 *   • escalate[]    — actions it may PROPOSE but only a founder may approve.
 * And one hard list shared by ALL agents:
 *   • FORBIDDEN     — actions NO agent may ever take, autonomously or otherwise,
 *                     because they touch a hard invariant. Not "needs approval" —
 *                     genuinely off-limits to the agent layer.
 *
 * The founder-in-the-loop guarantee: anything that moves money, changes
 * identity/verification, alters pricing, or could weaken a safety invariant is
 * EITHER escalate (founder approves) OR forbidden (no one in the agent layer
 * does it). Agents never self-grant. Pure + dependency-free.
 */

// Actions no agent may ever perform — these protect the hard invariants.
const FORBIDDEN = Object.freeze([
  'disable_never_in_loss',
  'bypass_consent_gate',
  'bypass_child_safety_gate',
  'mark_verified_without_registry',     // can't fake KYC
  'move_funds_without_founder',          // no autonomous money movement
  'publish_unsubstantiated_green_claim', // no greenwashing
  'rotate_or_read_secrets',              // agents never touch secrets
  'change_invariant_config',
]);

const AGENTS = Object.freeze({
  self_audit: {
    role: 'Re-checks every business invariant and reports a trust verdict.',
    read: ['invariants', 'slicer', 'kyc_status', 'beckn_validity'],
    autonomous: ['run_audit', 'report_verdict'],   // read-only; safe to run anytime
    escalate: [],
    founder_in_loop: 'Not required — it only observes and reports.',
  },
  self_healing: {
    role: 'Recovers from operational faults; escalates anything risky.',
    read: ['webhook_queue', 'task_states', 'provider_status', 'audit_verdict'],
    autonomous: ['retry_failed_webhooks', 'resume_paused_tasks', 'fallback_nonmoney_provider', 'reaudit'],
    escalate: ['money_provider_down', 'invariant_breach'],  // halts + hands to founder
    founder_in_loop: 'Required for money/identity/invariant faults — those are escalated, never auto-fixed.',
  },
  innovation: {
    role: 'Proposes prioritized opportunities; never executes.',
    read: ['feedback_insights', 'vertical_performance', 'partner_coverage', 'scheme_coverage'],
    autonomous: ['analyze_signals', 'propose_opportunities'],  // proposing is safe
    escalate: ['change_pricing', 'launch_vertical', 'spend_budget', 'start_outreach'],
    founder_in_loop: 'Required for ALL execution — the agent only suggests; the founder decides.',
  },
  founder_advisor: {
    role: 'Composes next-actions and who should do each.',
    read: ['integrations', 'compliance', 'metrics', 'watchdog'],
    autonomous: ['suggest_tasks'],
    escalate: [],
    founder_in_loop: 'Not required — advisory only.',
  },
  presentation: {
    role: 'Presents the platform on demand, tailored to the audience.',
    read: ['platform_facts', 'honest_stage', 'verticals', 'model'],
    autonomous: ['present_to_audience', 'build_deck'],   // read-only; presents, never acts
    escalate: [],
    founder_in_loop: 'Not required — it presents real facts and never invents traction or acts.',
  },
  growth_ops: {
    role: 'Operational agents (sourcing, funnel, scheme checks) via the tool registry.',
    read: ['leads', 'funnel', 'schemes', 'catalog'],
    autonomous: ['search_leads', 'summarize_funnel', 'check_scheme_eligibility'],
    escalate: ['transition_lead', 'transition_product', 'contact_prospect'],  // mutating → approval
    founder_in_loop: 'Required for every mutating action (MANUAL autonomy tier).',
  },
});

/**
 * can — decide whether an agent may take an action, and if so how.
 * @returns { allowed, mode: 'autonomous'|'needs_approval'|'forbidden'|'unknown_agent', reason }
 */
function can(agentKey, action) {
  if (FORBIDDEN.includes(action)) {
    return { allowed: false, mode: 'forbidden', reason: `'${action}' is forbidden to ALL agents — it would touch a hard invariant.` };
  }
  const agent = AGENTS[agentKey];
  if (!agent) return { allowed: false, mode: 'unknown_agent', reason: `No such agent: ${agentKey}` };
  if (agent.autonomous.includes(action)) return { allowed: true, mode: 'autonomous', reason: 'Operational + reversible — agent may act.' };
  if (agent.escalate.includes(action)) return { allowed: false, mode: 'needs_approval', reason: 'Consequential — requires founder approval first.' };
  return { allowed: false, mode: 'unknown_action', reason: `'${action}' is not in ${agentKey}'s scope.` };
}

/**
 * matrix — the full governance view: every agent, its scopes, and the shared
 * forbidden list. This is what the founder reads to know exactly who can do what.
 */
function matrix() {
  return {
    agents: Object.entries(AGENTS).map(([key, a]) => ({ key, ...a })),
    forbidden_for_all: FORBIDDEN,
    principle: 'Anything touching money, identity, pricing, or a safety invariant is escalate (founder approves) or forbidden (no agent does it). Agents never self-grant authority.',
  };
}

module.exports = { FORBIDDEN, AGENTS, can, matrix };
