/**
 * UNIFIED — Self-Improving Cost Engine
 * Merges NEXUS's phase-aware guard + cost-descending inference router into the
 * EcoVenture core. Pure Node.js. The piece that makes the 2% ceiling real
 * WITHOUT blocking the cold start.
 *
 * Money in paise (integer). All thresholds configurable (living-platform principle).
 */

'use strict';

const REVENUE_FLOOR_PAISE   = 100000_00;  // ₹1L/mo — below this, use carve-out not %
const PHASE0_CARVEOUT_PAISE = 200000_00;  // ₹2L bootstrap runway
const CEILING_PCT           = 0.02;       // 2% of trailing-30-day revenue
const API_MONTHLY_CAP_PAISE = 30000_00;   // ₹30K hard cap on API overflow

/**
 * The self-improving cost engine. Tracks every task's cost, enforces the
 * phase-aware ceiling, routes inference cheapest-first, and surfaces its own
 * optimisation proposals.
 */
class CostEngine {
  constructor(cfg = {}) {
    this.cfg = {
      revenueFloor: REVENUE_FLOOR_PAISE,
      phase0Carveout: PHASE0_CARVEOUT_PAISE,
      ceilingPct: CEILING_PCT,
      apiMonthlyCap: API_MONTHLY_CAP_PAISE,
      ...cfg,
    };
    this.ledger = [];            // per-task cost records (append-only)
    this.phase0Spent = 0;
    this.apiSpentThisMonth = 0;
  }

  /**
   * Phase-aware spend guard (fix F6). Returns whether a proposed spend is allowed.
   * Cold start uses a fixed carve-out; steady state uses the 2% ceiling.
   */
  canSpend(proposedPaise, ctx = {}) {
    const monthlyRevenue = ctx.monthlyRevenue || 0;

    // COLD START: revenue below floor → use fixed carve-out, ignore the % entirely
    if (monthlyRevenue < this.cfg.revenueFloor) {
      const allowed = (this.phase0Spent + proposedPaise) <= this.cfg.phase0Carveout;
      return {
        allowed, basis: 'phase0_carveout',
        remaining: this.cfg.phase0Carveout - this.phase0Spent,
        reason: allowed
          ? 'Within bootstrap runway — the 2% ceiling does not apply pre-revenue.'
          : 'Bootstrap runway exhausted. Raise revenue or extend carve-out via founder decision.',
      };
    }

    // STEADY STATE: 2% of trailing-30-day revenue
    const ceiling = Math.floor((ctx.trailingRevenue || 0) * this.cfg.ceilingPct);
    const trailingOpex = ctx.trailingOpex || 0;
    if ((trailingOpex + proposedPaise) > ceiling) {
      return {
        allowed: false, basis: '2pct_ceiling', ceiling,
        shortfall: trailingOpex + proposedPaise - ceiling,
        action: 'queue_founder_hitl',
        reason: `Spend would breach the 2% ceiling (₹${ceiling/100}). Queued for founder decision with exact math.`,
      };
    }
    return { allowed: true, basis: '2pct_ceiling', ceiling, headroom: ceiling - trailingOpex - proposedPaise };
  }

  /**
   * Cost-descending inference router. Always tries the cheapest viable path:
   * Bhashini (free, Indic) → self-hosted GPU (free) → API overflow (capped) → defer.
   */
  routeInference(task, ctx = {}) {
    // 1. Indic language task → Bhashini (free government AI)
    if (task.isIndic && ctx.bhashiniUp !== false) {
      return { path: 'bhashini', costPaise: 0, note: 'Free Indic inference' };
    }
    // 2. Self-hosted GPU if queue is healthy (8B model on owned hardware)
    if ((ctx.gpuQueueDepth || 0) < (ctx.gpuQueueMax || 8)) {
      return { path: 'self_hosted_gpu', costPaise: 0, note: 'Owned GPU, zero marginal cost' };
    }
    // 3. API overflow, only if under the monthly cap
    var _cap = (typeof this.cfg.capResolver === 'function') ? this.cfg.capResolver() : this.cfg.apiMonthlyCap;
    if (this.apiSpentThisMonth < _cap) {
      return { path: 'api_overflow', costPaise: task.estPaise || 0, note: 'Capped API overflow' };
    }
    // 4. Cap hit → defer to GPU queue rather than spend
    return { path: 'queue_until_gpu_free', costPaise: 0, deferred: true, note: 'API cap reached; deferring' };
  }

  /** Record a task's actual cost. Pass-through costs never count as platform opex (fix). */
  record(task, path, costPaise, isPassThrough = false) {
    const entry = Object.freeze({
      task, path, cost_paise: costPaise,
      pass_through: isPassThrough,
      at: new Date().toISOString(),
    });
    this.ledger.push(entry);
    if (!isPassThrough) {
      if (path === 'api_overflow') this.apiSpentThisMonth += costPaise;
      // phase0Spent tracks platform opex during cold start
      this.phase0Spent += costPaise;
    }
    return entry;
  }

  /**
   * Self-improvement: surface the most expensive task types and propose fixes.
   * This is what makes the engine "self-improving" — it audits its own ledger.
   */
  proposeOptimisations() {
    const byTask = {};
    for (const e of this.ledger) {
      if (e.pass_through || e.cost_paise === 0) continue;
      byTask[e.task] = (byTask[e.task] || 0) + e.cost_paise;
    }
    const ranked = Object.entries(byTask).sort((a, b) => b[1] - a[1]);
    return ranked.slice(0, 5).map(([task, total]) => ({
      task, total_paise: total,
      proposal: this._suggestionFor(task),
    }));
  }

  _suggestionFor(task) {
    if (/embed/i.test(task)) return 'Cache embeddings — identical product descriptions re-embed needlessly.';
    if (/transcri|whisper|voice/i.test(task)) return 'Batch Whisper calls; route Indic voice to Bhashini first.';
    if (/translat/i.test(task)) return 'Route all translation to Bhashini (free) before any API.';
    if (/draft|describe|catalog/i.test(task)) return 'Use the 8B self-hosted model; reserve API for genuinely hard reasoning only.';
    return 'Review whether this task can move to Bhashini or the self-hosted GPU.';
  }

  /** Effective OpEx % against revenue — the metric the founder watches */
  opexRatio(trailingRevenue) {
    if (!trailingRevenue) return null;
    const platformOpex = this.ledger
      .filter(e => !e.pass_through)
      .reduce((s, e) => s + e.cost_paise, 0);
    return platformOpex / trailingRevenue;
  }
}

module.exports = { CostEngine, REVENUE_FLOOR_PAISE, PHASE0_CARVEOUT_PAISE };
