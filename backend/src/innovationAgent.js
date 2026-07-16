'use strict';

/**
 * innovationAgent.js
 *
 * The improvement half of the loop. Where self-audit checks "are we still
 * correct?" and self-healing asks "did something break?", this agent asks
 * "what should we do better or next?" — it scans the platform's own signals and
 * proposes prioritized opportunities.
 *
 * HONEST BOUNDARY: it SUGGESTS, it does not act. It will not change pricing,
 * launch a vertical, or spend money on its own — those are founder decisions.
 * Autonomous "innovation" that reshapes a business without a human is how an
 * agent does real damage. So every output is a proposal with a rationale and an
 * owner, never an executed change.
 *
 * Inputs are the platform's real signals: feedback insights, per-vertical
 * performance, partner-channel coverage, scheme coverage, idle capacity.
 * Pure + dependency-free.
 */

const KIND = Object.freeze({ FIX: 'fix', GROW: 'grow', NEW: 'new', EXPERIMENT: 'experiment' });

/**
 * propose — turn signals into ranked opportunities.
 * @param {object} signals {
 *   feedbackInsights:[{vertical,severity,signal,action}],
 *   verticalPerformance:{ [v]: { gmv_paise, orders } },
 *   partnersActive:[...], partnersAvailable:[...],
 *   schemesMatched:number,
 *   idle:{ verticalsWithNoSellers:[...] }
 * }
 */
function propose(signals = {}) {
  const ideas = [];

  // 1) FIX — feedback insights that are negative become improvement proposals.
  for (const ins of signals.feedbackInsights || []) {
    if (ins.severity === 'critical' || ins.severity === 'watch') {
      ideas.push({
        kind: KIND.FIX, priority: ins.severity === 'critical' ? 1 : 3,
        title: `Fix ${ins.signal} in ${ins.vertical}`,
        rationale: ins.action || `Feedback flags ${ins.signal} in ${ins.vertical}.`,
        effort: 'low', who: ins.who || 'ai',
      });
    } else if (ins.severity === 'positive') {
      ideas.push({ kind: KIND.GROW, priority: 4, title: `Scale what works in ${ins.vertical}`, rationale: ins.action, effort: 'medium', who: 'founder' });
    }
  }

  // 2) GROW — verticals with traction but few channels → add a partner channel.
  const perf = signals.verticalPerformance || {};
  const active = new Set(signals.partnersActive || []);
  const available = (signals.partnersAvailable || []).filter((p) => !active.has(p));
  const topVertical = Object.entries(perf).sort((a, b) => (b[1].gmv_paise || 0) - (a[1].gmv_paise || 0))[0];
  if (topVertical && available.length) {
    ideas.push({
      kind: KIND.GROW, priority: 2,
      title: `Add a distribution channel for ${topVertical[0]}`,
      rationale: `${topVertical[0]} has the most traction; an unused channel (${available[0]}) could multiply its reach.`,
      effort: 'medium', who: 'founder',
    });
  }

  // 3) NEW — verticals with no sellers yet are latent supply opportunities.
  for (const v of (signals.idle && signals.idle.verticalsWithNoSellers) || []) {
    ideas.push({ kind: KIND.NEW, priority: 3, title: `Seed supply in ${v}`, rationale: `${v} has no active sellers — a sourcing push opens a whole vertical.`, effort: 'high', who: 'founder' });
  }

  // 4) EXPERIMENT — low scheme coverage means makers are leaving govt money unused.
  if ((signals.schemesMatched || 0) < 5) {
    ideas.push({ kind: KIND.EXPERIMENT, priority: 3, title: 'Expand government-scheme matching', rationale: 'Few schemes matched — surfacing more subsidies makes the platform stickier for makers.', effort: 'low', who: 'ai' });
  }

  ideas.sort((a, b) => a.priority - b.priority);
  return {
    opportunities: ideas,
    counts: { total: ideas.length, fix: ideas.filter((i) => i.kind === KIND.FIX).length, grow: ideas.filter((i) => i.kind === KIND.GROW).length, new: ideas.filter((i) => i.kind === KIND.NEW).length },
    headline: ideas.length ? `${ideas.length} opportunity(ies) proposed — all require your sign-off before action.` : 'No new opportunities surfaced; the platform is steady.',
    disclaimer: 'These are proposals only. The agent does not change pricing, launch verticals, or spend — the founder decides.',
  };
}

module.exports = { KIND, propose };
