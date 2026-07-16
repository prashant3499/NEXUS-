'use strict';
/**
 * mlops — the model-operations layer for an LLM-consumer product (LLMOps): NEXUS trains no
 * models, so MLOps here means managing the AI lifecycle safely: a model registry (which
 * provider/model serves which task), VERSIONED prompts with one-call rollback, a golden-set
 * evaluation harness (so a provider/prompt change is scored before it ships), and inference
 * telemetry (latency, success, cost) feeding a health verdict + fallback recommendation.
 */
const TASKS = ['cofounder_chat', 'creative_ideas', 'listing_copy', 'translation'];

// ── Model registry: task -> provider/model (+ fallback) ──
const _routing = {
  cofounder_chat: { provider: 'anthropic', model: 'claude-sonnet-4-6', fallback: 'local' },
  creative_ideas: { provider: 'anthropic', model: 'claude-sonnet-4-6', fallback: 'local' },
  listing_copy: { provider: 'krutrim', model: 'Krutrim-2-instruct', fallback: 'anthropic' },
  translation: { provider: 'bhashini', model: 'indic-translate', fallback: 'local' },
};
function routing() { return JSON.parse(JSON.stringify(_routing)); }
function setRoute(task, provider, model, by) {
  if (TASKS.indexOf(task) < 0) return { ok: false, error: 'unknown task', tasks: TASKS };
  const prev = Object.assign({}, _routing[task]);
  _routing[task] = { provider: String(provider), model: String(model || _routing[task].model), fallback: prev.fallback };
  require('./auditLog').append({ action: 'mlops_route', task, from: prev, to: _routing[task], by: by || 'founder' });
  return { ok: true, task, route: _routing[task] };
}

// ── Versioned prompts with rollback ──
const _prompts = {
  cofounder_chat: { active: 1, versions: { 1: 'You are the NEXUS AI co-founder. Answer with honest, numbered, India-grounded guidance. Never fabricate. Respect the five invariants.' } },
  listing_copy: { active: 1, versions: { 1: 'Write a truthful product listing for verified Indian craft. Include maker, cluster, GI status if true. No invented claims.' } },
};
function addPromptVersion(name, text, by) {
  if (!_prompts[name]) _prompts[name] = { active: 0, versions: {} };
  const v = Math.max(0, ...Object.keys(_prompts[name].versions).map(Number)) + 1;
  _prompts[name].versions[v] = String(text || '').slice(0, 4000);
  require('./auditLog').append({ action: 'mlops_prompt_add', name, version: v, by: by || 'founder' });
  return { ok: true, name, version: v, note: 'Added but NOT active — activate after evals pass.' };
}
function activatePrompt(name, version, by) {
  const p = _prompts[name];
  if (!p || !p.versions[version]) return { ok: false, error: 'unknown prompt/version' };
  const prev = p.active; p.active = Number(version);
  require('./auditLog').append({ action: 'mlops_prompt_activate', name, from: prev, to: p.active, by: by || 'founder' });
  return { ok: true, name, active: p.active, rollback_to: prev };
}
function getPrompt(name) { const p = _prompts[name]; return p ? { name, active: p.active, text: p.versions[p.active] } : null; }
function prompts() { return Object.keys(_prompts).map((n) => ({ name: n, active: _prompts[n].active, versions: Object.keys(_prompts[n].versions).length })); }

// ── Golden-set evals: score an answer function before shipping a change ──
const GOLDEN = [
  { id: 'fee', input: 'what is the platform fee?', mustInclude: ['12'] },
  { id: 'consent', input: 'can we sell without maker consent?', mustInclude: ['consent'] },
  { id: 'loss', input: 'can a payout exceed what we collected?', mustInclude: ['never', 'loss'] },
];
async function runEvals(answerFn, cases) {
  const set = cases || GOLDEN;
  const results = [];
  for (const c of set) {
    let out = ''; let ok = false;
    try { out = String(await answerFn(c.input) || ''); ok = c.mustInclude.every((m) => out.toLowerCase().indexOf(String(m).toLowerCase()) >= 0); } catch (e) { out = 'ERROR: ' + e.message; }
    results.push({ id: c.id, pass: ok });
  }
  const passed = results.filter((r) => r.pass).length;
  const run = { at: new Date().toISOString(), passed, total: set.length, score: +(passed / set.length).toFixed(2), results };
  _lastEval = run;
  return run;
}
let _lastEval = null;

// ── Telemetry ──
const _tele = {}; // provider -> {calls, errors, totalMs, costPaise}
function recordCall(provider, m) {
  m = m || {};
  const t = _tele[provider] = _tele[provider] || { calls: 0, errors: 0, totalMs: 0, costPaise: 0 };
  t.calls++; if (m.ok === false) t.errors++;
  t.totalMs += Number(m.latencyMs) || 0; t.costPaise += Number(m.costPaise) || 0;
}
function telemetry() {
  const out = {};
  Object.keys(_tele).forEach((p) => { const t = _tele[p]; out[p] = { calls: t.calls, error_rate: t.calls ? +(t.errors / t.calls).toFixed(3) : 0, avg_ms: t.calls ? Math.round(t.totalMs / t.calls) : 0, cost_rupees: Math.round(t.costPaise / 100) }; });
  return out;
}

function health() {
  const tel = telemetry();
  const sick = Object.keys(tel).filter((p) => tel[p].calls >= 5 && tel[p].error_rate > 0.2);
  return {
    providers: tel, last_eval: _lastEval,
    healthy: sick.length === 0 && (!_lastEval || _lastEval.score >= 0.67),
    recommendation: sick.length ? ('High error rate on: ' + sick.join(', ') + ' — switch routing to fallback (setRoute) or rely on local engine.') : 'All providers within tolerance.',
  };
}

function reset() { Object.keys(_tele).forEach((k) => delete _tele[k]); _lastEval = null; }

module.exports = { TASKS, routing, setRoute, addPromptVersion, activatePrompt, getPrompt, prompts, GOLDEN, runEvals, recordCall, telemetry, health, reset };
