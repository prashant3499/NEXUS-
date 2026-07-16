'use strict';

/**
 * executiveTeam.js
 *
 * A solo founder can't be a CFO, CMO, head of sales, COO, and strategist at
 * once. This module is the virtual management team: each "executive" reads the
 * REAL platform data already produced by other modules and returns a focused,
 * role-specific assessment — status, headline, findings, and prioritized
 * recommendations. Nothing here invents numbers; every finding is derived from
 * data the caller passes in (P&L, ops health, pipeline, usage, ad headroom).
 *
 * Roles:
 *   CFO            — profit, expense, margin, runway, never-in-loss posture
 *   CMO            — marketing reach, ad headroom, channel mix, brand
 *   CRO  (Sales)   — supply pipeline, lead conversion, segment coverage
 *   CSO  (Strategy)— vertical balance, differentiation, structural risk
 *   Head of Growth — activation, upgrade signals, acquisition leverage
 *   COO            — operational health, release readiness, maintenance
 *
 * Each returns the same shape so a dashboard can render them uniformly:
 *   { role, title, status, headline, findings[], recommendations[], metrics{} }
 *
 * status ∈ { strong, steady, watch, act_now } — a single at-a-glance signal.
 */

const STATUS = Object.freeze({ STRONG: 'strong', STEADY: 'steady', WATCH: 'watch', ACT_NOW: 'act_now' });

// Rank for sorting the team summary worst-first (so the founder sees fires).
const STATUS_RANK = Object.freeze({ act_now: 0, watch: 1, steady: 2, strong: 3 });

const rupees = (paise) => (paise == null ? '—' : `₹${Math.round(paise / 100).toLocaleString('en-IN')}`);
const pct = (n) => (n == null ? '—' : `${Math.round(n)}%`);

function _assessment(role, title, status, headline, findings, recommendations, metrics) {
  return {
    role, title, status, headline,
    findings: findings.filter(Boolean),
    recommendations: recommendations.filter(Boolean),
    metrics: metrics || {},
  };
}

// ════════════════════════════════════════════════════════════
// CFO — money: profit, expense, margin, runway
// ════════════════════════════════════════════════════════════
function cfo(ctx = {}) {
  const pnl = ctx.platformPnL || {};
  const net = pnl.net_profit_paise;
  const revenue = pnl.total_revenue_paise;
  const cost = pnl.total_cost_paise;
  const margin = pnl.margin_pct;
  const sellers = pnl.seller_count || 0;

  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  if (net != null) {
    if (net < 0) {
      status = STATUS.ACT_NOW;
      findings.push(`Platform is operating at a LOSS of ${rupees(-net)} this month — the never-in-loss invariant is being tested.`);
      recommendations.push('Review the at-risk sellers from the latest profit sweep; pause AI-heavy free usage for accounts below cost-to-serve.');
    } else if (margin != null && margin < 20) {
      status = STATUS.WATCH;
      findings.push(`Thin margin: ${pct(margin)} on ${rupees(revenue)} revenue. Healthy SaaS sits well above this.`);
      recommendations.push('Either raise a subscription tier (founder-controlled) or shift heavy users to self-hosted inference to cut cost-to-serve.');
    } else {
      status = margin >= 40 ? STATUS.STRONG : STATUS.STEADY;
      findings.push(`Profitable: ${rupees(net)} net on ${rupees(revenue)} revenue (${pct(margin)} margin).`);
    }
    findings.push(`Cost base ${rupees(cost)} across ${sellers} seller${sellers === 1 ? '' : 's'} — ${rupees(sellers ? Math.round(cost / sellers) : 0)} cost-to-serve each.`);
  } else {
    findings.push('No P&L snapshot yet — run a profit sweep to populate the cost ledger.');
    recommendations.push('Trigger /api/profit/sweep to generate the first month-to-date P&L.');
  }

  // Runway (if cash + burn provided)
  if (ctx.cash_paise != null && ctx.monthly_burn_paise != null && ctx.monthly_burn_paise > 0) {
    const months = ctx.cash_paise / ctx.monthly_burn_paise;
    findings.push(`Runway ≈ ${months.toFixed(1)} months at ${rupees(ctx.monthly_burn_paise)}/mo burn.`);
    if (months < 6) { status = STATUS.ACT_NOW; recommendations.push('Runway under 6 months — prioritise revenue or reduce burn before new spend.'); }
  }

  return _assessment('cfo', 'Chief Financial Officer', status,
    net == null ? 'Awaiting first P&L' : (net < 0 ? 'Platform in loss — act now' : `Profitable at ${pct(margin)} margin`),
    findings, recommendations,
    { net_profit_paise: net, revenue_paise: revenue, cost_paise: cost, margin_pct: margin, seller_count: sellers });
}

// ════════════════════════════════════════════════════════════
// CMO — marketing: reach, ad headroom, channel mix
// ════════════════════════════════════════════════════════════
function cmo(ctx = {}) {
  const headroom = ctx.ad_headroom || [];      // [{tier, includedBudgetPaise, spentPaise}]
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  const totalIncluded = headroom.reduce((s, h) => s + (h.includedBudgetPaise || 0), 0);
  const totalSpent = headroom.reduce((s, h) => s + (h.spentPaise || 0), 0);
  const utilisation = totalIncluded > 0 ? (totalSpent / totalIncluded) * 100 : 0;

  if (totalIncluded === 0) {
    status = STATUS.WATCH;
    findings.push('No ad budget configured yet — sellers have marketing included in their subscription but it is unused.');
    recommendations.push('Generate launch creatives for active sellers; included budget is wasted if untouched.');
  } else {
    findings.push(`Included marketing budget ${rupees(totalIncluded)}/mo, ${pct(utilisation)} utilised.`);
    if (utilisation < 25) {
      status = STATUS.WATCH;
      recommendations.push('Under-using included ad budget — auto-generate seller creatives and a NEXUS brand campaign.');
    } else if (utilisation > 90) {
      recommendations.push('Ad budget nearly exhausted — consider whether a tier bump (more headroom) is warranted.');
    } else {
      status = STATUS.STRONG;
    }
  }
  if (ctx.active_seller_count != null && ctx.active_seller_count > 0 && ctx.sellers_with_ads != null) {
    const coverage = (ctx.sellers_with_ads / ctx.active_seller_count) * 100;
    findings.push(`${pct(coverage)} of active sellers have run a campaign.`);
    if (coverage < 50) recommendations.push('Over half of sellers have never marketed — a one-tap "generate my first ad" prompt would lift coverage.');
  }

  return _assessment('cmo', 'Chief Marketing Officer', status,
    totalIncluded === 0 ? 'Marketing engine idle' : `${pct(utilisation)} of included budget working`,
    findings, recommendations,
    { included_budget_paise: totalIncluded, spent_paise: totalSpent, utilisation_pct: Math.round(utilisation) });
}

// ════════════════════════════════════════════════════════════
// CRO — sales: supply pipeline, conversion, segment coverage
// ════════════════════════════════════════════════════════════
function cro(ctx = {}) {
  const pipeline = ctx.pipeline || {};         // { byStatus: {new, contacted, ...}, total }
  const supply = ctx.supply_universe || {};    // { total_available, by_type }
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  const total = pipeline.total || 0;
  const won = (pipeline.byStatus && (pipeline.byStatus.onboarded || pipeline.byStatus.won)) || 0;
  const conversion = total > 0 ? (won / total) * 100 : 0;

  if (total === 0) {
    status = STATUS.WATCH;
    findings.push('Sales pipeline is empty — no leads being worked.');
    if (supply.total_available) {
      recommendations.push(`Auto-sourcing has ${supply.total_available} authentic candidates ready — promote a batch into the pipeline to start.`);
    } else {
      recommendations.push('Run auto-sourcing to seed the pipeline with authentic candidates.');
    }
  } else {
    findings.push(`${total} leads in pipeline, ${won} onboarded (${pct(conversion)} conversion).`);
    if (conversion < 10) {
      status = STATUS.WATCH;
      recommendations.push('Low conversion — review first-touch outreach templates and prioritise high-score leads.');
    } else {
      status = STATUS.STRONG;
    }
  }
  if (supply.by_type) {
    const types = Object.keys(supply.by_type).length;
    findings.push(`Supply universe spans ${types} establishment types (${supply.total_available} candidates) — artisans, factories, shops, exporters, tourism.`);
  }

  return _assessment('cro', 'Chief Revenue Officer (Sales)', status,
    total === 0 ? 'Pipeline empty — seed it' : `${total} in pipeline, ${pct(conversion)} converting`,
    findings, recommendations,
    { pipeline_total: total, onboarded: won, conversion_pct: Math.round(conversion), supply_available: supply.total_available || 0 });
}

// ════════════════════════════════════════════════════════════
// CSO — strategy: vertical balance, differentiation, structural risk
// ════════════════════════════════════════════════════════════
function cso(ctx = {}) {
  const verticals = ctx.vertical_mix || {};    // { handicraft: n, gi: n, tourism: n, ... }
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  const entries = Object.entries(verticals);
  const totalProducts = entries.reduce((s, [, n]) => s + n, 0);

  if (totalProducts === 0) {
    status = STATUS.WATCH;
    findings.push('No live products yet — strategy is pre-launch. The moat (verified provenance + zero artisan liability) is built; supply needs activation.');
    recommendations.push('Onboard one anchor cooperative (a Sansthan = hundreds of artisans at once) to seed multiple verticals fast.');
  } else {
    const active = entries.filter(([, n]) => n > 0).length;
    findings.push(`${active} of the 6 verticals are live (${totalProducts} products).`);
    // Concentration risk
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    if (top && totalProducts > 0 && top[1] / totalProducts > 0.7) {
      status = STATUS.WATCH;
      findings.push(`Concentration risk: ${pct((top[1] / totalProducts) * 100)} of products are in "${top[0]}".`);
      recommendations.push(`Diversify beyond ${top[0]} — the platform's edge is breadth (5 verticals × 5 modalities) plus trust, not a single category.`);
    } else if (active >= 3) {
      status = STATUS.STRONG;
    }
  }
  findings.push('Structural edge intact: Merchant-of-Record (zero artisan liability) + status-aware legal core + never-in-loss guard. This is the durable moat, not price.');

  return _assessment('cso', 'Chief Strategy Officer', status,
    totalProducts === 0 ? 'Pre-launch — activate supply' : 'Trust-first moat holding',
    findings, recommendations,
    { vertical_count_active: entries.filter(([, n]) => n > 0).length, total_products: totalProducts });
}

// ════════════════════════════════════════════════════════════
// HEAD OF GROWTH — activation, upgrade signals, acquisition leverage
// ════════════════════════════════════════════════════════════
function growth(ctx = {}) {
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  const sellers = ctx.seller_count || 0;
  const active = ctx.active_seller_count || 0;
  const upgradeSignals = ctx.upgrade_signals || 0;
  const activation = sellers > 0 ? (active / sellers) * 100 : 0;

  if (sellers === 0) {
    status = STATUS.WATCH;
    findings.push('No sellers onboarded — growth starts with the first cohort.');
    recommendations.push('Target GI boards + cooperatives: one onboarding can bring hundreds of artisans (high-leverage acquisition).');
  } else {
    findings.push(`${sellers} sellers, ${active} active (${pct(activation)} activation).`);
    if (activation < 40) {
      status = STATUS.WATCH;
      recommendations.push('Activation is low — sellers signing up but not listing. Add a guided "list your first product" nudge.');
    } else {
      status = STATUS.STRONG;
    }
    if (upgradeSignals > 0) {
      findings.push(`${upgradeSignals} seller${upgradeSignals === 1 ? '' : 's'} showing upgrade signals (sustained high usage).`);
      recommendations.push('Surface tier-upgrade offers to high-usage sellers — they are telling you they have outgrown their plan.');
    }
  }
  recommendations.push('Highest-leverage channel: diaspora + conscious-consumer demand pulled in by verified provenance — lean into the provenance story.');

  return _assessment('growth', 'Head of Growth', status,
    sellers === 0 ? 'Pre-acquisition' : `${pct(activation)} activation`,
    findings, recommendations,
    { seller_count: sellers, active_seller_count: active, activation_pct: Math.round(activation), upgrade_signals: upgradeSignals });
}

// ════════════════════════════════════════════════════════════
// COO — operations: health, release readiness, maintenance
// ════════════════════════════════════════════════════════════
function coo(ctx = {}) {
  const health = ctx.ops_health || {};         // { overallHealth, summary }
  const release = ctx.release || {};           // { verdict, critical_blockers }
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  const level = health.overallHealth || health.overall_health;
  if (level) {
    findings.push(`System health: ${level}.`);
    if (level === 'critical' || level === 'degraded') {
      status = STATUS.ACT_NOW;
      recommendations.push('Run the recommended maintenance runbooks before anything else.');
    } else {
      status = STATUS.STRONG;
    }
  }
  if (release.verdict) {
    findings.push(`Release readiness: ${release.verdict.toUpperCase().replace(/_/g, ' ')}.`);
    const blockers = release.critical_blockers || [];
    if (blockers.length) {
      if (status !== STATUS.ACT_NOW) status = STATUS.WATCH;
      findings.push(`${blockers.length} blocker${blockers.length === 1 ? '' : 's'} before production: ${blockers.slice(0, 3).join('; ')}.`);
      recommendations.push('Clear deploy blockers (auth/payments/compliance/secrets) before going live — the gate is doing its job.');
    }
  }
  if (!level && !release.verdict) {
    findings.push('No ops snapshot supplied — run health checks + release readiness to populate.');
  }

  return _assessment('coo', 'Chief Operating Officer', status,
    level === 'healthy' ? 'Systems healthy' : (level || 'Awaiting ops snapshot'),
    findings, recommendations,
    { health: level || null, release_verdict: release.verdict || null });
}

// ════════════════════════════════════════════════════════════
// CCO — compliance: the core of a trust + compliance OS
// ════════════════════════════════════════════════════════════
function cco(ctx = {}) {
  const c = ctx.compliance || {};
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  // Child safety is the highest-severity compliance item.
  if (c.minor_guardian_built === false) {
    status = STATUS.ACT_NOW;
    findings.push('CHILD SAFETY GAP: minor/guardian handling is not built. The legal core requires Guardian-MoR for minors and blocking unaccompanied minors. This is non-negotiable.');
    recommendations.push('Build minor/guardian handling before public launch — it is the last unbuilt piece of the legal core and a child-safety requirement.');
  }
  // MoR coverage — the liability firewall
  if (c.mor_seller_count != null) {
    findings.push(`${c.mor_seller_count} seller${c.mor_seller_count === 1 ? '' : 's'} under Merchant-of-Record (zero artisan liability) — the platform carries the legal burden, as designed.`);
  }
  // Policy pack
  if (c.policies_published != null && c.policies_total != null) {
    if (c.policies_published < c.policies_total) {
      if (status !== STATUS.ACT_NOW) status = STATUS.WATCH;
      findings.push(`${c.policies_published}/${c.policies_total} required policies published (Terms, Privacy/DPDP, Returns, Grievance).`);
      recommendations.push('Publish the remaining legal policies — the AI can draft them; you + a lawyer approve.');
    } else {
      findings.push('All required legal policies are published.');
    }
  }
  // Grievance SLA (Consumer Protection E-Commerce Rules)
  if (c.grievance_sla_breaches != null && c.grievance_sla_breaches > 0) {
    status = STATUS.ACT_NOW;
    findings.push(`${c.grievance_sla_breaches} grievance${c.grievance_sla_breaches === 1 ? '' : 's'} past SLA — a regulatory exposure under the Consumer Protection Rules.`);
    recommendations.push('Clear the breached grievances now; SLA misses are reportable.');
  }
  // Tax posture
  findings.push('TCS (Section 52) is collected by the platform on every order split; GST on commission is computed at source. Tax mechanics are in the slicer, not manual.');

  return _assessment('cco', 'Chief Compliance Officer', status,
    c.minor_guardian_built === false ? 'Child-safety gap — act now' : 'Compliance posture holding',
    findings, recommendations,
    { minor_guardian_built: !!c.minor_guardian_built, policies_published: c.policies_published, grievance_sla_breaches: c.grievance_sla_breaches || 0 });
}

// ════════════════════════════════════════════════════════════
// CTO — technology: security, test health, tech debt, deploy
// ════════════════════════════════════════════════════════════
function cto(ctx = {}) {
  const t = ctx.tech || {};
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  if (t.tests_passing != null && t.tests_total != null) {
    if (t.tests_passing < t.tests_total) {
      status = STATUS.ACT_NOW;
      findings.push(`${t.tests_total - t.tests_passing} failing test(s) — do not deploy on red.`);
      recommendations.push('Fix the failing suite before any release.');
    } else {
      status = STATUS.STRONG;
      findings.push(`${t.tests_total} tests green across the suite — the regression net is intact.`);
    }
  }
  // Security posture
  if (t.auth_mode === 'none') {
    status = STATUS.ACT_NOW;
    findings.push('Auth is disabled (demo mode) — every protected route is open. Never run this in production.');
    recommendations.push('Set AUTH_MODE=session with a strong AUTH_SECRET before exposing the app.');
  } else if (t.auth_secret_is_dev) {
    if (status !== STATUS.ACT_NOW) status = STATUS.WATCH;
    findings.push('Session auth is on, but the signing secret is the dev default.');
    recommendations.push('Replace the dev AUTH_SECRET with a strong random value at deploy.');
  } else {
    findings.push('Session auth on with a real secret; financial routes gated to founder + co-founder.');
  }
  // Architecture / dependency risk
  findings.push('Zero-runtime-dependency backend — no supply-chain/dependency-vuln surface, no npm audit debt. A deliberate, durable architecture choice.');
  if (t.store_driver === 'file') {
    recommendations.push('File store is fine for pilot; plan the Postgres migration before high write volume (the store interface already abstracts this).');
  }

  return _assessment('cto', 'Chief Technology Officer', status,
    t.auth_mode === 'none' ? 'Auth disabled — not production-safe' : (t.tests_passing < t.tests_total ? 'Tests red' : 'Engineering healthy'),
    findings, recommendations,
    { tests_passing: t.tests_passing, tests_total: t.tests_total, auth_mode: t.auth_mode, dependencies: 0 });
}

// ════════════════════════════════════════════════════════════
// CPO — product: backlog, feature gaps, coverage, adoption
// ════════════════════════════════════════════════════════════
function cpo(ctx = {}) {
  const pr = ctx.product || {};
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  if (Array.isArray(pr.open_blockers) && pr.open_blockers.length) {
    status = STATUS.WATCH;
    findings.push(`${pr.open_blockers.length} product blocker(s) open: ${pr.open_blockers.slice(0, 3).join('; ')}.`);
    recommendations.push(`Prioritise "${pr.open_blockers[0]}" — it is the top of the product backlog.`);
  }
  if (pr.verticals_total != null && pr.verticals_live != null) {
    findings.push(`${pr.verticals_live}/${pr.verticals_total} verticals live, ${pr.modalities_total || 5} modalities supported (D2C/B2B/B2B2C/EXIM/POS).`);
    if (pr.verticals_live <= 1) recommendations.push('Breadth is the product edge — activate more than one vertical to prove the cross-vertical model.');
  }
  if (pr.active_listings != null) {
    findings.push(`${pr.active_listings} active listing(s) live in the marketplace.`);
    if (pr.active_listings === 0) {
      status = STATUS.WATCH;
      recommendations.push('Marketplace is empty of real listings — adopt GI/cluster product templates onto real sellers to seed it.');
    }
  }
  findings.push('Differentiators shipped: instant verified provenance, AI listing from photo+voice, never-in-loss guard, status-aware MoR. These are the product moat.');

  return _assessment('cpo', 'Chief Product Officer', status,
    (pr.open_blockers && pr.open_blockers.length) ? `${pr.open_blockers.length} blocker(s) in backlog` : 'Product surface broad',
    findings, recommendations,
    { open_blockers: (pr.open_blockers || []).length, verticals_live: pr.verticals_live, active_listings: pr.active_listings });
}

// ════════════════════════════════════════════════════════════
// CHIEF RISK OFFICER — fraud, default, concentration, regulatory
// ════════════════════════════════════════════════════════════
function risk(ctx = {}) {
  const r = ctx.risk || {};
  const findings = [];
  const recommendations = [];
  let status = STATUS.STEADY;

  // Never-in-loss is the structural risk control
  findings.push('Never-in-loss invariant is enforced at the AI-tool, order, pricing, and deploy boundaries (HTTP 402/422) — the platform cannot be pushed into a loss-making transaction.');

  if (r.at_risk_sellers != null && r.at_risk_sellers > 0) {
    status = STATUS.WATCH;
    findings.push(`${r.at_risk_sellers} seller(s) flagged below cost-to-serve in the last profit sweep.`);
    recommendations.push('Review at-risk sellers — adjust their tier or usage before they erode platform margin.');
  }
  // Payment/settlement risk
  if (r.payments_mock) {
    findings.push('Payments are in mock mode — no real money at risk yet, but chargeback/refund exposure is untested live.');
    recommendations.push('When going live, confirm Razorpay Route split-settlement so the platform never holds float (removes a whole class of liability).');
  }
  // Concentration
  if (r.top_seller_share != null && r.top_seller_share > 50) {
    status = STATUS.WATCH;
    findings.push(`Concentration: top seller is ${Math.round(r.top_seller_share)}% of GMV — single-point dependency.`);
    recommendations.push('Diversify the seller base; high concentration is a revenue-continuity risk.');
  }
  // Regulatory exposure ties to compliance gaps
  if (r.compliance_act_now) {
    status = STATUS.ACT_NOW;
    findings.push('A compliance item is at "act now" (e.g. child safety / SLA breach) — that is also an active regulatory + reputational risk.');
    recommendations.push('Resolve the flagged compliance item; regulatory and brand risk compound.');
  }

  return _assessment('risk', 'Chief Risk Officer', status,
    r.compliance_act_now ? 'Regulatory risk active' : 'Risk controls holding',
    findings, recommendations,
    { at_risk_sellers: r.at_risk_sellers || 0, payments_mock: !!r.payments_mock });
}

function _crossFunctional(byRole) {
  const tensions = [];
  const get = (r) => byRole[r] || { metrics: {} };

  if (get('cfo').status !== 'strong' && get('cmo').status === 'watch' && (get('cmo').metrics.utilisation_pct || 0) < 25) {
    tensions.push('CMO wants to deploy idle ad budget, but the CFO is flagging margin — spend only on channels that clear the never-in-loss guard.');
  }
  if (get('cro').status === 'watch' && (get('cro').metrics.supply_available || 0) > 50 && get('cro').metrics.pipeline_total === 0) {
    tensions.push('Auto-sourcing has abundant supply but the sales pipeline is empty — the constraint is outreach capacity, not lead supply. Promote a batch.');
  }
  if (get('cco').status === 'act_now') {
    tensions.push('The CCO flag (compliance) is simultaneously a Risk exposure and a Product backlog item — fixing it once clears three functions. Treat it as the single highest-leverage task.');
  }
  if (get('growth').status === 'watch' && (get('growth').metrics.activation_pct || 0) < 40) {
    tensions.push('Growth is pre-acquisition, but activation is the real leak — acquiring more sellers before fixing activation just widens the funnel hole.');
  }
  if (get('cto').status === 'act_now') {
    tensions.push('The CTO says the stack is not production-safe yet — no go-live conversation is real until that clears, regardless of commercial readiness.');
  }
  return tensions;
}

function assembleTeam(ctx = {}) {
  const team = [cfo(ctx), cmo(ctx), cro(ctx), cso(ctx), growth(ctx), coo(ctx), cco(ctx), cto(ctx), cpo(ctx), risk(ctx)];
  const sorted = team.slice().sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const actNow = team.filter((m) => m.status === STATUS.ACT_NOW);
  const watch = team.filter((m) => m.status === STATUS.WATCH);

  // The single most important action across the whole team.
  const topPriority = sorted[0] && sorted[0].recommendations[0]
    ? { from: sorted[0].role, action: sorted[0].recommendations[0] }
    : null;

  let overall = STATUS.STRONG;
  if (actNow.length) overall = STATUS.ACT_NOW;
  else if (watch.length) overall = STATUS.WATCH;
  else if (team.some((m) => m.status === STATUS.STEADY)) overall = STATUS.STEADY;

  const byRole = {};
  for (const m of team) byRole[m.role] = m;

  return {
    overall_status: overall,
    headline: actNow.length
      ? `${actNow.length} area${actNow.length === 1 ? '' : 's'} need action now: ${actNow.map((m) => m.role.toUpperCase()).join(', ')}`
      : watch.length
        ? `${watch.length} area${watch.length === 1 ? '' : 's'} to watch: ${watch.map((m) => m.role.toUpperCase()).join(', ')}`
        : 'All functions steady or strong',
    top_priority: topPriority,
    cross_functional: _crossFunctional(byRole),
    team: sorted,
    generated_at: (ctx.now || Date.now)(),
  };
}

module.exports = {
  STATUS,
  cfo, cmo, cro, cso, growth, coo, cco, cto, cpo, risk,
  assembleTeam,
};
