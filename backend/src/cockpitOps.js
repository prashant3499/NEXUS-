'use strict';
/**
 * cockpitOps — the founder's command line inside the cockpit: the AI co-founder executes
 * MAINTAIN / REPAIR / MODIFY operations when the founder directs, under three rules:
 *   1. Founder-only (the endpoint is auth-gated) and every action lands in the
 *      tamper-evident audit log.
 *   2. Safe, reversible operations execute immediately (diagnose, repair, cache, routing,
 *      caps, fee within floor/ceiling).
 *   3. Anything that would threaten a protected invariant (consent, never-in-loss,
 *      child-safety, no-fabrication, honest-stage) is REFUSED — even from the founder.
 */
const auditLog = require('./auditLog');

const COMMANDS = [
  'diagnose — full engine health report',
  'repair — clear caches, sweep idempotency, verify audit chain, report',
  'clear-cache — drop the response/API cache',
  'verify-audit — check the tamper-evident chain',
  'set-cap <rupees> — set the monthly AI spend cap',
  'set-fee <pct> — set platform commission (floor/ceiling enforced)',
  'route <task> <provider> — switch an AI task to a provider',
  'reset-monitoring — clear error counters (evidence is audited first)',
];

const INVARIANT_ATTACK = /(disable|remove|skip|bypass|turn off).*(consent|child|minor|invariant|never.?in.?loss|fabricat|honest)|(sell|list).*(without).*(consent)/i;

function diagnose() {
  const monitoring = require('./monitoring').status();
  const cache = require('./cache').stats();
  const chain = auditLog.verifyChain();
  const spend = require('./spendControl');
  const mlops = require('./mlops').health();
  const report = {
    healthy: monitoring.healthy && chain.valid && mlops.healthy !== false,
    monitoring: { requests: monitoring.requests, errors: monitoring.errors, error_rate: monitoring.error_rate },
    cache: { entries: cache.entries, hit_rate: cache.hit_rate },
    audit_chain: chain,
    spend_cap_rupees: spend.getCapRupees(),
    ai: { healthy: mlops.healthy, note: mlops.recommendation },
    uptime_seconds: monitoring.uptime_seconds,
  };
  auditLog.append({ action: 'cockpit_diagnose', healthy: report.healthy });
  return report;
}

function repair(by) {
  const steps = [];
  try { require('./cache').clear(); steps.push({ step: 'cache_cleared', ok: true }); } catch (e) { steps.push({ step: 'cache_cleared', ok: false, error: e.message }); }
  try { require('./idempotency').reset(); steps.push({ step: 'idempotency_swept', ok: true, note: 'stale duplicate-locks released' }); } catch (e) { steps.push({ step: 'idempotency_swept', ok: false }); }
  const chain = auditLog.verifyChain();
  steps.push({ step: 'audit_chain_verified', ok: chain.valid });
  const after = diagnose();
  auditLog.append({ action: 'cockpit_repair', by: by || 'founder', steps: steps.map((s) => s.step) });
  return { ok: steps.every((s) => s.ok !== false), steps, health_after: { healthy: after.healthy, error_rate: after.monitoring.error_rate } };
}

function run(cmdline, by) {
  const cmd = String(cmdline || '').trim();
  if (!cmd) return { ok: false, error: 'empty command', commands: COMMANDS };

  // Rule 3: invariant protection — refused even from the founder.
  if (INVARIANT_ATTACK.test(cmd)) {
    auditLog.append({ action: 'cockpit_refused', cmd: cmd.slice(0, 120), reason: 'protected_invariant' });
    return { ok: false, refused: true, reason: 'This would threaten a protected invariant (consent / never-in-loss / child-safety / no-fabrication / honest-stage). The engine refuses this even on founder command.', };
  }

  const parts = cmd.split(/\s+/);
  const op = parts[0].toLowerCase();
  let result;
  switch (op) {
    case 'diagnose': result = { ok: true, action: 'diagnose', report: diagnose() }; break;
    case 'repair': result = Object.assign({ action: 'repair' }, repair(by)); break;
    case 'clear-cache': require('./cache').clear(); result = { ok: true, action: 'clear-cache' }; break;
    case 'verify-audit': result = { ok: true, action: 'verify-audit', chain: auditLog.verifyChain() }; break;
    case 'reset-monitoring': {
      const before = require('./monitoring').status();
      auditLog.append({ action: 'cockpit_reset_monitoring', errors_before: before.errors });
      require('./monitoring').reset();
      result = { ok: true, action: 'reset-monitoring', note: 'counters cleared; prior state audited' }; break;
    }
    case 'set-cap': {
      const r = require('./spendControl').setCapRupees(parts[1], by || 'founder-cockpit');
      result = Object.assign({ action: 'set-cap' }, r); break;
    }
    case 'set-fee': {
      const r = require('./slicer').setCommissionPct(Number(parts[1]) / 100);
      result = r.ok ? { ok: true, action: 'set-fee', pct: r.to_pct * 100, display: r.display }
                    : { ok: false, action: 'set-fee', error: r.reason, note: 'floor/ceiling enforced — never-in-loss protected' };
      break;
    }
    case 'route': {
      const r = require('./mlops').setRoute(parts[1], parts[2], parts[3], by || 'founder-cockpit');
      result = Object.assign({ action: 'route' }, r); break;
    }
    default: result = { ok: false, error: 'unknown command: ' + op, commands: COMMANDS };
  }
  if (op !== 'diagnose' && op !== 'repair') auditLog.append({ action: 'cockpit_ops', cmd: cmd.slice(0, 120), ok: result.ok !== false, by: by || 'founder' });
  return result;
}

module.exports = { COMMANDS, run, diagnose, repair, INVARIANT_ATTACK };
