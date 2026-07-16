'use strict';

/**
 * agentRegistry.js
 *
 * The AI co-founder orchestrator. Bridges the existing agents.js (which
 * defines six sub-agents) and aiTools.js (which exposes tools to Claude).
 *
 * Every agent has:
 *   - id, name, description
 *   - one or more TOOLS that Claude can invoke
 *   - an autonomy tier per tool: AUTO (auto-run after timeout) /
 *     NOTIFY (auto-run, notify founder) / MANUAL (requires approval)
 *
 * The founder-in-the-loop pattern: read-only tools auto-execute, mutating
 * tools require approval. Every execution is audited with rollback metadata
 * where possible.
 *
 * This is pure routing infrastructure. The actual tools are implemented
 * either here (for new ops/dev/marketing/finance tools) or by existing
 * modules (sourcing, returns, products, sellerSignup, schemes).
 */

const operations = require('./operations');
const sourcing = require('./sourcing');
const products = require('./products');
const adGeneration = require('./adGeneration');
const unitEconomics = require('./unitEconomics');
const schemes = require('./schemes');
const returns = require('./returns');
const profitGuard = require('./profitGuard');

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const AUTONOMY = Object.freeze({ AUTO: 'auto', NOTIFY: 'notify', MANUAL: 'manual' });

/** Six sub-agents. Each is a logical grouping; tools live below. */
const AGENT_REGISTRY = Object.freeze({
  commerce: Object.freeze({
    id: 'commerce',
    name: 'Commerce agent',
    description: 'Handles orders, payouts, settlement reconciliation, and product catalog. Routes everything through the integer-paise slicer so no money is lost.',
    icon: 'shopping-cart',
  }),
  marketing: Object.freeze({
    id: 'marketing',
    name: 'Marketing agent',
    description: 'Generates ad creative for sellers, estimates reach, attributes revenue, and ensures every campaign stays above the 30% margin floor.',
    icon: 'megaphone',
  }),
  support: Object.freeze({
    id: 'support',
    name: 'Support agent',
    description: 'Manages return requests, customer grievances (DPDP/Consumer Protection), and routes escalations to the nodal officer when needed.',
    icon: 'lifebuoy',
  }),
  finance: Object.freeze({
    id: 'finance',
    name: 'Finance agent',
    description: 'Reconciles settlements paise-by-paise, prepares GSTR-1/3B/9 returns, audits the ledger for drift, and projects runway across cost scenarios.',
    icon: 'chart-bar',
  }),
  ops: Object.freeze({
    id: 'ops',
    name: 'Ops/Dev agent',
    description: 'Runs health checks, executes operational runbooks, manages dependency patches, and gates deploys behind the founder. Self-healing where safe.',
    icon: 'server',
  }),
  rnd: Object.freeze({
    id: 'rnd',
    name: 'R&D agent',
    description: 'Analyses the platform for innovation opportunities: under-served verticals, missing schemes, founder time-sinks. Proposes (never ships) new modules.',
    icon: 'sparkles',
  }),
});

// ════════════════════════════════════════════════════════════
// COMMERCE TOOLS
// ════════════════════════════════════════════════════════════

const COMMERCE_TOOLS = Object.freeze({
  list_products_by_seller: Object.freeze({
    agent: 'commerce',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'List all products for a specific seller, with status counts.',
    schema: {
      type: 'object',
      properties: { seller_id: { type: 'string' } },
      required: ['seller_id'],
    },
    execute: (input, state) => {
      const all = state.products_v2 ? [...state.products_v2.values()] : [];
      const list = all.filter(p => p.seller_id === input.seller_id);
      const by_status = {};
      for (const p of list) by_status[p.status] = (by_status[p.status] || 0) + 1;
      return { ok: true, seller_id: input.seller_id, count: list.length, by_status };
    },
  }),

  catalog_value_paise: Object.freeze({
    agent: 'commerce',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Total active catalog value in paise. GMV potential across all live listings.',
    schema: { type: 'object', properties: {} },
    execute: (_, state) => {
      const map = state.products_v2 || new Map();
      return { ok: true, gmv_potential_paise: products.catalogValuePaise(map) };
    },
  }),

  transition_product: Object.freeze({
    agent: 'commerce',
    autonomy: AUTONOMY.MANUAL,
    mutating: true,
    description: 'Transition a product to a new status (e.g. approve a pending_review → active). Requires founder approval — mutating.',
    schema: {
      type: 'object',
      properties: { product_id: { type: 'string' }, new_status: { type: 'string' }, note: { type: 'string' } },
      required: ['product_id', 'new_status'],
    },
    execute: (input, state) => {
      const current = state.products_v2 && state.products_v2.get(input.product_id);
      if (!current) return { ok: false, error: 'product not found', id: input.product_id };
      const result = products.transitionProduct(current, input.new_status, { note: input.note });
      if (!result.ok) return { ok: false, errors: result.errors };
      return {
        ok: true,
        product_id: input.product_id,
        previous_status: current.status,
        new_status: input.new_status,
        rollback: { product_id: input.product_id, restore_status: current.status },
      };
    },
  }),
});

// ════════════════════════════════════════════════════════════
// MARKETING TOOLS
// ════════════════════════════════════════════════════════════

const MARKETING_TOOLS = Object.freeze({
  generate_ad_creative: Object.freeze({
    agent: 'marketing',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Generate ad creative for a seller product. Returns headline + body in chosen tone, with character-count compliance.',
    schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string' },
        vertical: { type: 'string' },
        channel: { type: 'string', enum: ['google_search', 'google_display', 'meta_feed', 'meta_reel', 'whatsapp_status'] },
        tone: { type: 'string', enum: ['heritage', 'modern', 'urgent', 'aspirational'] },
        unique_attributes: { type: 'array', items: { type: 'string' } },
      },
      required: ['product_name', 'channel'],
    },
    execute: (input, _state) => {
      const creative = adGeneration.generateAdCreative({
        productName: input.product_name,
        vertical: input.vertical || 'handicraft',
        channel: input.channel,
        tone: input.tone || 'heritage',
        uniqueAttributes: input.unique_attributes || [],
      });
      return { ok: true, ...creative };
    },
  }),

  estimate_campaign_reach: Object.freeze({
    agent: 'marketing',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Estimate impressions, clicks, and conversions for a given budget and channel.',
    schema: {
      type: 'object',
      properties: {
        budget_paise: { type: 'integer' },
        channel: { type: 'string' },
      },
      required: ['budget_paise', 'channel'],
    },
    execute: (input, _state) => {
      const reach = adGeneration.estimateCampaignReach({
        budgetPaise: input.budget_paise,
        channel: input.channel,
      });
      return { ok: true, ...reach };
    },
  }),

  guarded_ad_spend: Object.freeze({
    agent: 'marketing',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Check whether a planned ad spend stays under the seller-tier budget and keeps margin above the 30% floor. Returns approval verdict + HITL flag.',
    schema: {
      type: 'object',
      properties: {
        seller_id: { type: 'string' },
        tier: { type: 'string', enum: ['karigar', 'vyapari', 'niryatak', 'sansthan', 'pravasi'] },
        gmv_paise: { type: 'integer' },
        planned_spend_paise: { type: 'integer' },
        already_spent_paise: { type: 'integer' },
      },
      required: ['tier', 'gmv_paise', 'planned_spend_paise'],
    },
    execute: (input, _state) => {
      const result = adGeneration.guardedAdSpend({
        sellerId: input.seller_id || 'unknown',
        tier: input.tier,
        gmvPaise: input.gmv_paise,
        plannedSpendPaise: input.planned_spend_paise,
        alreadySpentPaise: input.already_spent_paise || 0,
      });
      return { ok: true, ...result };
    },
  }),
});

// ════════════════════════════════════════════════════════════
// SUPPORT TOOLS
// ════════════════════════════════════════════════════════════

const SUPPORT_TOOLS = Object.freeze({
  list_open_returns: Object.freeze({
    agent: 'support',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'List all open return requests across the platform with their SLA timers.',
    schema: { type: 'object', properties: { status: { type: 'string' } } },
    execute: (input, state) => {
      const all = state.returns ? [...state.returns.values()] : [];
      const list = input.status ? all.filter(r => r.status === input.status) : all;
      return { ok: true, total: list.length, returns: list.slice(0, 20) };
    },
  }),

  transition_return: Object.freeze({
    agent: 'support',
    autonomy: AUTONOMY.MANUAL,
    mutating: true,
    description: 'Move a return through its state machine (requested → approved → received → refunded). Mutating — requires approval.',
    schema: {
      type: 'object',
      properties: { return_id: { type: 'string' }, new_status: { type: 'string' }, note: { type: 'string' } },
      required: ['return_id', 'new_status'],
    },
    execute: (input, state) => {
      const current = state.returns && state.returns.get(input.return_id);
      if (!current) return { ok: false, error: 'return not found', id: input.return_id };
      try {
        const updated = returns.transitionStatus(current, input.new_status, input.note || '');
        return {
          ok: true,
          return_id: input.return_id,
          previous_status: current.status,
          new_status: input.new_status,
          rollback: { return_id: input.return_id, restore_status: current.status },
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  }),
});

// ════════════════════════════════════════════════════════════
// FINANCE TOOLS
// ════════════════════════════════════════════════════════════

const FINANCE_TOOLS = Object.freeze({
  tier_profitability_report: Object.freeze({
    agent: 'finance',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Per-tier P&L: Karigar, Vyapari, Niryatak, Sansthan, Pravasi. Shows GMV, take-rate, costs, margin per tier.',
    schema: { type: 'object', properties: {} },
    execute: (_, _state) => {
      const report = unitEconomics.profitabilityReport(unitEconomics.createLedger());
      return { ok: true, ...report };
    },
  }),

  runway_projection: Object.freeze({
    agent: 'finance',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Project monthly burn and runway across three scenarios: zero, hundred, thousand sellers.',
    schema: { type: 'object', properties: {} },
    execute: () => {
      const opCost = require('./operationalCost');
      return {
        ok: true,
        zero: opCost.scenarioZero(),
        hundred: opCost.scenario100(),
        thousand: opCost.scenario1000(),
      };
    },
  }),
});

// ════════════════════════════════════════════════════════════
// OPS / DEV TOOLS
// ════════════════════════════════════════════════════════════

const OPS_TOOLS = Object.freeze({
  run_health_checks: Object.freeze({
    agent: 'ops',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Run all 7 platform health checks. Returns each check\'s level (ok / warn / critical) with actionable detail.',
    schema: { type: 'object', properties: {} },
    execute: (_, state) => {
      const results = operations.runHealthChecks(state || {});
      return { ok: true, results };
    },
  }),

  recommended_runbooks: Object.freeze({
    agent: 'ops',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Based on current health-check results, recommend which runbooks to execute. Returns ordered list with autonomy tier per runbook.',
    schema: { type: 'object', properties: {} },
    execute: (_, state) => {
      const results = operations.runHealthChecks(state || {});
      const recs = operations.recommendedRunbooks(results);
      return { ok: true, recommendations: recs };
    },
  }),

  execute_runbook: Object.freeze({
    agent: 'ops',
    autonomy: AUTONOMY.MANUAL,
    mutating: true,
    description: 'Execute a named operational runbook. AUTO-tier runbooks (backup_verification, dependency_audit) auto-run; deploy/migration runbooks need founder approval.',
    schema: {
      type: 'object',
      properties: { runbook_id: { type: 'string' } },
      required: ['runbook_id'],
    },
    execute: (input, _state) => {
      const book = operations.RUNBOOKS[input.runbook_id];
      if (!book) return { ok: false, error: 'runbook not found', id: input.runbook_id };
      // Runbooks are recipes — they describe steps but don't actually execute
      // shell commands here. The founder executes them; this returns the plan.
      return {
        ok: true,
        runbook_id: input.runbook_id,
        title: book.title,
        steps: book.steps,
        autonomy: book.tier,
        rollback: { restore_via: book.rollback || 'see steps' },
      };
    },
  }),

  list_due_windows: Object.freeze({
    agent: 'ops',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'List maintenance windows that are due (or overdue). Each window has a cadence and the last run timestamp.',
    schema: { type: 'object', properties: {} },
    execute: () => {
      const due = operations.dueWindows({});
      return { ok: true, due };
    },
  }),
});

// ════════════════════════════════════════════════════════════
// R&D TOOLS
// ════════════════════════════════════════════════════════════

const RND_TOOLS = Object.freeze({
  identify_underserved_verticals: Object.freeze({
    agent: 'rnd',
    autonomy: AUTONOMY.AUTO,
    mutating: false,
    description: 'Identify verticals with high lead inflow but low product count. Suggests where to focus seller acquisition.',
    schema: { type: 'object', properties: {} },
    execute: (_, state) => {
      const allProducts = state.products_v2 ? [...state.products_v2.values()] : [];
      const allLeads = state.leads ? [...state.leads.values()] : [];
      const vertCounts = {};
      for (const p of allProducts) vertCounts[p.vertical] = (vertCounts[p.vertical] || 0) + 1;
      const leadVerts = {};
      for (const l of allLeads) {
        const v = l.vertical_interest || 'unknown';
        leadVerts[v] = (leadVerts[v] || 0) + 1;
      }
      const findings = [];
      for (const v of Object.keys(leadVerts)) {
        const leads = leadVerts[v];
        const prods = vertCounts[v] || 0;
        if (leads >= 3 && prods === 0) {
          findings.push({ vertical: v, leads, products: prods, suggestion: 'underserved — consider targeted seller outreach' });
        }
      }
      return { ok: true, findings, total_leads: allLeads.length, total_products: allProducts.length };
    },
  }),
});

// ════════════════════════════════════════════════════════════
// REGISTRY ASSEMBLY
// ════════════════════════════════════════════════════════════

const ALL_TOOLS = Object.freeze({
  ...COMMERCE_TOOLS,
  ...MARKETING_TOOLS,
  ...SUPPORT_TOOLS,
  ...FINANCE_TOOLS,
  ...OPS_TOOLS,
  ...RND_TOOLS,
});

/** All tools belonging to a given agent. */
function toolsForAgent(agentId) {
  const list = {};
  for (const [name, def] of Object.entries(ALL_TOOLS)) {
    if (def.agent === agentId) list[name] = def;
  }
  return list;
}

/** Anthropic tool descriptor format — for the Claude API. */
function toolsForAnthropic(filter = null) {
  const out = [];
  for (const [name, def] of Object.entries(ALL_TOOLS)) {
    if (filter && def.agent !== filter) continue;
    out.push({ name, description: def.description, input_schema: def.schema });
  }
  return out;
}

/**
 * Execute a tool by name. State must be the live platform state map.
 * Returns:
 *   - { ok: true, result, mutating, autonomy, agent, executed_at, rollback?, profit_guard }
 *   - { ok: false, error, ... } on validation failure or tool error
 *   - { ok: false, error: 'denied_by_profit_guard', ... } if would cause loss
 *
 * The caller (orchestrator) is responsible for the HITL gate: for MANUAL-
 * autonomy tools, ensure founder approval BEFORE calling executeTool.
 *
 * If `opts.ledger` and `opts.sellerId` are provided, the profit guard runs.
 * - APPROVE: execution proceeds, cost recorded.
 * - WARN:    execution proceeds, cost recorded, founder is warned in result.
 * - DENY:    execution is blocked; result.ok === false.
 *
 * Pass `opts.bypassGuard=true` only for tests or platform-emergency ops.
 */
function executeTool(name, input, state, opts = {}) {
  const def = ALL_TOOLS[name];
  if (!def) return { ok: false, error: `Unknown tool: ${name}` };

  // Kill switch: when the founder has paused the engine, no autonomous tool runs.
  // Explicit founder/emergency overrides may still pass with opts.founderOverride.
  try {
    const engineControl = require('./engineControl');
    if (engineControl.isPaused() && !opts.founderOverride && !opts.bypassGuard) {
      return { ok: false, paused: true, error: 'Engine is paused by the founder — autonomous actions are halted. Resume to continue, or pass founderOverride for an explicit manual action.' };
    }
  } catch (e) { /* engineControl optional */ }

  let guardResult = null;
  if (opts.ledger && !opts.bypassGuard) {
    guardResult = profitGuard.canAfford({
      toolName: name,
      sellerId: opts.sellerId || null,
      archetype: opts.archetype || null,
      ledger: opts.ledger,
      sellerLookup: opts.sellerLookup || null,
      model: opts.model || 'opus_4',
    });
    if (guardResult.verdict === profitGuard.VERDICT.DENY) {
      return {
        ok: false,
        error: 'denied_by_profit_guard',
        reason: guardResult.reason,
        tool: name,
        agent: def.agent,
        profit_guard: guardResult,
      };
    }
  }

  try {
    const result = def.execute(input || {}, state || {});
    // Record cost in ledger (only if approved/warned, not denied — denied returned above)
    if (guardResult && opts.ledger) {
      opts.ledger.recordCost(
        opts.sellerId || '_platform',
        guardResult.projected_cost_paise,
        `tool:${name}`,
      );
    }
    return {
      ...result,
      tool: name,
      agent: def.agent,
      autonomy: def.autonomy,
      mutating: def.mutating,
      executed_at: Date.now(),
      profit_guard: guardResult,
    };
  } catch (e) {
    return {
      ok: false,
      tool: name,
      agent: def.agent,
      error: e.message,
      stack: e.stack ? e.stack.split('\n').slice(0, 3).join('\n') : null,
    };
  }
}

/** Surface every agent with its tool count + autonomy distribution. */
function inventory() {
  const out = {};
  for (const agentId of Object.keys(AGENT_REGISTRY)) {
    const tools = toolsForAgent(agentId);
    const names = Object.keys(tools);
    const autonomy = { auto: 0, notify: 0, manual: 0 };
    let mutating = 0;
    for (const t of Object.values(tools)) {
      autonomy[t.autonomy]++;
      if (t.mutating) mutating++;
    }
    out[agentId] = {
      ...AGENT_REGISTRY[agentId],
      tool_count: names.length,
      tool_names: names,
      autonomy,
      mutating,
    };
  }
  return out;
}

module.exports = {
  AUTONOMY,
  AGENT_REGISTRY,
  ALL_TOOLS,
  toolsForAgent,
  toolsForAnthropic,
  executeTool,
  inventory,
};
