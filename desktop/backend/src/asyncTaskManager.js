'use strict';

/**
 * asyncTaskManager.js
 *
 * Long-running work on this platform is asynchronous and often needs to PAUSE
 * and later RESUME — exactly:
 *   • a Beckn flow waiting on an `on_search` / `on_confirm` callback,
 *   • an AI agent task that must pause for founder approval before continuing,
 *   • a bulk operation (sourcing outreach, catalog publish) the founder halts.
 *
 * The hard part is resuming CORRECTLY: a paused task must remember where it was
 * so it continues from the checkpoint, not from the start. This manager gives
 * every long task a state machine + a checkpoint, so pause/resume is safe and
 * the founder stays in control.
 *
 * State machine:
 *   pending → running → (paused ⇄ running) → completed
 *                     ↘ awaiting_callback ⇄ running
 *                     ↘ awaiting_approval → running (on approve) | cancelled (on reject)
 *                     ↘ failed
 *
 * Pure + dependency-free; a real deployment persists tasks via the DB adapter.
 */

const STATE = Object.freeze({
  PENDING: 'pending', RUNNING: 'running', PAUSED: 'paused',
  AWAITING_CALLBACK: 'awaiting_callback', AWAITING_APPROVAL: 'awaiting_approval',
  COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled',
});

// Which states a task may move to from each state.
const TRANSITIONS = Object.freeze({
  pending: ['running', 'cancelled'],
  running: ['paused', 'awaiting_callback', 'awaiting_approval', 'completed', 'failed'],
  paused: ['running', 'cancelled'],
  awaiting_callback: ['running', 'failed', 'cancelled'],
  awaiting_approval: ['running', 'cancelled'],
  completed: [], failed: ['running'], cancelled: [],
});

const TERMINAL = new Set([STATE.COMPLETED, STATE.CANCELLED]);

function makeManager() {
  const tasks = new Map();
  let seq = 0;

  function create(input = {}) {
    seq += 1;
    const id = input.id || `task_${Date.now()}_${seq}`;
    const t = {
      id, kind: input.kind || 'generic', label: input.label || input.kind || 'task',
      state: STATE.PENDING, checkpoint: input.checkpoint || { step: 0 },
      needs_approval: !!input.needs_approval, created_at: Date.now(), updated_at: Date.now(),
      history: [{ state: STATE.PENDING, at: Date.now() }],
    };
    tasks.set(id, t);
    return t;
  }

  function _move(id, to, patch = {}) {
    const t = tasks.get(id);
    if (!t) return { ok: false, reason: 'unknown task' };
    if (!TRANSITIONS[t.state].includes(to)) {
      return { ok: false, reason: `invalid transition: ${t.state} → ${to}` };
    }
    t.state = to;
    t.updated_at = Date.now();
    if (patch.checkpoint) t.checkpoint = patch.checkpoint;
    if (patch.error) t.error = patch.error;
    t.history.push({ state: to, at: Date.now(), note: patch.note || null });
    return { ok: true, task: t };
  }

  return {
    create,
    start(id) { return _move(id, STATE.RUNNING); },

    /** checkpoint — save progress WITHOUT changing state, so a later resume
     *  continues from here. */
    checkpoint(id, checkpoint) {
      const t = tasks.get(id);
      if (!t) return { ok: false, reason: 'unknown task' };
      t.checkpoint = checkpoint; t.updated_at = Date.now();
      return { ok: true, task: t };
    },

    /** pause — halt a running task; its checkpoint is preserved. */
    pause(id, checkpoint) { return _move(id, STATE.PAUSED, { checkpoint, note: 'paused' }); },

    /** resume — continue a paused/callback/approved task FROM its checkpoint. */
    resume(id) {
      const t = tasks.get(id);
      if (!t) return { ok: false, reason: 'unknown task' };
      const r = _move(id, STATE.RUNNING, { note: 'resumed from checkpoint' });
      if (r.ok) r.resumed_from = t.checkpoint; // caller continues from here
      return r;
    },

    /** waitForCallback — Beckn-style async wait (e.g. after sending `search`). */
    waitForCallback(id, checkpoint) { return _move(id, STATE.AWAITING_CALLBACK, { checkpoint, note: 'awaiting network callback' }); },
    /** onCallback — the awaited callback arrived; resume running. */
    onCallback(id, payload) {
      const r = _move(id, STATE.RUNNING, { note: 'callback received' });
      if (r.ok) r.payload = payload;
      return r;
    },

    /** requestApproval — pause for the founder (agent autonomy boundary). */
    requestApproval(id, checkpoint) { return _move(id, STATE.AWAITING_APPROVAL, { checkpoint, note: 'awaiting founder approval' }); },
    approve(id) { return _move(id, STATE.RUNNING, { note: 'approved by founder' }); },
    reject(id, reason) { return _move(id, STATE.CANCELLED, { note: 'rejected: ' + (reason || '') }); },

    complete(id, result) {
      const r = _move(id, STATE.COMPLETED, { note: 'done' });
      if (r.ok) r.task.result = result;
      return r;
    },
    fail(id, error) { return _move(id, STATE.FAILED, { error: error || 'unknown', note: 'failed' }); },
    cancel(id, reason) { return _move(id, STATE.CANCELLED, { note: reason || 'cancelled' }); },

    get(id) { return tasks.get(id) || null; },
    list(filter) {
      const all = [...tasks.values()];
      if (filter && filter.state) return all.filter((t) => t.state === filter.state);
      return all;
    },
    /** resumable — tasks the system/founder can pick back up. */
    resumable() { return [...tasks.values()].filter((t) => t.state === STATE.PAUSED || t.state === STATE.AWAITING_APPROVAL); },
    stats() {
      const all = [...tasks.values()];
      const by = {};
      for (const t of all) by[t.state] = (by[t.state] || 0) + 1;
      return { total: all.length, by_state: by, active: all.filter((t) => !TERMINAL.has(t.state)).length };
    },
  };
}

module.exports = { STATE, TRANSITIONS, TERMINAL, makeManager };
