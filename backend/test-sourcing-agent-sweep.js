'use strict';

/**
 * test-sourcing-agent-sweep.js
 *
 * Verifies the scheduled sourcing-agent sweep:
 *   - Cadence: due when never run / past interval / forced; not when disabled
 *   - Engine pause is respected (founder kill-switch stops the agent)
 *   - A sweep sources real candidates and ingests them deduped
 *   - Re-running refreshes instead of duplicating
 *   - The audit entry records the run and that outreach stays founder-gated
 *   - Prospects land at stage "sourced" — nobody is contacted or converted
 */

const sweep = require('./src/sourcingAgentSweep');
const autoSource = require('./src/autoSource');
const prospectDb = require('./src/prospectDb');
const operations = require('./src/operations');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } };
const sec = (n) => console.log('\n━━━ ' + n + ' ━━━\n');

const DAY = 24 * 60 * 60 * 1000;

sec('Cadence — isDue');
{
  a(sweep.isDue({ lastRunAt: null, now: 1000 }) === true, 'Due when never run');
  a(sweep.isDue({ lastRunAt: 1000, now: 1000 + DAY + 1 }) === true, 'Due after the interval elapses');
  a(sweep.isDue({ lastRunAt: 1000, now: 1000 + DAY - 1 }) === false, 'Not due before the interval elapses');
  a(sweep.isDue({ lastRunAt: 1000, now: 2000, force: true }) === true, 'Force overrides cadence');
  a(sweep.isDue({ lastRunAt: null, now: 1000, disabled: true }) === false, 'Disabled wins over everything');
  a(sweep.isDue({ lastRunAt: 1000, now: 1000 + 10, intervalMs: 5 }) === true, 'Custom interval honoured');
}

sec('Engine pause — founder kill-switch respected');
{
  const paused = { isPaused: () => true };
  const state = { prospects: prospectDb.emptyDb() };
  const r = sweep.runSweep({ autoSource, prospectDb, engineControl: paused, operations }, state);
  a(r.ran === false, 'Sweep refuses to run while the engine is paused');
  a(r.reason === 'engine_paused', 'Refusal reason says engine_paused');
  a(Object.keys(state.prospects.prospects).length === 0, 'No prospects ingested while paused');
}

sec('A real sweep — sources and ingests');
{
  const running = { isPaused: () => false };
  const state = { prospects: prospectDb.emptyDb() };
  const r = sweep.runSweep({ autoSource, prospectDb, engineControl: running, operations }, state, { limit: 25, now: 5000 });
  a(r.ran === true, 'Sweep runs while the engine is live');
  a(r.sourced > 0, 'Candidates were sourced (' + r.sourced + ')');
  a(r.added > 0, 'New prospects added to the pipeline (' + r.added + ')');
  a(r.added <= r.sourced, 'Added never exceeds sourced');
  a(r.total === Object.keys(state.prospects.prospects).length, 'Reported total matches the DB');
  const all = Object.values(state.prospects.prospects);
  a(all.every(p => p.stage === 'sourced'), 'Every ingested prospect sits at stage "sourced" — nobody contacted');
  a(all.every(p => p.history.length === 1), 'History shows sourcing only — no outreach steps');
}

sec('Dedup — re-running refreshes, never duplicates');
{
  const running = { isPaused: () => false };
  const state = { prospects: prospectDb.emptyDb() };
  const first = sweep.runSweep({ autoSource, prospectDb, engineControl: running, operations }, state, { limit: 25, now: 5000 });
  const second = sweep.runSweep({ autoSource, prospectDb, engineControl: running, operations }, state, { limit: 25, now: 6000 });
  a(second.added === 0, 'Second sweep adds no duplicates');
  a(second.refreshed === first.added, 'Second sweep refreshes what the first added');
  a(second.total === first.total, 'Pipeline size unchanged after re-sweep');
}

sec('Audit — the run is recorded, outreach stays founder-gated');
{
  const running = { isPaused: () => false };
  const state = { prospects: prospectDb.emptyDb() };
  const r = sweep.runSweep({ autoSource, prospectDb, engineControl: running, operations }, state, { limit: 10, now: 7000 });
  a(r.audit != null, 'Audit entry produced');
  a(r.audit.action === 'auto_source', 'Audit action is auto_source');
  a(r.audit.autonomy === operations.AUTONOMY.AUTO, 'Recorded as an AUTO-tier action');
  a(/founder approval/.test(r.evidence), 'Evidence states outreach awaits founder approval');
  a(r.audit.by === 'sourcing_agent', 'Attributed to the sourcing agent');
}

console.log('\n' + '═'.repeat(50));
console.log('  RESULTS: ' + pass + ' passed, ' + fail + ' failed');
console.log('═'.repeat(50));
process.exit(fail === 0 ? 0 : 1);
