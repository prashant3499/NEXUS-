'use strict';
/**
 * debugTool — production-safe debugger for the founder: (1) request TRACING (ring buffer of
 * recent requests with path/status/duration), (2) a SNAPSHOT of runtime state with secrets
 * strictly REDACTED (presence booleans only — values never leave the process), (3) module
 * health. For breakpoint debugging in dev: `node --inspect backend/server.js` + chrome://inspect.
 */
const TRACE_MAX = 300;
const _trace = [];
let _slow = 0;
const SLOW_MS = 500;

function trace(entry) {
  entry = entry || {};
  const e = { at: new Date().toISOString(), method: String(entry.method || 'GET').slice(0, 8), path: String(entry.path || '').slice(0, 200), status: Number(entry.status) || 0, ms: Number(entry.ms) || 0 };
  if (e.ms >= SLOW_MS) _slow++;
  _trace.push(e);
  if (_trace.length > TRACE_MAX) _trace.shift();
  return e;
}

function recent(n) { return _trace.slice(-(n || 50)); }

function slowest(n) { return _trace.slice().sort((a, b) => b.ms - a.ms).slice(0, n || 10); }

/** Secret-safe env report: presence flags ONLY — never values. */
function envReport() {
  const KEYS = ['NODE_ENV', 'PORT', 'AUTH_MODE', 'STORE_DRIVER', 'PAYMENTS_PROVIDER', 'AUTH_SECRET', 'FOUNDER_TOKEN', 'WEBHOOK_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL', 'AI_PROVIDER', 'AI_API_KEY', 'ANTHROPIC_API_KEY', 'MONITOR_WEBHOOK_URL', 'CRAWLER_ENABLED', 'RATE_LIMIT', 'COMPLIANCE_CONFIRMED'];
  const SECRET = /SECRET|TOKEN|KEY|DATABASE_URL|WEBHOOK/;
  const out = {};
  KEYS.forEach((k) => {
    const v = process.env[k];
    out[k] = SECRET.test(k) ? (v ? 'SET (redacted)' : 'not set') : (v || 'not set');
  });
  return out;
}

function snapshot() {
  const mem = process.memoryUsage();
  let mon = {}, cache = {}, chain = {};
  try { mon = require('./monitoring').status(); } catch (e) {}
  try { cache = require('./cache').stats(); } catch (e) {}
  try { chain = require('./auditLog').verifyChain(); } catch (e) {}
  return {
    node: process.version,
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: { rss: Math.round(mem.rss / 1048576), heap_used: Math.round(mem.heapUsed / 1048576) },
    env: envReport(),
    requests: { traced: _trace.length, slow_over_500ms: _slow, errors: mon.errors, error_rate: mon.error_rate },
    cache: { entries: cache.entries, hit_rate: cache.hit_rate },
    audit_chain: chain,
    note: 'Secret VALUES are never exposed here — presence only.',
  };
}

/** require() every module and report failures — catches broken deploys fast. */
function moduleHealth(dir) {
  const fs = require('fs'), path = require('path');
  const d = dir || __dirname;
  const bad = [];
  let count = 0;
  fs.readdirSync(d).filter((f) => f.endsWith('.js')).forEach((f) => {
    count++;
    try { require(path.join(d, f)); } catch (e) { bad.push({ module: f, error: e.message.slice(0, 120) }); }
  });
  return { modules: count, failed: bad.length, bad };
}

function reset() { _trace.length = 0; _slow = 0; }

module.exports = { trace, recent, slowest, snapshot, envReport, moduleHealth, reset, SLOW_MS };
