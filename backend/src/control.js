/**
 * UNIFIED — Founder-in-the-Loop Control Plane
 * Makes HITL REAL: actions that need review actually HOLD until the founder
 * decides. Adds the founder's control surface — pending queue, decisions with
 * immutable trail, agent kill-switches, force-review rules, editable thresholds,
 * and two-person sign-off for high value. Pure Node.js.
 */

'use strict';

const crypto = require('crypto');

/** Founder-editable thresholds (the no-code promise — these live in config, not code). */
const DEFAULT_THRESHOLDS = {
  finance_mandatory_paise: 200000_00,   // money moves above ₹2L → founder
  onboarding_mandatory_paise: 50000_00, // new seller value above ₹50K → founder
  logistics_mandatory_paise: 100000_00, // shipment above ₹1L → founder
  price_change_notify_pct: 20,          // price change above 20% → notify
  two_person_paise: 50000_00,           // payout above ₹50K → two approvers
};

class ControlPlane {
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.pending = [];          // actions HELD awaiting founder decision
    this.decisions = [];        // immutable decision trail
    this.pausedAgents = new Set(); // founder kill-switch per agent
    this.forceReview = new Set();  // categories the founder forces to manual
    this._seq = 1;
  }

  /**
   * Gate an action. Returns {held:true} if it must wait for the founder, or
   * {held:false} if it may proceed autonomously. A held action does NOT run
   * until decide() approves it.
   */
  gate(action) {
    const reasons = [];

    // Founder kill-switch: a paused agent holds everything
    if (this.pausedAgents.has(action.agent)) {
      reasons.push(`${action.agent} is paused by the founder`);
    }
    // Founder force-review on a category
    if (action.category && this.forceReview.has(action.category)) {
      reasons.push(`Founder forces review of all "${action.category}" actions`);
    }
    // Compliance / government submissions ALWAYS need a human
    if (action.agent === 'Compliance' || action.govSubmission) {
      reasons.push('Government submission — always founder-reviewed');
    }
    // Money thresholds
    if (action.agent === 'Finance' && action.amountPaise >= this.thresholds.finance_mandatory_paise) {
      reasons.push(`Money move ₹${(action.amountPaise/100).toLocaleString('en-IN')} ≥ ₹2L gate`);
    }
    if (action.agent === 'Sourcing' && action.amountPaise >= this.thresholds.onboarding_mandatory_paise) {
      reasons.push(`New seller value ≥ ₹50K gate`);
    }
    if (action.agent === 'Logistics' && action.amountPaise >= this.thresholds.logistics_mandatory_paise) {
      reasons.push(`Shipment value ≥ ₹1L gate`);
    }

    if (reasons.length === 0) return { held: false };

    const item = {
      id: `hitl_${this._seq++}`,
      agent: action.agent,
      summary: action.summary,
      amountPaise: action.amountPaise || 0,
      reasons,
      ai_recommendation: action.recommendation || 'review',
      needs_two_person: (action.amountPaise || 0) >= this.thresholds.two_person_paise,
      approvals: [],
      status: 'pending',
      created_at: new Date().toISOString(),
      resume: action.resume || null, // a function/marker to run on approval
    };
    this.pending.push(item);
    return { held: true, item };
  }

  /** Founder decides on a held item. Enforces two-person sign-off for high value. */
  decide(itemId, decision, founder, reason) {
    const item = this.pending.find(i => i.id === itemId);
    if (!item) throw new Error(`No pending item ${itemId}`);
    if (item.status !== 'pending') throw new Error(`Item already ${item.status}`);

    if (item.needs_two_person && decision === 'approved') {
      item.approvals.push(founder);
      if (new Set(item.approvals).size < 2) {
        return { status: 'awaiting_second', message: `High-value — needs a 2nd approver (have: ${[...new Set(item.approvals)].join(', ')})` };
      }
    }

    item.status = decision; // 'approved' | 'rejected'
    item.decided_by = item.needs_two_person ? [...new Set(item.approvals)] : [founder];
    item.decided_at = new Date().toISOString();
    item.decision_reason = reason || '';

    // Immutable, hash-chained decision record
    const prevHash = this.decisions.length ? this.decisions[this.decisions.length-1].hash : 'genesis';
    const payload = `${item.id}|${decision}|${item.decided_by.join('+')}|${item.decided_at}|${prevHash}`;
    const record = Object.freeze({
      item_id: item.id, agent: item.agent, summary: item.summary,
      ai_recommendation: item.ai_recommendation, decision,
      decided_by: item.decided_by, reason: reason || '', at: item.decided_at,
      was_override: (item.ai_recommendation === 'approve' && decision === 'rejected') ||
                    (item.ai_recommendation === 'reject' && decision === 'approved'),
      prev_hash: prevHash,
      hash: crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16),
    });
    this.decisions.push(record);
    this.pending = this.pending.filter(i => i.id !== itemId);
    return { status: decision, record, resume: decision === 'approved' ? item.resume : null };
  }

  /** Founder controls */
  pauseAgent(agent) { this.pausedAgents.add(agent); return [...this.pausedAgents]; }
  resumeAgent(agent) { this.pausedAgents.delete(agent); return [...this.pausedAgents]; }
  setForceReview(category, on) { on ? this.forceReview.add(category) : this.forceReview.delete(category); return [...this.forceReview]; }
  setThreshold(key, value) { if (!(key in this.thresholds)) throw new Error(`Unknown threshold ${key}`); this.thresholds[key] = value; return this.thresholds[key]; }

  /** Verify the decision trail hasn't been tampered with */
  verifyTrail() {
    let prev = 'genesis';
    for (const r of this.decisions) {
      const payload = `${r.item_id}|${r.decision}|${r.decided_by.join('+')}|${r.at}|${prev}`;
      const expect = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
      if (r.hash !== expect || r.prev_hash !== prev) return { valid: false, brokenAt: r.item_id };
      prev = r.hash;
    }
    return { valid: true, count: this.decisions.length };
  }

  overrideRate() {
    if (!this.decisions.length) return 0;
    return this.decisions.filter(d => d.was_override).length / this.decisions.length;
  }
}

module.exports = { ControlPlane, DEFAULT_THRESHOLDS };
