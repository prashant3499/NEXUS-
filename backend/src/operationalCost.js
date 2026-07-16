/**
 * NEXUS — SaaS Operational Cost Baseline.
 *
 * Honest numbers for what it costs to run NEXUS at three scales.
 * These are the inputs the unitEconomics cost ledger should be
 * populated with as the platform actually runs.
 *
 * All amounts in paise (integer). All assumptions documented inline
 * so the founder can update any single number without re-deriving
 * the whole model.
 *
 * Three scenarios:
 *   1) ZERO customers   — today's reality, dev + pre-launch
 *   2) 100 subscribers  — early traction, mostly Vyapari
 *   3) 1000 subscribers — break-out scale, mixed tier mix
 *
 * The 100-customer scenario is when we EXPECT to validate the unit
 * economics. The 1000-customer scenario is when we MUST have
 * Postgres + multi-region hosting + monitoring upgraded.
 */

'use strict';

// ────────────────────────────────────────────────────────────
// COST ASSUMPTIONS — each line is one honest input
// ────────────────────────────────────────────────────────────

const ASSUMPTIONS = {
  // Domain + SSL: ~₹1,000/yr for .com or .in; SSL via Let's Encrypt free
  domain_monthly_paise: 8500,                  // ₹85/mo amortised

  // Hosting tiers — actual prices from Railway/Render/Fly as of 2026
  hosting_dev_paise: 0,                         // free tier covers dev
  hosting_100_paise: 200000,                    // ₹2,000/mo — Hobby plan
  hosting_1000_paise: 800000,                   // ₹8,000/mo — Pro plan w/ workers

  // Anthropic API: $3/M input + $15/M output for Sonnet; $0.25/M + $1.25/M for Haiku
  // Mix: 30% Sonnet (catalog, ads, complex reasoning) + 70% Haiku (support, simple queries)
  // Average call: 3,000 tokens (1,500 in + 1,500 out)
  // Per-call cost: Sonnet ₹1.50 + Haiku ₹0.16 → weighted ~₹0.56/call
  llm_dev_calls_per_mo: 1000,                   // dev + testing
  llm_active_calls_per_seller_per_day: 10,      // catalog updates, ad creative, support
  llm_cost_per_call_paise: 56,                  // ~₹0.56 weighted average

  // Bhashini: FREE for Indic languages (MeitY API)
  bhashini_monthly_paise: 0,

  // Email — SES at ₹0.05/email; we use Resend free tier (3K/mo) initially
  email_per_message_paise: 5,                   // ₹0.05 per email
  emails_per_seller_per_mo: 20,                 // welcome + transactional + drip

  // Database: file store works to ~500 customers, then managed Postgres needed
  db_dev_paise: 0,
  db_100_paise: 0,                              // file store still works
  db_1000_paise: 200000,                        // ₹2,000/mo managed Postgres

  // Monitoring + logging
  monitoring_dev_paise: 0,
  monitoring_100_paise: 0,                      // Grafana Cloud / Better Uptime free tier
  monitoring_1000_paise: 400000,                // ₹4,000/mo when free tier exhausted

  // CDN
  cdn_dev_paise: 0,
  cdn_100_paise: 0,                             // Cloudflare free
  cdn_1000_paise: 180000,                       // ₹1,800/mo Cloudflare Pro

  // Backups + DR (object storage + scheduled snapshots)
  backups_dev_paise: 0,
  backups_100_paise: 0,
  backups_1000_paise: 150000,                   // ₹1,500/mo

  // GitHub Actions — 2,000 minutes/mo free, sufficient even at 1000 customers
  cicd_monthly_paise: 0,

  // Razorpay: NOT a fixed cost — variable per transaction (2.3%)
  // Already modeled in slicer per-transaction; not in operational base.

  // Tier mix at 1000 customers (matches subscriptionPromotion targets)
  tier_mix_1000: {
    karigar:  { count: 600, subPaise:  49900 },
    vyapari:  { count: 300, subPaise: 249900 },
    pravasi:  { count:  80, subPaise: 199900 },
    niryatak: { count:  20, subPaise: 799900 },
  },
};

// ────────────────────────────────────────────────────────────
// SCENARIO CALCULATIONS
// ────────────────────────────────────────────────────────────

/**
 * @param {object} A - ASSUMPTIONS (allows overrides for sensitivity analysis)
 */
function scenarioZero(A = ASSUMPTIONS) {
  const llm = A.llm_dev_calls_per_mo * A.llm_cost_per_call_paise;
  const lines = [
    { item: 'Domain + SSL',          amountPaise: A.domain_monthly_paise,        category: 'infra' },
    { item: 'Hosting (free tier)',    amountPaise: A.hosting_dev_paise,           category: 'infra' },
    { item: 'Anthropic API (dev)',    amountPaise: llm,                            category: 'inference' },
    { item: 'Bhashini',               amountPaise: A.bhashini_monthly_paise,      category: 'inference' },
    { item: 'GitHub Actions',         amountPaise: A.cicd_monthly_paise,          category: 'people' },
    { item: 'Database (file store)',  amountPaise: A.db_dev_paise,                category: 'infra' },
    { item: 'Monitoring (free)',      amountPaise: A.monitoring_dev_paise,        category: 'infra' },
    { item: 'CDN (free)',             amountPaise: A.cdn_dev_paise,               category: 'infra' },
    { item: 'Email (free tier)',      amountPaise: 0,                              category: 'support' },
  ];
  return summarise('zero_customers', lines, 0);
}

function scenario100(A = ASSUMPTIONS) {
  // Assume 100 Vyapari subscribers at ₹2,499/mo
  const revenuePaise = 100 * 249900;
  // LLM: 100 sellers × 10 calls/day × 30 days
  const llmCalls = 100 * A.llm_active_calls_per_seller_per_day * 30;
  const llm = llmCalls * A.llm_cost_per_call_paise;
  const emails = 100 * A.emails_per_seller_per_mo * A.email_per_message_paise;
  const lines = [
    { item: 'Domain + SSL',           amountPaise: A.domain_monthly_paise,        category: 'infra' },
    { item: 'Hosting (Hobby plan)',    amountPaise: A.hosting_100_paise,           category: 'infra' },
    { item: 'Anthropic API',           amountPaise: llm,                            category: 'inference' },
    { item: 'Bhashini',                amountPaise: A.bhashini_monthly_paise,      category: 'inference' },
    { item: 'GitHub Actions',          amountPaise: A.cicd_monthly_paise,          category: 'people' },
    { item: 'Database (file store)',   amountPaise: A.db_100_paise,                category: 'infra' },
    { item: 'Monitoring (free tier)',  amountPaise: A.monitoring_100_paise,        category: 'infra' },
    { item: 'CDN (Cloudflare free)',   amountPaise: A.cdn_100_paise,               category: 'infra' },
    { item: 'Email (transactional)',   amountPaise: emails,                         category: 'support' },
    { item: 'Backups',                 amountPaise: A.backups_100_paise,           category: 'infra' },
  ];
  return summarise('100_customers', lines, revenuePaise, { llm_calls: llmCalls });
}

function scenario1000(A = ASSUMPTIONS) {
  // Mixed tier mix
  const mix = A.tier_mix_1000;
  const revenuePaise = Object.values(mix).reduce((s, t) => s + t.count * t.subPaise, 0);
  const totalSellers = Object.values(mix).reduce((s, t) => s + t.count, 0);
  // LLM scales with active sellers
  const llmCalls = totalSellers * A.llm_active_calls_per_seller_per_day * 30;
  const llm = llmCalls * A.llm_cost_per_call_paise;
  // Higher tiers send more email (more orders, more notifications)
  const emails = totalSellers * (A.emails_per_seller_per_mo + 5) * A.email_per_message_paise;
  const lines = [
    { item: 'Domain + SSL',            amountPaise: A.domain_monthly_paise,        category: 'infra' },
    { item: 'Hosting (Pro plan)',       amountPaise: A.hosting_1000_paise,          category: 'infra' },
    { item: 'Managed Postgres',         amountPaise: A.db_1000_paise,               category: 'infra' },
    { item: 'Anthropic API',            amountPaise: llm,                            category: 'inference' },
    { item: 'Bhashini',                 amountPaise: A.bhashini_monthly_paise,      category: 'inference' },
    { item: 'GitHub Actions',           amountPaise: A.cicd_monthly_paise,          category: 'people' },
    { item: 'Monitoring (Grafana Pro)', amountPaise: A.monitoring_1000_paise,       category: 'infra' },
    { item: 'CDN (Cloudflare Pro)',     amountPaise: A.cdn_1000_paise,              category: 'infra' },
    { item: 'Email (transactional)',    amountPaise: emails,                         category: 'support' },
    { item: 'Backups + DR',             amountPaise: A.backups_1000_paise,          category: 'infra' },
  ];
  return summarise('1000_customers', lines, revenuePaise, { llm_calls: llmCalls, sellers: totalSellers });
}

/**
 * Summarise a scenario into total cost, breakdown by category, and
 * margin vs revenue.
 */
function summarise(scenario, lines, revenuePaise, meta = {}) {
  const total = lines.reduce((s, l) => s + l.amountPaise, 0);
  const byCategory = lines.reduce((acc, l) => {
    acc[l.category] = (acc[l.category] || 0) + l.amountPaise;
    return acc;
  }, {});
  const grossMarginPct = revenuePaise > 0
    ? Math.round(((revenuePaise - total) / revenuePaise) * 1000) / 10
    : null;
  const opexPctOfRevenue = revenuePaise > 0
    ? Math.round((total / revenuePaise) * 1000) / 10
    : null;
  return {
    scenario,
    revenuePaise,
    totalCostPaise: total,
    grossMarginPaise: revenuePaise - total,
    grossMarginPct,
    opexPctOfRevenue,
    byCategory,
    lines,
    meta,
  };
}

/**
 * Run all three scenarios. Returns the full operational cost baseline
 * that gets fed into the cost ledger as a forecast.
 */
function baseline() {
  return [scenarioZero(), scenario100(), scenario1000()];
}

/**
 * Populate a unitEconomics cost ledger with the scenario's costs, so the
 * cost ledger reflects realistic forecast operational spend. Used for
 * what-if analysis in the founder console.
 */
function populateLedger(ledger, scenario) {
  if (!ledger || typeof ledger.logCost !== 'function') {
    throw new Error('ledger must be a unitEconomics ledger instance');
  }
  if (!scenario || !Array.isArray(scenario.lines)) {
    throw new Error('scenario must be a result of scenarioZero/100/1000');
  }
  const now = Date.now();
  for (const line of scenario.lines) {
    if (line.amountPaise > 0) {
      ledger.logCost({
        category: line.category,
        amountPaise: line.amountPaise,
        ref: `${scenario.scenario}:${line.item.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        at: now,
        meta: { source: 'cost-baseline', scenario: scenario.scenario, item: line.item },
      });
    }
  }
  return scenario;
}

module.exports = {
  ASSUMPTIONS,
  scenarioZero, scenario100, scenario1000,
  baseline, populateLedger,
};
