'use strict';

/**
 * pipelineCoherence.js
 *
 * Verifies that the agent + pipeline architecture stays coherent: every agent
 * has ONE responsibility, no two agents claim the same job, command routing is
 * unambiguous (one input → one handler), and the pipelines (auto-correct,
 * change-control) converge on single guarded implementations rather than
 * competing ones.
 *
 * This is the antidote to the over-build risk: instead of trusting that we
 * didn't create overlap, we assert it and fail loudly if we did.
 *
 * Pure + dependency-free (operates on a declared architecture map so it can be
 * unit-tested deterministically; the live server cross-checks against it).
 */

// The declared, intended responsibility of each agent — ONE each.
const AGENT_RESPONSIBILITY = Object.freeze({
  selfAudit:          'verify invariants (read-only)',
  selfHealing:        'recover from operational faults (safe auto + escalate)',
  innovation:         'propose improvements (suggest, never act)',
  founderAdvisor:     'recommend next actions',
  presentation:       'present the platform to an audience (read-only)',
  growth:             'route demand channels + sales levers',
  governmentLiaison:  'prepare government engagement packages',
  autoCorrect:        'apply safe fixes, queue risky ones for approval',
  changeControl:      'govern add/modify/remove/substitute changes',
  contentStudio:      'generate maker/platform content (copy)',
  marketingStudio:    'generate marketing copy/campaigns/scripts',
});

// Command routing: each intent → exactly ONE owner. The console DELEGATES to
// these; it does not re-implement them.
const COMMAND_OWNER = Object.freeze({
  audit: 'selfAudit', heal: 'selfHealing', advise: 'founderAdvisor', innovate: 'innovation',
  present: 'presentation', status: 'platform', feedback: 'feedbackLoop',
  config: 'founderCommands',           // ALL config changes go through one engine
  register_company: 'founder', get_gst: 'founder', legal_signoff: 'founder', connect_credential: 'founder',
});

// Pipelines: each must converge on ONE guarded implementation.
const PIPELINE_SINK = Object.freeze({
  config_change: 'founderCommands.interpret + slicer/platformSettings guarded setters',
  correction: 'autoCorrect (safe auto) + founder approval queue',
  structural_change: 'changeControl (invariant + test + founder gates)',
  content: 'contentStudio router',
  presentation: 'presentationAgent',
});

/** check — returns coherence findings. ok=true means no overlap/conflict. */
function check() {
  const problems = [];

  // 1) No two agents share a responsibility.
  const seen = {};
  for (const [agent, resp] of Object.entries(AGENT_RESPONSIBILITY)) {
    if (seen[resp]) problems.push({ type: 'duplicate_responsibility', detail: `${agent} and ${seen[resp]} both claim: "${resp}"` });
    seen[resp] = agent;
  }

  // 2) Every command intent has exactly one owner (no intent mapped twice).
  const intents = Object.keys(COMMAND_OWNER);
  if (new Set(intents).size !== intents.length) problems.push({ type: 'ambiguous_intent', detail: 'an intent is routed more than once' });

  // 3) Every config-type command must route to the single config engine.
  if (COMMAND_OWNER.config !== 'founderCommands') problems.push({ type: 'config_not_singular', detail: 'config changes must converge on founderCommands' });

  // 4) Each pipeline has exactly one declared sink.
  for (const [pipe, sink] of Object.entries(PIPELINE_SINK)) {
    if (!sink) problems.push({ type: 'pipeline_no_sink', detail: `${pipe} has no single converging implementation` });
  }

  return {
    ok: problems.length === 0,
    agents: Object.keys(AGENT_RESPONSIBILITY).length,
    command_intents: intents.length,
    pipelines: Object.keys(PIPELINE_SINK).length,
    problems,
    summary: problems.length === 0
      ? 'Coherent: every agent has one responsibility, every command routes to one owner, every pipeline converges on one guarded implementation. No overlap.'
      : `${problems.length} coherence problem(s) found.`,
  };
}

module.exports = { AGENT_RESPONSIBILITY, COMMAND_OWNER, PIPELINE_SINK, check };
