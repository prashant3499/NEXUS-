'use strict';

/**
 * test-executive-team.js — the virtual C-suite.
 *   - Each role returns the uniform shape with status + findings + recs
 *   - CFO flags loss/thin-margin/healthy correctly
 *   - assembleTeam sorts worst-first + picks a top priority
 *   - Empty context degrades gracefully (pre-launch posture, no crashes)
 */

const E = require('./src/executiveTeam');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const shape = (r) => r && r.role && r.title && r.status && r.headline && Array.isArray(r.findings) && Array.isArray(r.recommendations) && r.metrics;

sec('Uniform shape across all roles');
{
  const ctx = {};
  for (const role of ['cfo', 'cmo', 'cro', 'cso', 'growth', 'coo']) {
    a(shape(E[role](ctx)), `${role} returns the uniform assessment shape`);
  }
}

sec('CFO — money signals');
{
  const loss = E.cfo({ platformPnL: { net_profit_paise: -50000, total_revenue_paise: 100000, total_cost_paise: 150000, margin_pct: -50, seller_count: 3 } });
  a(loss.status === 'act_now', 'Loss → act_now');
  a(/loss/i.test(loss.findings.join(' ')), 'Names the loss');

  const thin = E.cfo({ platformPnL: { net_profit_paise: 5000, total_revenue_paise: 100000, total_cost_paise: 95000, margin_pct: 5, seller_count: 3 } });
  a(thin.status === 'watch', 'Thin margin → watch');

  const healthy = E.cfo({ platformPnL: { net_profit_paise: 50000, total_revenue_paise: 100000, total_cost_paise: 50000, margin_pct: 50, seller_count: 3 } });
  a(healthy.status === 'strong', 'Healthy margin → strong');

  const runway = E.cfo({ platformPnL: { net_profit_paise: 1000, margin_pct: 30 }, cash_paise: 1000000, monthly_burn_paise: 500000 });
  a(runway.status === 'act_now', 'Runway < 6 months → act_now');
  a(/runway/i.test(runway.findings.join(' ')), 'Reports runway');

  const empty = E.cfo({});
  a(empty.status === 'steady' && /no p&l/i.test(empty.findings.join(' ')), 'No data → graceful, asks for a sweep');
}

sec('CMO — marketing utilisation');
{
  const idle = E.cmo({ ad_headroom: [] });
  a(idle.status === 'watch', 'No budget configured → watch');
  const under = E.cmo({ ad_headroom: [{ tier: 'karigar', includedBudgetPaise: 10000, spentPaise: 1000 }] });
  a(under.status === 'watch', 'Low utilisation → watch');
  const good = E.cmo({ ad_headroom: [{ tier: 'karigar', includedBudgetPaise: 10000, spentPaise: 6000 }] });
  a(good.status === 'strong', 'Healthy utilisation → strong');
}

sec('CRO — pipeline');
{
  const empty = E.cro({ pipeline: { total: 0 }, supply_universe: { total_available: 128, by_type: { artisan: 65, factory: 19 } } });
  a(empty.status === 'watch', 'Empty pipeline → watch');
  a(/128/.test(empty.recommendations.join(' ')), 'Points to the available supply to seed from');
  const converting = E.cro({ pipeline: { total: 20, byStatus: { onboarded: 5 } } });
  a(converting.status === 'strong', 'Good conversion → strong');
}

sec('CSO — strategy + concentration risk');
{
  const concentrated = E.cso({ vertical_mix: { handicraft: 90, gi: 5, tourism: 5 } });
  a(concentrated.status === 'watch', 'Single-vertical concentration → watch');
  a(/concentration/i.test(concentrated.findings.join(' ')), 'Flags concentration risk');
  const balanced = E.cso({ vertical_mix: { handicraft: 20, gi: 20, tourism: 20, gems: 10 } });
  a(balanced.status === 'strong', 'Balanced verticals → strong');
  a(/moat|merchant-of-record|trust/i.test(balanced.findings.join(' ').toLowerCase()), 'Always articulates the structural moat');
}

sec('Growth + COO');
{
  const g = E.growth({ seller_count: 10, active_seller_count: 8, upgrade_signals: 2 });
  a(g.status === 'strong', 'High activation → strong');
  a(/upgrade/i.test(g.findings.join(' ')), 'Surfaces upgrade signals');

  const coo = E.coo({ ops_health: { overallHealth: 'critical' } });
  a(coo.status === 'act_now', 'Critical health → act_now');
  const cooBlocked = E.coo({ release: { verdict: 'no_go', critical_blockers: ['payments_settlement', 'compliance_pack'] } });
  a(cooBlocked.status === 'watch' && /blocker/i.test(cooBlocked.findings.join(' ')), 'Surfaces release blockers');
}

sec('assembleTeam — synthesis + worst-first');
{
  const team = E.assembleTeam({
    platformPnL: { net_profit_paise: -1000, margin_pct: -10, total_revenue_paise: 9000, total_cost_paise: 10000, seller_count: 2 },
    pipeline: { total: 0 },
    supply_universe: { total_available: 128, by_type: { artisan: 65 } },
    vertical_mix: { handicraft: 5 },
    seller_count: 2, active_seller_count: 1,
    ops_health: { overallHealth: 'healthy' },
  });
  a(team.team.length === 10, 'All 10 executives present');
  a(team.overall_status === 'act_now', 'Overall act_now when any function is act_now (CFO loss)');
  a(team.team[0].status === 'act_now', 'Sorted worst-first (act_now leads)');
  a(team.top_priority && team.top_priority.action, 'Picks a single top priority action');
  a(/need action now|to watch|steady or strong/i.test(team.headline), 'Headline summarises the team');

  const allGood = E.assembleTeam({
    platformPnL: { net_profit_paise: 50000, margin_pct: 50, total_revenue_paise: 100000, total_cost_paise: 50000, seller_count: 5 },
    pipeline: { total: 20, byStatus: { onboarded: 5 } },
    vertical_mix: { handicraft: 20, gi: 20, tourism: 20 },
    seller_count: 10, active_seller_count: 9,
    ad_headroom: [{ includedBudgetPaise: 10000, spentPaise: 6000 }],
    ops_health: { overallHealth: 'healthy' },
  });
  a(['strong', 'steady'].includes(allGood.overall_status), 'Healthy business → strong/steady overall');
}

sec('New CXO roles — CCO, CTO, CPO, Risk');
{
  // CCO — child safety is highest severity
  const ccoGap = E.cco({ compliance: { minor_guardian_built: false, mor_seller_count: 5, policies_published: 1, policies_total: 4 } });
  a(ccoGap.status === 'act_now', 'CCO: unbuilt minor/guardian → act_now (child safety)');
  a(/child safety/i.test(ccoGap.findings.join(' ')), 'CCO names the child-safety gap');
  const ccoOk = E.cco({ compliance: { minor_guardian_built: true, mor_seller_count: 5, policies_published: 4, policies_total: 4 } });
  a(ccoOk.status !== 'act_now', 'CCO: built + policies published → not act_now');

  // CTO — security + tests
  const ctoOpen = E.cto({ tech: { tests_passing: 100, tests_total: 100, auth_mode: 'none' } });
  a(ctoOpen.status === 'act_now', 'CTO: auth disabled → act_now');
  const ctoRed = E.cto({ tech: { tests_passing: 99, tests_total: 100, auth_mode: 'session' } });
  a(ctoRed.status === 'act_now', 'CTO: failing tests → act_now');
  const ctoOk = E.cto({ tech: { tests_passing: 100, tests_total: 100, auth_mode: 'session', auth_secret_is_dev: false } });
  a(ctoOk.status === 'strong', 'CTO: green + real secret → strong');
  a(/zero-runtime-dependency|dependency/i.test(ctoOk.findings.join(' ')), 'CTO notes the zero-dependency architecture');

  // CPO — backlog
  const cpo = E.cpo({ product: { open_blockers: ['minor/guardian handling'], verticals_live: 3, verticals_total: 6, active_listings: 5 } });
  a(cpo.status === 'watch', 'CPO: open blockers → watch');
  a(cpo.metrics.open_blockers === 1, 'CPO counts open blockers');

  // Risk
  const risk = E.risk({ risk: { at_risk_sellers: 2, payments_mock: true, compliance_act_now: true } });
  a(risk.status === 'act_now', 'Risk: compliance act-now propagates to regulatory risk');
  a(/never-in-loss/i.test(risk.findings.join(' ')), 'Risk always cites the never-in-loss control');
}

sec('assembleTeam — now 10 executives + cross-functional synthesis');
{
  const team = E.assembleTeam({
    platformPnL: { net_profit_paise: -1000, margin_pct: -10, total_revenue_paise: 9000, total_cost_paise: 10000, seller_count: 2 },
    pipeline: { total: 0 }, supply_universe: { total_available: 128, by_type: { artisan: 65 } },
    vertical_mix: { handicraft: 5 }, seller_count: 2, active_seller_count: 1,
    ops_health: { overallHealth: 'healthy' },
    compliance: { minor_guardian_built: false, mor_seller_count: 2, policies_published: 0, policies_total: 4 },
    tech: { tests_passing: 100, tests_total: 100, auth_mode: 'session', auth_secret_is_dev: true },
    product: { open_blockers: ['minor/guardian handling'], verticals_live: 1, verticals_total: 6, active_listings: 0 },
    risk: { at_risk_sellers: 0, payments_mock: true, compliance_act_now: true },
  });
  a(team.team.length === 10, 'All 10 executives present (added CCO, CTO, CPO, Risk)');
  a(team.team.some((m) => m.role === 'cco'), 'CCO on the team');
  a(team.team.some((m) => m.role === 'risk'), 'Chief Risk Officer on the team');
  a(Array.isArray(team.cross_functional), 'Produces cross-functional synthesis');
  a(team.cross_functional.length > 0, 'Surfaces at least one cross-functional tension');
  a(team.cross_functional.some((t) => /compliance|child|three functions/i.test(t)), 'Connects the compliance gap across functions');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
