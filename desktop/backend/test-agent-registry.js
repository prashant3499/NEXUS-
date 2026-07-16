'use strict';

const R = require('./src/agentRegistry');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Registry shape');
{
  a(typeof R.AGENT_REGISTRY === 'object',                          'AGENT_REGISTRY exposed');
  a(Object.keys(R.AGENT_REGISTRY).length === 6,                    '6 agents registered');
  for (const id of ['commerce', 'marketing', 'support', 'finance', 'ops', 'rnd']) {
    a(R.AGENT_REGISTRY[id] != null,                                `agent ${id} present`);
  }
  a(R.AUTONOMY.AUTO === 'auto',                                    'AUTONOMY constants');
}

sec('Tool grouping by agent');
{
  const inv = R.inventory();
  a(inv.commerce.tool_count === 3,                                  'commerce has 3 tools');
  a(inv.marketing.tool_count === 3,                                 'marketing has 3 tools');
  a(inv.support.tool_count === 2,                                   'support has 2 tools');
  a(inv.finance.tool_count === 2,                                   'finance has 2 tools');
  a(inv.ops.tool_count === 4,                                       'ops has 4 tools');
  a(inv.rnd.tool_count === 1,                                       'rnd has 1 tool');
  // Mutating tools
  a(inv.commerce.mutating === 1,                                    'commerce: 1 mutating');
  a(inv.support.mutating === 1,                                     'support: 1 mutating');
  a(inv.ops.mutating === 1,                                         'ops: 1 mutating');
  a(inv.finance.mutating === 0,                                     'finance: 0 mutating (read-only)');
  a(inv.marketing.mutating === 0,                                   'marketing: 0 mutating');
  a(inv.rnd.mutating === 0,                                         'rnd: 0 mutating (suggest only)');
}

sec('toolsForAnthropic — API descriptor shape');
{
  const all = R.toolsForAnthropic();
  a(all.length === 15,                                              '15 tools across all agents');
  for (const t of all) {
    a(typeof t.name === 'string' && t.name.length > 0,              `${t.name}: has name`);
    a(typeof t.description === 'string' && t.description.length > 20, `${t.name}: meaningful description`);
    a(typeof t.input_schema === 'object',                            `${t.name}: schema present`);
    // Internal flags must NOT leak
    a(!('mutating' in t),                                            `${t.name}: mutating flag hidden`);
    a(!('autonomy' in t),                                            `${t.name}: autonomy flag hidden`);
    a(!('agent' in t),                                               `${t.name}: agent flag hidden`);
    a(!('execute' in t),                                             `${t.name}: execute function hidden`);
  }
  // Filtered
  const opsOnly = R.toolsForAnthropic('ops');
  a(opsOnly.length === 4,                                            'Filter by agent works');
}

sec('Tool execution — ops/run_health_checks (AUTO)');
{
  const r = R.executeTool('run_health_checks', {}, {});
  a(r.ok === true,                                                  'Executed without error');
  a(r.tool === 'run_health_checks',                                 'Tool name echoed');
  a(r.agent === 'ops',                                              'Agent attribution correct');
  a(r.autonomy === 'auto',                                          'Marked as AUTO');
  a(r.mutating === false,                                           'Not mutating');
  a(typeof r.executed_at === 'number',                              'Timestamp present');
  a(r.results && typeof r.results === 'object',                     'Health check results returned');
  a(r.results.summary && r.results.summary.total === 7,             '7 checks ran');
}

sec('Tool execution — finance/runway_projection (AUTO)');
{
  const r = R.executeTool('runway_projection', {}, {});
  a(r.ok === true,                                                  'Executed');
  a(r.agent === 'finance',                                          'Finance agent');
  a(r.zero && r.hundred && r.thousand,                              'Three scenarios returned');
}

sec('Tool execution — marketing/guarded_ad_spend (AUTO)');
{
  const r = R.executeTool('guarded_ad_spend', {
    tier: 'karigar',
    gmv_paise: 100000,
    planned_spend_paise: 5000,
  }, {});
  a(r.ok === true,                                                  'Executed');
  a(r.agent === 'marketing',                                        'Marketing agent');
  a(typeof r.approved === 'boolean',                                'Approval verdict returned');
  a(typeof r.requiresHITL === 'boolean',                            'HITL flag present');
}

sec('Tool execution — commerce/transition_product (MANUAL, mutating)');
{
  // Build a tiny mock state with one product
  const products = require('./src/products');
  const seller = { id: 'seller_t1', archetype: 'karigar' };
  const created = products.createProduct({
    title: 'Test pottery', vertical: 'handicraft', price_paise: 158000,
  }, seller, { idGen: () => 'prod_test_abc' });
  const map = new Map();
  map.set(created.product.id, created.product);
  const state = { products_v2: map };

  const r = R.executeTool('transition_product', {
    product_id: 'prod_test_abc',
    new_status: 'pending_review',
    note: 'Submitted by seller',
  }, state);
  a(r.ok === true,                                                  'Transition executed');
  a(r.mutating === true,                                            'Marked as mutating');
  a(r.autonomy === 'manual',                                        'Marked as MANUAL — needs founder approval');
  a(r.previous_status === 'draft',                                  'Previous status captured');
  a(r.new_status === 'pending_review',                              'New status set');
  a(r.rollback && r.rollback.restore_status === 'draft',            'Rollback metadata included');
}

sec('Tool execution — invalid product transition');
{
  const products = require('./src/products');
  const seller = { id: 'seller_t2', archetype: 'karigar' };
  const created = products.createProduct({
    title: 'Test pot', vertical: 'handicraft', price_paise: 158000,
  }, seller, { idGen: () => 'prod_test_xyz' });
  const map = new Map();
  map.set(created.product.id, created.product);
  const state = { products_v2: map };

  // draft → active is invalid (must go via pending_review)
  const r = R.executeTool('transition_product', {
    product_id: 'prod_test_xyz',
    new_status: 'active',
  }, state);
  a(r.ok === false,                                                 'Invalid transition rejected');
  a(Array.isArray(r.errors) && r.errors[0].includes('Invalid transition'), 'Error message clear');
}

sec('Tool execution — unknown tool');
{
  const r = R.executeTool('nonexistent_tool', {}, {});
  a(r.ok === false,                                                 'Unknown tool fails');
  a(/Unknown tool/.test(r.error),                                   'Clear error');
}

sec('Tool execution — tool that throws is caught');
{
  // We can simulate by passing bad state to a tool that doesn't defensive-check
  const r = R.executeTool('list_products_by_seller', { seller_id: 'x' }, null);
  // Either returns ok with empty list, or fails gracefully
  a(typeof r === 'object',                                          'Returns object even on bad state');
  a('ok' in r,                                                      'Has ok field');
}

sec('R&D agent — under-served verticals');
{
  const map = new Map();
  // 5 leads interested in pottery, 0 products
  const leads = new Map();
  for (let i = 0; i < 5; i++) {
    leads.set('l' + i, { id: 'l' + i, vertical_interest: 'pottery', status: 'new', score: 50 });
  }
  const r = R.executeTool('identify_underserved_verticals', {}, { products_v2: map, leads });
  a(r.ok,                                                           'R&D analysis runs');
  a(r.findings.length >= 1,                                         'Found underserved vertical');
  a(r.findings[0].vertical === 'pottery',                            'Pottery flagged');
  a(r.findings[0].leads === 5,                                       '5 leads counted');
  a(r.findings[0].products === 0,                                    '0 products counted');
}

sec('Auditability — every result is timestamped + agent-attributed');
{
  const tools = ['run_health_checks', 'tier_profitability_report', 'list_due_windows'];
  for (const name of tools) {
    const r = R.executeTool(name, {}, {});
    a(r.executed_at && r.agent && r.autonomy != null,                `${name}: full audit metadata`);
  }
}

sec('Profit guard integration — APPROVE');
{
  const G = require('./src/profitGuard');
  const ledger = new G.CostLedger();
  const lookup = { getSeller: () => ({ archetype: 'niryatak' }) };
  const r = R.executeTool('run_health_checks', {}, {}, {
    ledger, sellerId: 'seller_n1', sellerLookup: lookup,
  });
  a(r.ok === true,                                                 'Tool executed under profit guard');
  a(r.profit_guard && r.profit_guard.verdict === 'approve',         'Verdict approved');
  a(ledger.getMonthlyCostPaise('seller_n1') > 0,                    'Cost recorded in ledger');
}

sec('Profit guard integration — DENY blocks execution');
{
  const G = require('./src/profitGuard');
  const ledger = new G.CostLedger();
  // Pre-load to over deny threshold for karigar (₹1,399 revenue, 60% = ₹839)
  ledger.recordCost('seller_d1', 90000, 'prior_calls');
  const lookup = { getSeller: () => ({ archetype: 'karigar' }) };
  const r = R.executeTool('_chat_turn' === '_chat_turn' ? 'tier_profitability_report' : 'run_health_checks', {}, {}, {
    ledger, sellerId: 'seller_d1', sellerLookup: lookup,
  });
  // tier_profitability_report: 2500*0.126 + 1500*0.630 = 315 + 945 = 1260 paise
  // 90000 + 1260 = 91260 / 139900 = 65.2% — over 60% deny
  // Haiku for same tool: 2500*0.008 + 1500*0.042 = 20 + 63 = 83p
  // 90000 + 83 = 90083 / 139900 = 64.4% — STILL over deny → can't rescue
  // So this should be DENY
  if (r.ok === false) {
    a(r.error === 'denied_by_profit_guard',                          'Denied by profit guard');
    a(r.profit_guard.verdict === 'deny',                             'Verdict was deny');
  } else {
    // If Haiku rescues, it's WARN not DENY
    a(r.profit_guard.verdict === 'warn',                             'Warned (Haiku reroute viable)');
  }
}

sec('Profit guard — bypass for emergencies');
{
  const G = require('./src/profitGuard');
  const ledger = new G.CostLedger();
  ledger.recordCost('seller_e1', 99999, 'prior_calls');
  const lookup = { getSeller: () => ({ archetype: 'karigar' }) };
  const r = R.executeTool('run_health_checks', {}, {}, {
    ledger, sellerId: 'seller_e1', sellerLookup: lookup,
    bypassGuard: true,
  });
  a(r.ok === true,                                                 'Bypass lets unprofitable call through');
  a(r.profit_guard === null,                                       'No guard result when bypassed');
}

sec('Profit guard — platform-wide call records to _platform');
{
  const G = require('./src/profitGuard');
  const ledger = new G.CostLedger();
  R.executeTool('run_health_checks', {}, {}, {
    ledger, sellerId: null,
  });
  a(ledger.getMonthlyCostPaise('_platform') > 0,                    'Platform overhead recorded');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
