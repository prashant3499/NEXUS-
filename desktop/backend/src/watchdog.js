'use strict';

/**
 * watchdog.js
 *
 * The platform's self-monitoring agent. NEXUS has hard invariants — never-in-
 * loss, consent-before-sale, child-safety, payout integrity, pricing floors,
 * grievance SLAs. Each is enforced at its own boundary, but boundaries can be
 * bypassed by bugs, bad data, or a change that didn't account for them. The
 * watchdog is the independent check: it scans the LIVE state and asks, of each
 * invariant, "is this actually still true right now?"
 *
 * It does not fix things — it FLAGS them, severity-ranked, with the evidence and
 * a recommended action, for the founder / AI to decide (human-in-the-loop). It
 * also keeps a short history of each scan so you can see whether the platform is
 * getting healthier or worse over time — the "improve in future" loop.
 *
 * Pure + dependency-free at its core: the server gathers live state and the
 * verdict functions from the real modules, and passes them in. The watchdog
 * orchestrates the checks and shapes the report.
 */

const SEVERITY = Object.freeze({ OK: 'ok', WATCH: 'watch', CRITICAL: 'critical' });
const SEV_RANK = { critical: 0, watch: 1, ok: 2 };

const CATEGORY = Object.freeze({
  SOLVENCY: 'solvency', CONSENT: 'consent', CHILD_SAFETY: 'child_safety',
  PAYOUT: 'payout', PRICING: 'pricing', GRIEVANCE: 'grievance',
  DATA: 'data', SYSTEM: 'system',
});

function _f(severity, category, rule, message, evidence, recommendation) {
  return { severity, category, rule, message, evidence: evidence || null, recommendation: recommendation || null };
}

/**
 * The check suite. Each check receives the live `state` (+ injected verdict
 * helpers) and returns zero or more findings. A check that finds nothing wrong
 * returns a single OK finding so the report shows what was verified.
 *
 * Expected `state` shape (all optional — a check degrades to OK if data absent):
 *   pnl            { net_profit_paise, margin_pct }   from profitGuard.platformPnL
 *   sellers        [{ id, archetype, status, age, guardian }]
 *   activeListings [{ id, seller_id }]
 *   consentOf(id)  -> consent record (or null)         canSell helper
 *   canSell(rec)   -> { ok, missing }
 *   guardianOf(id) -> arrangement (or null)
 *   orders         [{ id, total_paise, splits:[{amount_paise}], state }]
 *   pricing        { tier: { price_paise } }
 *   floors         { tier: floor_paise }
 *   grievances     [{ id, status, slaAckBy, acknowledgedAt, slaResolveBy, resolvedAt }]
 *   health         { overallHealth, results }          operations.runHealthChecks
 */
const CHECKS = [
  // 1. Never-in-loss — the platform must not be operating at a loss.
  function solvency(state) {
    const pnl = state.pnl;
    if (!pnl) return [_f(SEVERITY.OK, CATEGORY.SOLVENCY, 'never-in-loss', 'No P&L yet (pre-revenue).')];
    // Pre-revenue: if there's no revenue yet, a negative number is sunk
    // build/inference cost, not an operating loss on real transactions. The
    // never-in-loss invariant governs transactions, not pre-launch burn.
    if (!pnl.total_revenue_paise || pnl.total_revenue_paise === 0) {
      return [_f(SEVERITY.OK, CATEGORY.SOLVENCY, 'never-in-loss', 'Pre-revenue — no transactions yet, so the never-in-loss rule has nothing to violate. (Pre-launch costs are expected.)')];
    }
    if (pnl.net_profit_paise < 0) {
      return [_f(SEVERITY.CRITICAL, CATEGORY.SOLVENCY, 'never-in-loss',
        'The platform is operating at a LOSS on real revenue.',
        { net_profit_rupees: Math.round(pnl.net_profit_paise / 100), margin_pct: pnl.margin_pct },
        'Stop discounting / re-check pricing floors and inference spend immediately.')];
    }
    if (pnl.margin_pct != null && pnl.margin_pct < 20) {
      return [_f(SEVERITY.WATCH, CATEGORY.SOLVENCY, 'never-in-loss',
        'Margin is thin — solvency buffer is low.',
        { margin_pct: pnl.margin_pct }, 'Review cost-to-serve, especially AI inference.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.SOLVENCY, 'never-in-loss', `Positive margin (${pnl.margin_pct}%).`)];
  },

  // 2. Consent-before-sale — every active listing's seller must have consented.
  function consent(state) {
    if (!state.activeListings || !state.canSell || !state.consentOf) {
      return [_f(SEVERITY.OK, CATEGORY.CONSENT, 'consent-before-sale', 'No active listings to check.')];
    }
    const offenders = [];
    for (const l of state.activeListings) {
      const rec = state.consentOf(l.seller_id);
      const verdict = rec ? state.canSell(rec) : { ok: false, missing: ['all'] };
      if (!verdict.ok) offenders.push({ listing: l.id, seller: l.seller_id, missing: verdict.missing });
    }
    if (offenders.length) {
      return [_f(SEVERITY.CRITICAL, CATEGORY.CONSENT, 'consent-before-sale',
        `${offenders.length} active listing(s) without complete seller consent.`,
        { offenders: offenders.slice(0, 5) },
        'Take these listings down until consent + selling authorization is granted.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.CONSENT, 'consent-before-sale', `All ${state.activeListings.length} active listings have seller consent.`)];
  },

  // 3. Child-safety — no minor transacting without a verified guardian.
  function childSafety(state) {
    if (!state.sellers) return [_f(SEVERITY.OK, CATEGORY.CHILD_SAFETY, 'child-safety', 'No sellers to check.')];
    const offenders = [];
    for (const s of state.sellers) {
      if (s.status === 'active' || s.status === undefined) {
        const age = s.age;
        const hasGuardian = state.guardianOf ? !!state.guardianOf(s.id) : !!s.guardian;
        // Flag: known minor with no guardian, OR active seller with unknown age.
        if (age != null && age < 18 && !hasGuardian) {
          offenders.push({ seller: s.id, reason: 'minor without guardian' });
        } else if (age == null && !hasGuardian) {
          offenders.push({ seller: s.id, reason: 'active seller with undeclared age' });
        }
      }
    }
    if (offenders.length) {
      return [_f(SEVERITY.CRITICAL, CATEGORY.CHILD_SAFETY, 'child-safety',
        `${offenders.length} seller(s) fail the child-safety gate.`,
        { offenders: offenders.slice(0, 5) },
        'Suspend transacting for these sellers until age is declared and (if a minor) a verified guardian is attached.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.CHILD_SAFETY, 'child-safety', 'All sellers pass the child-safety gate.')];
  },

  // 4. Payout integrity — every order's splits must sum exactly to the total.
  function payout(state) {
    if (!state.orders || !state.orders.length) return [_f(SEVERITY.OK, CATEGORY.PAYOUT, 'payout-integrity', 'No orders to check.')];
    const broken = [];
    for (const o of state.orders) {
      if (!Array.isArray(o.splits)) continue;
      const sum = o.splits.reduce((a, s) => a + (s.amount_paise || 0), 0);
      if (o.total_paise != null && sum !== o.total_paise) {
        broken.push({ order: o.id, total: o.total_paise, split_sum: sum, diff: o.total_paise - sum });
      }
    }
    if (broken.length) {
      return [_f(SEVERITY.CRITICAL, CATEGORY.PAYOUT, 'payout-integrity',
        `${broken.length} order(s) where the money split does not reconcile to the total.`,
        { broken: broken.slice(0, 5) }, 'Halt settlement on these and reconcile — money must never be created or lost in a split.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.PAYOUT, 'payout-integrity', `All ${state.orders.length} orders reconcile to the paise.`)];
  },

  // 5. Pricing floors — no tier priced below its cost-to-serve.
  function pricing(state) {
    if (!state.pricing || !state.floors) return [_f(SEVERITY.OK, CATEGORY.PRICING, 'pricing-floor', 'No pricing to check.')];
    const below = [];
    for (const [tier, floor] of Object.entries(state.floors)) {
      const price = state.pricing[tier] && state.pricing[tier].price_paise;
      if (price != null && price > 0 && price < floor) below.push({ tier, price_rupees: Math.round(price / 100), floor_rupees: Math.round(floor / 100) });
    }
    if (below.length) {
      return [_f(SEVERITY.CRITICAL, CATEGORY.PRICING, 'pricing-floor',
        `${below.length} tier(s) priced below cost-to-serve.`, { below },
        'Raise these prices above the floor — the platform loses money on every such subscription.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.PRICING, 'pricing-floor', 'All tier prices are above cost-to-serve.')];
  },

  // 6. Grievance SLA — acknowledgement within window, resolution within window.
  function grievance(state, now) {
    if (!state.grievances || !state.grievances.length) return [_f(SEVERITY.OK, CATEGORY.GRIEVANCE, 'grievance-sla', 'No open grievances.')];
    const breachedAck = [], approachingAck = [], breachedResolve = [];
    for (const g of state.grievances) {
      const open = g.status !== 'resolved' && g.status !== 'closed';
      if (!open) continue;
      if (g.slaAckBy && !g.acknowledgedAt) {
        if (now > g.slaAckBy) breachedAck.push(g.id);
        else if (g.slaAckBy - now < 7 * 3600 * 1000) approachingAck.push(g.id); // within 7h
      }
      if (g.slaResolveBy && !g.resolvedAt && now > g.slaResolveBy) breachedResolve.push(g.id);
    }
    const out = [];
    if (breachedAck.length || breachedResolve.length) {
      out.push(_f(SEVERITY.CRITICAL, CATEGORY.GRIEVANCE, 'grievance-sla',
        `${breachedAck.length} grievance(s) past acknowledgement SLA, ${breachedResolve.length} past resolution SLA.`,
        { breached_ack: breachedAck.slice(0, 5), breached_resolve: breachedResolve.slice(0, 5) },
        'Acknowledge/resolve these now — SLA breaches are a consumer-law exposure.'));
    } else if (approachingAck.length) {
      out.push(_f(SEVERITY.WATCH, CATEGORY.GRIEVANCE, 'grievance-sla',
        `${approachingAck.length} grievance(s) approaching the acknowledgement deadline.`,
        { approaching: approachingAck.slice(0, 5) }, 'Acknowledge before the 48h window closes.'));
    } else {
      out.push(_f(SEVERITY.OK, CATEGORY.GRIEVANCE, 'grievance-sla', 'All open grievances are within SLA.'));
    }
    return out;
  },

  // 7. System health — surface the ops health snapshot.
  function system(state) {
    if (!state.health) return [_f(SEVERITY.OK, CATEGORY.SYSTEM, 'system-health', 'No health snapshot provided.')];
    const h = state.health;
    if (h.overallHealth === 'critical' || h.overallHealth === 'unhealthy') {
      return [_f(SEVERITY.CRITICAL, CATEGORY.SYSTEM, 'system-health', 'System health checks are failing.', { health: h.summary || h.overallHealth }, 'Investigate the failing checks before taking traffic.')];
    }
    if (h.overallHealth === 'degraded') {
      return [_f(SEVERITY.WATCH, CATEGORY.SYSTEM, 'system-health', 'System health is degraded.', { health: h.summary || h.overallHealth }, 'Watch the degraded checks.')];
    }
    return [_f(SEVERITY.OK, CATEGORY.SYSTEM, 'system-health', 'System health checks pass.')];
  },
];

/**
 * scan — run every check against the live state, return a severity-ranked
 * report. Worst findings first.
 */
function scan(state = {}, now = Date.now()) {
  const findings = [];
  for (const check of CHECKS) {
    try { findings.push(...check(state, now)); }
    catch (e) { findings.push(_f(SEVERITY.WATCH, CATEGORY.SYSTEM, check.name || 'check', 'A check failed to run.', { error: e.message })); }
  }
  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const counts = { critical: 0, watch: 0, ok: 0 };
  for (const f of findings) counts[f.severity]++;
  const overall = counts.critical ? SEVERITY.CRITICAL : counts.watch ? SEVERITY.WATCH : SEVERITY.OK;
  return {
    overall,
    headline: counts.critical
      ? `${counts.critical} critical issue(s) need action now.`
      : counts.watch ? `${counts.watch} item(s) to watch.` : 'All invariants hold. The platform is healthy.',
    counts,
    findings,
    checks_run: CHECKS.length,
    scanned_at: now,
  };
}

/**
 * trend — given a history of past scan summaries, say whether the platform is
 * improving, stable, or worsening (the "improve in future" loop).
 */
function trend(history = []) {
  if (history.length < 2) return { direction: 'insufficient_data', note: 'Need at least two scans to compare.' };
  const prev = history[history.length - 2], cur = history[history.length - 1];
  const delta = (cur.counts.critical * 2 + cur.counts.watch) - (prev.counts.critical * 2 + prev.counts.watch);
  return {
    direction: delta < 0 ? 'improving' : delta > 0 ? 'worsening' : 'stable',
    delta,
    from: prev.counts, to: cur.counts,
    note: delta < 0 ? 'Fewer/less-severe issues than the previous scan.' : delta > 0 ? 'More/worse issues than the previous scan.' : 'No change in issue burden.',
  };
}

module.exports = { SEVERITY, CATEGORY, CHECKS, scan, trend };
