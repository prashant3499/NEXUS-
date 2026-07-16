'use strict';
/**
 * dailyBriefing — the AI assistant's daily report to the founder.
 *
 * Composes the existing brains (no new "intelligence" invented here):
 *   - executiveTeam.assembleTeam → the 10 AI CXOs + cross-functional tension
 *   - founderAdvisor.suggestTasks → prioritised next actions
 *   - growthAgent.growthPlan     → how to grow given market conditions
 *   - selfAuditAgent.audit       → is the platform healthy & honest
 *
 * Output is a structured briefing + a human-readable render, so the founder
 * starts each day knowing the one thing to do and why. Honest by construction:
 * it labels projections as projections and never fabricates traction.
 */
const executiveTeam = require('./executiveTeam');
const founderAdvisor = require('./founderAdvisor');
let growthAgent, selfAudit;
try { growthAgent = require('./growthAgent'); } catch (e) { growthAgent = null; }
try { selfAudit = require('./selfAuditAgent'); } catch (e) { selfAudit = null; }

function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }

function buildDailyBriefing(ctx = {}, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const day = now.toISOString().slice(0, 10);

  const team = safe(() => executiveTeam.assembleTeam(ctx), { overall_status: 'unknown', headline: '', team: [], cross_functional: [], top_priority: null });
  const advisor = safe(() => founderAdvisor.suggestTasks(ctx), { tasks: [] });
  const tasks = ((advisor && advisor.tasks) || []).slice().sort((a, b) => (a.priority || 9) - (b.priority || 9));
  const growth = growthAgent ? safe(() => growthAgent.growthPlan({ for: 'maker', vertical: ctx.vertical || 'handicraft', ...ctx }), null) : null;
  const audit = selfAudit ? safe(() => selfAudit.audit(), null) : null;

  // One concrete line per executive: their first recommendation (or headline).
  const executives = (team.team || []).map(m => ({
    role: m.role,
    title: m.title,
    status: m.status,
    says: (m.recommendations && m.recommendations[0]) || m.headline || ''
  }));

  // "Do today" = top advisor actions + the single highest-leverage growth step.
  const doToday = tasks.slice(0, 3).map(t => ({ what: t.what, why: t.why, who: t.who || 'ai+founder' }));
  if (growth && Array.isArray(growth.prioritized_steps) && growth.prioritized_steps[0]) {
    const g = growth.prioritized_steps[0];
    doToday.push({ what: (typeof g === 'string' ? g : (g.step || g.what || g.action || '')), why: 'Highest-leverage growth move right now.', who: 'ai+founder' });
  }

  const healthOk = audit ? (audit.healthy === true || audit.status === 'ok' || audit.overall === 'ok' || (Array.isArray(audit.checks) && audit.checks.every(c => c.pass !== false))) : null;

  return {
    date: day,
    greeting: `Good morning, founder. Your briefing for ${day}.`,
    overall_status: team.overall_status,
    headline: team.headline,
    top_priority: team.top_priority || (doToday[0] ? { from: 'advisor', action: doToday[0].what } : null),
    do_today: doToday.filter(t => t.what),
    executives,
    cross_functional: team.cross_functional || [],
    growth: growth ? { headline: growth.headline, steps: (growth.prioritized_steps || []).slice(0, 3) } : null,
    platform_health: audit ? { healthy: healthOk, checks: Array.isArray(audit.checks) ? audit.checks.length : undefined } : null,
    honest_note: 'This briefing reflects the current pre-pilot state. Figures are projections until a real pilot is live; the assistant will not invent traction that does not exist.',
    generated_at: now.toISOString()
  };
}

function renderText(b) {
  const L = [];
  L.push(`NEXUS — DAILY FOUNDER BRIEFING · ${b.date}`);
  L.push('='.repeat(52));
  L.push(b.greeting);
  L.push('');
  L.push(`STATUS: ${String(b.overall_status || '').toUpperCase()} — ${b.headline}`);
  if (b.top_priority) L.push(`TOP PRIORITY (${b.top_priority.from}): ${b.top_priority.action}`);
  L.push('');
  L.push('DO TODAY:');
  (b.do_today || []).forEach((t, i) => L.push(`  ${i + 1}. ${t.what}\n     ↳ ${t.why}`));
  L.push('');
  L.push('YOUR EXECUTIVE TEAM SAYS:');
  (b.executives || []).forEach(e => L.push(`  ${e.title} [${e.status}]: ${e.says}`));
  if (b.cross_functional && b.cross_functional.length) {
    L.push('');
    L.push('CROSS-FUNCTIONAL (where your team disagrees — your call):');
    b.cross_functional.forEach(c => L.push(`  • ${c}`));
  }
  if (b.growth) {
    L.push('');
    L.push('GROWTH IN CURRENT MARKET:');
    L.push(`  ${b.growth.headline}`);
    (b.growth.steps || []).forEach(s => L.push(`  → ${typeof s === 'string' ? s : (s.action || s.step || s.what || '')}${s && s.note ? '  ('+s.note+')' : ''}`));
  }
  if (b.platform_health) L.push(`\nPLATFORM HEALTH: ${b.platform_health.healthy ? 'healthy ✓' : 'see audit'} (${b.platform_health.checks || '?'} checks)`);
  L.push('');
  L.push(b.honest_note);
  return L.join('\n');
}

module.exports = { buildDailyBriefing, renderText };
