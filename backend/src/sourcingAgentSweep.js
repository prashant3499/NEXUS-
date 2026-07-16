'use strict';

/**
 * sourcingAgentSweep.js
 *
 * The scheduled leg of the sourcing agent: on a daily cadence the scheduler
 * pulls a fresh batch of auto-sourced candidates (autoSource — grounded in
 * the GI registry + real enumeration channels) into the prospect pipeline
 * (prospectDb — deduped, stage=sourced).
 *
 * Founder-in-the-loop by construction:
 *   - Runs ONLY while the engine is not paused (engineControl).
 *   - It fills the pipeline; it NEVER sends outreach. Approaching a prospect
 *     stays a founder-approved action, and nobody becomes a seller without
 *     the full consent set (sellerConsent.REQUIRED_TO_SELL).
 *
 * Pure + dependency-injected so it is unit-testable without booting the
 * server: the caller passes the collaborating modules and state.
 */

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;   // daily
const DEFAULT_LIMIT = 50;                          // candidates per sweep

/**
 * Decide whether a sweep is due.
 * @param {object} o — { lastRunAt, now, intervalMs, force, disabled }
 */
function isDue(o = {}) {
  if (o.disabled) return false;
  if (o.force) return true;
  if (!o.lastRunAt) return true;
  const interval = o.intervalMs != null ? o.intervalMs : DEFAULT_INTERVAL_MS;
  return (o.now - o.lastRunAt) > interval;
}

/**
 * Run one auto-sourcing sweep.
 * @param {object} deps — { autoSource, prospectDb, engineControl, operations }
 * @param {object} state — { prospects } the live prospect DB (mutated)
 * @param {object} opts — { limit, now, by }
 * @returns {object} { ran, reason?, sourced?, added?, refreshed?, total?, audit? }
 */
function runSweep(deps, state, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  if (deps.engineControl && deps.engineControl.isPaused()) {
    return { ran: false, reason: 'engine_paused' };
  }
  const limit = opts.limit != null ? opts.limit : DEFAULT_LIMIT;
  const sourced = deps.autoSource.autoSource({ limit });
  const candidates = (sourced && sourced.candidates) || [];
  const r = deps.prospectDb.ingest(state.prospects, candidates, now);
  const evidence = `sourcing agent: ${candidates.length} candidate(s) sourced → ` +
    `${r.added} new, ${r.refreshed} refreshed (${r.total} in pipeline); ` +
    'outreach awaits founder approval';
  const audit = deps.operations ? deps.operations.auditEntry({
    action: 'auto_source', key: 'prospect_ingest', level: 'ok',
    evidence, autonomy: deps.operations.AUTONOMY.AUTO,
    by: opts.by || 'sourcing_agent', now,
  }) : null;
  return { ran: true, sourced: candidates.length, added: r.added, refreshed: r.refreshed, total: r.total, evidence, audit };
}

module.exports = { isDue, runSweep, DEFAULT_INTERVAL_MS, DEFAULT_LIMIT };
