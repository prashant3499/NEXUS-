'use strict';
/**
 * monitoring — captures runtime errors (uncaught exceptions, rejected promises, handler
 * failures, HTTP 500s) and surfaces them to the founder, with an optional forward to an
 * external service (Sentry/Better Stack style) if MONITOR_WEBHOOK_URL is set. Provider-
 * agnostic and dependency-free. This is the early-warning system for the pilot.
 */
const _errors = [];         // recent error ring buffer
const MAX = 200;
let _requests = 0, _errCount = 0;
const _startedAt = Date.now();

function _forward(entry) {
  const url = process.env.MONITOR_WEBHOOK_URL;
  if (!url || typeof fetch !== 'function') return;
  try { fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {}); } catch (e) {}
}

/** Record an error with context. Never throws. */
function capture(err, context) {
  try {
    const entry = {
      at: new Date().toISOString(),
      message: (err && err.message) ? String(err.message).slice(0, 500) : String(err).slice(0, 500),
      stack: (err && err.stack) ? String(err.stack).split('\n').slice(0, 5).join('\n') : null,
      context: context || {},
    };
    _errCount++;
    _errors.push(entry);
    if (_errors.length > MAX) _errors.shift();
    _forward(entry);
    return entry;
  } catch (e) { return null; }
}

function recordRequest(statusCode) {
  _requests++;
  if (statusCode >= 500) _errCount++;
}

function status() {
  const uptimeMs = Date.now() - _startedAt;
  return {
    uptime_seconds: Math.round(uptimeMs / 1000),
    requests: _requests,
    errors: _errCount,
    error_rate: _requests ? +(_errCount / _requests).toFixed(4) : 0,
    forwarding: !!process.env.MONITOR_WEBHOOK_URL,
    recent_errors: _errors.slice(-20),
    healthy: _requests === 0 || (_errCount / _requests) < 0.05,
  };
}

/** Hook process-level crashes so a bug is captured & reported instead of silently dying. */
function install() {
  if (install._done) return; install._done = true;
  process.on('uncaughtException', (e) => { capture(e, { kind: 'uncaughtException' }); });
  process.on('unhandledRejection', (e) => { capture(e, { kind: 'unhandledRejection' }); });
}

function reset() { _errors.length = 0; _requests = 0; _errCount = 0; }

module.exports = { capture, recordRequest, status, install, reset };
