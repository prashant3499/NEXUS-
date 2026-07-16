/**
 * EcoVenture AI — HITL Engine (Human-in-the-Loop)
 * Pure Node.js. The intelligent decision-routing system.
 *
 * Not a queue — a learning router. Decides what needs human review based on
 * 5 signals, presents AI-prepared context, learns from every override.
 */

'use strict';

/**
 * HITL rules. In production these live in platform_config.hitl_rules,
 * editable by admin with zero code change.
 */
const HITL_RULES = [
  { id: 'supplier_contract_high', trigger: 'supplier_contract', threshold: 100000,
    severity: 'high', desc: 'Supplier contract above ₹1L' },
  { id: 'price_change_large', trigger: 'price_change_pct', threshold: 20,
    severity: 'high', desc: 'Price change above 20% in 24h' },
  { id: 'fraud_score_high', trigger: 'fraud_score', threshold: 0.85,
    severity: 'high', desc: 'Fraud score above 0.85' },
  { id: 'payout_large', trigger: 'payout_amount', threshold: 50000,
    severity: 'high', desc: 'Payout above ₹50K — two-person sign-off' },
  { id: 'gi_confidence_low', trigger: 'gi_confidence', threshold: 90, direction: 'below',
    severity: 'med', desc: 'GI cert AI confidence below 90%' },
  { id: 'dgtr_notification', trigger: 'dgtr_alert', threshold: 1,
    severity: 'med', desc: 'DGTR duty change affecting subscribers' },
];

class HITLEngine {
  constructor() {
    this.queue = [];
    this.decisions = [];      // audit trail (append-only)
    this.overrideSignals = []; // learning signals
    this._id = 1;
  }

  /**
   * Evaluate whether an agent action needs human review.
   * Returns { needsReview, rule } — contextual routing (Layer 1).
   */
  evaluate(action) {
    for (const rule of HITL_RULES) {
      const value = action[rule.trigger];
      if (value === undefined) continue;
      const breached = rule.direction === 'below'
        ? value < rule.threshold
        : value >= rule.threshold;
      if (breached) return { needsReview: true, rule };
    }
    return { needsReview: false, rule: null };
  }

  /**
   * Queue an item for review with AI-prepared context (Layer 5).
   */
  enqueue(action, rule, context) {
    const item = {
      id: this._id++,
      agent: action.agent,
      action: action.description,
      severity: rule.severity,
      confidence: action.confidence || 0,
      rule_id: rule.id,
      ai_context: context,           // research done before human sees it
      ai_recommendation: action.recommendation || 'review',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    this.queue.push(item);
    return item;
  }

  /**
   * Human makes a decision. Logged immutably (Layer 7), learned from (Layer 6).
   */
  decide(itemId, decision, reason, decidedBy) {
    const item = this.queue.find((i) => i.id === itemId);
    if (!item) throw new Error(`HITL item ${itemId} not found`);
    if (item.status !== 'pending') throw new Error(`Item ${itemId} already ${item.status}`);

    // Two-person sign-off for high-severity payouts (Layer 4)
    if (item.severity === 'high' && item.rule_id === 'payout_large' && !decidedBy.includes('+')) {
      return { status: 'awaiting_second_signoff', message: 'High-value payout requires two approvers (format: "founder+CA")' };
    }

    item.status = decision; // 'approved' | 'rejected'
    item.decided_by = decidedBy;
    item.decided_at = new Date().toISOString();
    item.reason = reason;

    // Immutable audit record (Layer 7)
    const record = {
      item_id: itemId, agent: item.agent, action: item.action,
      ai_recommendation: item.ai_recommendation, human_decision: decision,
      reason, decided_by: decidedBy, at: item.decided_at,
    };
    this.decisions.push(Object.freeze(record));

    // Learning signal (Layer 6): did human override the AI?
    const overrode = (item.ai_recommendation === 'approve' && decision === 'rejected') ||
                     (item.ai_recommendation === 'reject' && decision === 'approved');
    if (overrode) {
      this.overrideSignals.push({
        rule_id: item.rule_id, agent: item.agent,
        ai_said: item.ai_recommendation, human_said: decision,
        reason, at: item.decided_at,
      });
    }

    // Remove from active queue
    this.queue = this.queue.filter((i) => i.id !== itemId);
    return { status: decision, record, was_override: overrode };
  }

  /** Override rate per agent — drift detection (Layer 3) */
  overrideRate(agent) {
    const agentDecisions = this.decisions.filter((d) => d.agent === agent);
    if (agentDecisions.length === 0) return 0;
    const overrides = this.overrideSignals.filter((s) => s.agent === agent);
    return overrides.length / agentDecisions.length;
  }

  /** Drift check — returns agents above 15% override threshold */
  driftCheck() {
    const agents = [...new Set(this.decisions.map((d) => d.agent))];
    return agents
      .map((a) => ({ agent: a, rate: this.overrideRate(a) }))
      .filter((x) => x.rate > 0.15);
  }

  pending() { return this.queue.filter((i) => i.status === 'pending'); }
  auditTrail() { return [...this.decisions]; }
}

module.exports = { HITLEngine, HITL_RULES };
