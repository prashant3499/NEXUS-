/**
 * UNIFIED — Agent Pipeline (sourcing → profit)
 * The 6 autonomous agents that run the business, each emitting events and
 * each gated by HITL at defined thresholds. Pure Node.js.
 *
 * This is the "box from sourcing to profit": every stage is an agent, every
 * risky action routes to a human, every routine action runs autonomously.
 */

'use strict';

const gemExportCompliance = require('./gemExportCompliance');

/** HITL tiers — the autonomy governance model. */
const HITL_TIER = {
  AUTO: 1,        // full auto — no human
  NOTIFY: 2,      // act, but notify; human can reverse
  MANDATORY: 3,   // must have human sign-off before acting
};

/**
 * The 6 agents, in pipeline order. Each declares what it does, what it emits,
 * and the conditions under which it escalates to a human.
 */
const AGENTS = {
  sourcing: {
    order: 1, label: 'Sourcing Agent',
    does: 'Auto-discovers merchants/products from public registries (Udyam, GI, GJEPC). Drafts profiles privately. Reverse-onboards via OTP+voice consent.',
    emits: ['merchant.drafted', 'product.drafted', 'onboarding.claimed'],
    escalate: (ctx) => ctx.newMerchantValue > 50000 || ctx.aiValidationErrors
      ? HITL_TIER.MANDATORY : HITL_TIER.AUTO,
    escalate_reason: 'New artisan onboarding > ₹50K, or AI validation errors on a manual entry.',
  },
  commerce: {
    order: 2, label: 'Commerce Agent',
    does: 'Dynamic pricing from market signals, AI catalog generation (multilingual via Bhashini), multi-channel listing, B2B2C white-label feeds.',
    emits: ['pricing.updated', 'catalog.generated', 'listing.published'],
    escalate: (ctx) => ctx.priceChangePct > 20 || ctx.newVertical
      ? HITL_TIER.NOTIFY : HITL_TIER.AUTO,
    escalate_reason: 'Price change > 20%, or activating a new vertical.',
  },
  finance: {
    order: 3, label: 'Finance Agent',
    does: 'Split invoicing (merchant GST + platform commission GST), TCS collection (GSTR-8), the transaction slicer, escrow-release triggers, P&L.',
    emits: ['invoice.generated', 'tcs.collected', 'payout.ready', 'pnl.updated'],
    escalate: (ctx) => ctx.amount > 200000 || ctx.refund > 5000
      ? HITL_TIER.MANDATORY : HITL_TIER.AUTO,
    escalate_reason: 'Any financial movement > ₹2L, or refund > ₹5K.',
  },
  compliance: {
    order: 4, label: 'Legal/Compliance Agent',
    does: 'Monitors DGFT/GST/GI feeds, drafts compliance docs, validates GI tags against IP India, tracks certificate expiry, regulatory alerts. Runs CITES/Kimberley/BIS preflight on every export listing.',
    emits: ['compliance.drafted', 'regulatory.alert', 'gi.verified', 'license.expiring', 'export.blocked', 'export.warning'],
    escalate: (ctx) => {
      // ALL government submissions need human sign-off; export blockers do too.
      if (ctx.exportBlocked) return HITL_TIER.MANDATORY;
      return HITL_TIER.MANDATORY;
    },
    escalate_reason: 'ALL government submissions, export blockers (CITES/Kimberley), disputes, and new regulatory interpretations.',
  },
  logistics: {
    order: 5, label: 'Logistics Agent',
    does: 'Carrier selection, label generation, EXIM doc prep (shipping bill, FEMA at RBI rate), GPS tracking, insurance binding.',
    emits: ['label.generated', 'tracking.updated', 'exim.prepared'],
    escalate: (ctx) => ctx.highValueShipment || ctx.customsHold
      ? HITL_TIER.MANDATORY : HITL_TIER.AUTO,
    escalate_reason: 'High-value shipments and customs holds.',
  },
  marketing: {
    order: 6, label: 'Marketing Agent',
    does: 'Auto-content + multilingual SEO, programmatic ads, artisan-story videos, tourism bundling, influencer matching. The digital promoter.',
    emits: ['content.generated', 'ad.launched', 'seo.indexed'],
    escalate: (ctx) => ctx.adBudget > ctx.budgetCap || ctx.brandSafetyFlag
      ? HITL_TIER.NOTIFY : HITL_TIER.AUTO,
    escalate_reason: 'Ad spend over budget cap, or brand-safety flag.',
  },
};

/**
 * Run a stage: returns the autonomy tier and whether a human is needed.
 * This is the orchestrator's core decision for each agent action.
 */
function runStage(agentKey, ctx = {}) {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);
  const tier = agent.escalate(ctx);
  return {
    agent: agent.label,
    autonomy: tier === HITL_TIER.AUTO ? 'auto' : tier === HITL_TIER.NOTIFY ? 'notify_and_proceed' : 'mandatory_human',
    needs_human: tier === HITL_TIER.MANDATORY,
    reversible: tier === HITL_TIER.NOTIFY,
    emits: agent.emits,
    reason: tier === HITL_TIER.AUTO ? 'Routine — fully autonomous' : agent.escalate_reason,
  };
}

/** The full pipeline, in order — sourcing to profit. */
function pipeline() {
  return Object.entries(AGENTS)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, a]) => ({ key, order: a.order, label: a.label, does: a.does, emits: a.emits }));
}

/**
 * Compliance Agent — operational preflight.
 *
 * Calls gemExportCompliance.preflightExport() on a product about to be
 * listed for export, then emits the right agent events. Returns:
 *   { decision: 'allow'|'block'|'warn', blockers, warnings, events, hitlTier }
 *
 * If blockers exist → emits 'export.blocked', HITL MANDATORY.
 * If warnings only  → emits 'export.warning', HITL AUTO (proceed).
 * Else              → no event, HITL AUTO.
 *
 * This is what completes the agent: the Compliance Agent now actually
 * does compliance work, not just declares it would.
 */
function preflightCompliance(product = {}) {
  const result = gemExportCompliance.preflightExport(product);
  const events = [];
  if (!result.allowed) {
    events.push({
      type: 'export.blocked',
      product_ref: product.id || product.sku || product.title || null,
      blockers: result.blockers,
      at: Date.now(),
    });
  } else if (result.warnings.length > 0) {
    events.push({
      type: 'export.warning',
      product_ref: product.id || product.sku || product.title || null,
      warnings: result.warnings,
      at: Date.now(),
    });
  }
  // Decision matches the agent's escalation contract
  const stage = runStage('compliance', { exportBlocked: !result.allowed });
  return {
    decision: result.allowed ? (result.warnings.length > 0 ? 'warn' : 'allow') : 'block',
    allowed: result.allowed,
    blockers: result.blockers,
    warnings: result.warnings,
    checks: result.checks,
    events,
    hitlTier: result.allowed ? HITL_TIER.AUTO : HITL_TIER.MANDATORY,
    agent: stage.agent,
  };
}

module.exports = { AGENTS, HITL_TIER, runStage, pipeline, preflightCompliance };
