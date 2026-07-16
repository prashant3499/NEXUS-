'use strict';
/**
 * founderOps — the founder's command surface: maintain, repair, or modify the platform from
 * the cockpit (or via the AI co-founder) with one command. Safety model, in order:
 *   1. changeControl.threatensInvariant — a command that threatens an invariant is REFUSED,
 *      even from the founder (never-in-loss, consent, child-safety, no-fabrication, honest-stage).
 *   2. Risk tiers — 'safe' ops run at once; 'guarded' ops run and are flagged; 'destructive'
 *      ops require an explicit second confirmation (HITL two-step).
 *   3. Everything — command, actor, result — lands in the tamper-evident audit log.
 */
const auditLog = require('./auditLog');
const changeControl = require('./changeControl');

const OPS = {
  health_check: { risk: 'safe', label: 'Full health check (monitoring + cache + audit chain)',
    run() { const mon = require('./monitoring').status(); const cache = require('./cache').stats(); const chain = auditLog.verifyChain();
      return { monitoring: { healthy: mon.healthy, requests: mon.requests, errors: mon.errors }, cache, audit_chain: chain }; } },
  diagnose: { risk: 'safe', label: 'Self-healing diagnosis (issues + auto-healable + escalations)',
    run() { return require('./selfHealingAgent').diagnose({}); } },
  repair: { risk: 'guarded', label: 'Run self-healing repair on auto-healable issues',
    run() { const sh = require('./selfHealingAgent'); const d = sh.diagnose({}); if (!d.auto_healable.length) return { repaired: 0, note: 'Nothing auto-healable; escalations (if any) need the founder.', escalations: d.escalations };
      const done = d.auto_healable.map((i) => sh.heal(i)); return { repaired: done.length, actions: done, escalations: d.escalations }; } },
  pause_engine: { risk: 'safe', label: 'Pause the engine',
    run(arg, by) { const ec = require('./engineControl'); ec.pause(arg || 'Paused via founder command', by); return ec.status(); } },
  resume_engine: { risk: 'safe', label: 'Resume the engine',
    run(arg, by) { const ec = require('./engineControl'); ec.resume(by); return ec.status(); } },
  engine_status: { risk: 'safe', label: 'Engine status', run() { return require('./engineControl').status(); } },
  clear_cache: { risk: 'guarded', label: 'Clear the response cache (next calls recompute)',
    run() { const c = require('./cache'); const before = c.stats().entries; c.clear(); return { cleared: before }; } },
  set_spend_cap: { risk: 'guarded', label: 'Set the monthly AI spend cap (rupees)',
    run(arg, by) { return require('./spendControl').setCapRupees(Number(String(arg).replace(/[^\d]/g, '')), by); } },
  run_evals: { risk: 'safe', label: 'Run golden-set evals against the local answer engine',
    async run() { const ml = require('./mlops'); const fi = require('./founderInsights');
      return ml.runEvals((q) => { const a = fi.answerQuestion(q, { artisans: 1000, feePct: 12, orders: [], sellers: [], customers: [], products: [] }); return typeof a === 'string' ? a : JSON.stringify(a); }); } },
  verify_audit: { risk: 'safe', label: 'Verify the tamper-evident audit chain', run() { return auditLog.verifyChain(); } },
  crawl: { risk: 'guarded', label: 'Crawl an allowlisted open-data source (arg = source id)',
    async run(arg) { return require('./webCrawler').crawl(arg || 'datagov'); } },
  reset_demo_data: { risk: 'destructive', label: 'Reset in-memory demo repositories (repo + feedback + findings)',
    run() { require('./repository').reset(); require('./feedback').reset(); require('./researchAgent').reset(); return { reset: ['repository', 'feedback', 'research findings'], note: 'Demo state cleared. Persistent stores untouched.' }; } },
};

const ALIASES = [
  [/^(health|check ?up|status report|maintain)/i, 'health_check'],
  [/^diagnos/i, 'diagnose'],
  [/^(repair|heal|fix)/i, 'repair'],
  [/^pause/i, 'pause_engine'], [/^(resume|start)/i, 'resume_engine'], [/^engine/i, 'engine_status'],
  [/^(clear|flush).*(cache)/i, 'clear_cache'],
  [/(spend|budget|cap).*?(\d[\d,]*)/i, 'set_spend_cap'],
  [/(run\s+)?evals?\b|test (the )?ai/i, 'run_evals'],
  [/^(verify|audit)/i, 'verify_audit'],
  [/^crawl\s*(\w+)?/i, 'crawl'],
  [/^reset/i, 'reset_demo_data'],
];

function parse(cmd) {
  const c = String(cmd || '').trim();
  if (OPS[c]) return { op: c, arg: null };
  for (const [re, op] of ALIASES) {
    const m = c.match(re);
    if (m) {
      let arg = m[2] != null ? m[2] : (m[1] != null ? m[1] : null);
      if (/crawl/.test(op)) arg = c.split(/\s+/).pop() || null;
      return { op, arg };
    }
  }
  return { op: null, arg: null };
}

function catalog() { return Object.keys(OPS).map((k) => ({ op: k, risk: OPS[k].risk, label: OPS[k].label })); }

async function execute(cmd, opts) {
  opts = opts || {};
  const by = opts.by || 'founder';
  // 1) invariant guard — refuse even the founder
  const _guard = changeControl.threatensInvariant(String(cmd || ''));
  if (_guard && _guard.blocked) {
    const refusal = { ok: false, refused: true, reason: 'This command threatens a protected invariant (never-in-loss, consent, child-safety, no-fabrication, honest-stage). Refused — even on founder command.' };
    auditLog.append({ action: 'founder_op_refused', cmd: String(cmd).slice(0, 200), by });
    return refusal;
  }
  const { op, arg } = parse(cmd);
  if (!op) return { ok: false, error: 'unknown command', try: catalog().map((c) => c.op) };
  const spec = OPS[op];
  // 2) destructive ops need explicit confirmation (HITL two-step)
  if (spec.risk === 'destructive' && String(opts.confirm) !== 'yes') {
    auditLog.append({ action: 'founder_op_pending', op, by });
    return { ok: true, pending_confirmation: true, op, risk: spec.risk, note: 'Destructive operation — repeat with confirm=yes to execute.' };
  }
  // 3) execute + audit
  let result;
  try { result = await spec.run(opts.arg != null ? opts.arg : arg, by); }
  catch (e) { auditLog.append({ action: 'founder_op_error', op, error: e.message, by }); return { ok: false, op, error: e.message }; }
  auditLog.append({ action: 'founder_op', op, risk: spec.risk, by });
  return { ok: true, op, risk: spec.risk, result };
}

module.exports = { OPS, catalog, parse, execute };
