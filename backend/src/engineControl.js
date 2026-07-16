'use strict';
/**
 * engineControl — the founder's stop / pause switch for the autonomous engine.
 *
 * When paused, NO autonomous tool executes: executeTool refuses everything that
 * isn't an explicit founder override. This is the kill switch — one call halts
 * all agent activity; resume brings it back. State persists across restarts so a
 * paused engine stays paused until the founder resumes it.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'engine-control.json');

let state = { paused: false, reason: null, since: null, by: null };

(function load() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j.paused === 'boolean') state = j;
  } catch (e) { /* default: running */ }
})();

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state), 'utf8');
  } catch (e) { /* in-memory only if disk unavailable */ }
}

function isPaused() { return state.paused === true; }

function pause(reason, by) {
  state = { paused: true, reason: reason || 'Paused by founder', since: new Date().toISOString(), by: by || 'founder' };
  persist();
  return status();
}

function resume(by) {
  state = { paused: false, reason: null, since: null, by: by || 'founder' };
  persist();
  return status();
}

function status() {
  return {
    paused: state.paused,
    running: !state.paused,
    reason: state.reason,
    since: state.since,
    by: state.by,
    label: state.paused ? 'PAUSED' : 'RUNNING',
  };
}

module.exports = { isPaused, pause, resume, status };
