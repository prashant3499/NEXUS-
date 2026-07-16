/**
 * NEXUS — Founder insights.
 *
 * Pure functions that read the running engine state and produce a ranked
 * list of actionable imperatives. Not Q&A, not a FAQ — *what to do next*,
 * with the real numbers and a button that performs the action.
 *
 * Each insight has:
 *   id        — stable identifier (UI can dedupe / persist dismissals)
 *   priority  — 'critical' | 'high' | 'med' | 'low'  (drives ordering)
 *   domain    — 'approvals' | 'demand' | 'sellers' | 'orders' | 'engine' | 'cost'
 *   text      — imperative phrasing with real numbers ("Decide 2 held orders")
 *   reason    — short why-this-matters (audit-able)
 *   cta       — button label
 *   actionKey — UI looks up the actual handler by this key
 *   actionArg — optional argument (e.g. an order id to approve)
 *
 * The MODULE returns plain data. The UI binds actionKey to functions
 * (navigate to a view, open a panel, call decideHITL, etc.) — keeping
 * this module pure and testable.
 */

'use strict';

const HOUR = 3600 * 1000;
const DAY  = 24 * HOUR;
const PRIORITY_RANK = { critical: 0, high: 1, med: 2, low: 3 };

/**
 * Generate the ranked insights for the current engine snapshot.
 *
 * @param {{
 *   customers:  Array<{id:string, model:string, profile?:object, created_at?:number}>,
 *   products:   Array<{id:string, customer_id:string, sellPrice:number, vertical:string, created_at?:number}>,
 *   orders:     Array<{id:string, status:string, sell_price:number, payment?:object, hitl_item_id?:string, _enqueued_at?:number, isExport?:boolean}>,
 *   hitlQueue?: Array<{id:string, summary?:string, severity?:string, created_at?:number, context?:object}>,
 *   now?:       number,
 *   lastSeenAt?: number,
 * }} state
 * @returns {Array<{id,priority,domain,text,reason,cta,actionKey,actionArg?}>}
 */
function generateInsights(state = {}) {
  const customers = state.customers || [];
  const products  = state.products  || [];
  const orders    = state.orders    || [];
  const hitlQueue = state.hitlQueue || [];
  const now       = state.now || Date.now();
  const lastSeen  = state.lastSeenAt || 0;

  const out = [];

  // ── APPROVALS: held items, with age-based priority escalation ──
  if (hitlQueue.length > 0) {
    const stale = hitlQueue.filter(it => (now - (it.created_at || now)) > DAY);
    if (stale.length) {
      out.push({
        id: 'approvals:stale',
        priority: 'critical',
        domain: 'approvals',
        text: `Decide ${stale.length} held action${stale.length>1?'s':''} stuck >24h`,
        reason: 'Stale holds block seller payouts and erode trust',
        cta: `Open approvals (${hitlQueue.length} total)`,
        actionKey: 'goto:approvals',
      });
    } else {
      // surface the highest-severity held item with a specific action
      const top = [...hitlQueue].sort((a,b) => severityRank(b.severity) - severityRank(a.severity))[0];
      const desc = top.summary || top.context?.description || `${hitlQueue.length} held action${hitlQueue.length>1?'s':''}`;
      out.push({
        id: 'approvals:top',
        priority: top.severity === 'high' ? 'high' : 'med',
        domain: 'approvals',
        text: `Decide: ${truncate(desc, 60)}`,
        reason: `${hitlQueue.length} action${hitlQueue.length>1?'s':''} waiting on you${top.severity==='high'?' · high severity':''}`,
        cta: 'Review and decide',
        actionKey: 'goto:approvals',
      });
    }
  }

  // ── DEMAND VALIDATION: the recurring honest reminder, sharp form ──
  if (customers.length === 0) {
    out.push({
      id: 'demand:cold',
      priority: 'high',
      domain: 'demand',
      text: 'Onboard the first seller, or run the 50-exporter validation cohort',
      reason: 'Zero sellers — engine is correct but unproven. Code value compounds only after demand is real.',
      cta: 'Assign first legal model',
      actionKey: 'goto:assign',
    });
  } else if (customers.length < 5) {
    out.push({
      id: 'demand:thin',
      priority: 'high',
      domain: 'demand',
      text: `${customers.length} seller${customers.length>1?'s':''} — push to 50 before scaling features`,
      reason: 'A thin pipeline means feature work outpaces real signal. The next valuable move is conversations, not code.',
      cta: 'Open demand-cohort plan',
      actionKey: 'goto:cofounder',
    });
  }

  // ── ORDER VELOCITY: settled today vs nothing ──
  const todayMs = startOfDay(now);
  const settledToday = orders.filter(o => o.payment?.state === 'settled' && (o._settled_at || o._created_at || now) >= todayMs);
  const heldToday    = orders.filter(o => o.status === 'hitl_review' && (o._created_at || now) >= todayMs);
  if (settledToday.length === 0 && orders.length > 0 && customers.length > 0) {
    out.push({
      id: 'velocity:silent',
      priority: 'med',
      domain: 'orders',
      text: 'No settlements yet today — check the funnel',
      reason: `You have ${customers.length} seller${customers.length>1?'s':''} and ${products.length} listing${products.length>1?'s':''}, but zero orders settled today.`,
      cta: 'Open settlements',
      actionKey: 'goto:settlements',
    });
  }

  // ── HIGH-VALUE ORDER: anything above ₹2L needs founder attention ──
  const bigHeld = orders.filter(o => o.status === 'hitl_review' && o.sell_price >= 200000);
  if (bigHeld.length) {
    const o = bigHeld[0];
    out.push({
      id: 'highvalue:'+o.id,
      priority: 'high',
      domain: 'approvals',
      text: `High-value order held: ₹${o.sell_price.toLocaleString('en-IN')} from ${o.buyer || 'buyer'}`,
      reason: 'Above ₹2L the system always requires founder sign-off',
      cta: 'Decide now',
      actionKey: 'goto:approvals',
    });
  }

  // ── EXPORT MIX: concentration risk, smooths cashflow if diversified ──
  if (orders.length >= 5) {
    const exports = orders.filter(o => o.isExport || /export/i.test(JSON.stringify(o))).length;
    const share = exports / orders.length;
    if (share > 0.6) {
      out.push({
        id: 'mix:export-heavy',
        priority: 'med',
        domain: 'orders',
        text: `${Math.round(share*100)}% of orders are export — diversify into B2B`,
        reason: 'Export concentration means lumpy cashflow and FEMA exposure. B2B procurement smooths both.',
        cta: 'Open B2B catalog flow',
        actionKey: 'goto:sellers',
      });
    }
  }

  // ── GI PORTFOLIO: trust signals (only if a verifier was supplied) ──
  if (state.giVerify && products.length > 0) {
    let suspicious = 0, untagged = 0;
    const flagged = [];
    for (const p of products) {
      const v = state.giVerify(p);
      if (v.status === 'suspicious') { suspicious++; flagged.push({ p, v }); }
      else if (v.status === 'untagged') untagged++;
    }
    if (suspicious > 0) {
      out.push({
        id: 'gi:suspicious',
        priority: 'high',
        domain: 'engine',
        text: `Review ${suspicious} suspicious GI claim${suspicious>1?'s':''}`,
        reason: 'Claimed GI does not match seller region or craft. Buyer trust risk if shipped without review.',
        cta: 'Open suspicious-GI queue',
        actionKey: 'goto:agents',
      });
    }
    if (untagged > 0 && products.length >= 3) {
      const pct = Math.round(untagged / products.length * 100);
      if (pct >= 40) {
        out.push({
          id: 'gi:untagged',
          priority: 'low',
          domain: 'engine',
          text: `${untagged} listing${untagged>1?'s':''} have no GI tag (${pct}% of catalog)`,
          reason: 'Untagged products miss the trust badge on the buyer side — auto-suggest tags from the registry.',
          cta: 'Open verticals',
          actionKey: 'goto:verticals',
        });
      }
    }
  }

  // ── TOURISM: operator quality + seasonal push (only if intel injected) ──
  if (state.tourismIntel) {
    const { operators = [], scoreOperator, seasonalSignals } = state.tourismIntel;
    if (typeof scoreOperator === 'function' && operators.length > 0) {
      const scored = operators.map(op => scoreOperator(op.spec || op, op.history || {}));
      const probationary = scored.filter(s => s.tier === 'probationary' || s.tier === 'blocked').length;
      if (probationary > 0) {
        out.push({
          id: 'tourism:operator-quality',
          priority: 'high',
          domain: 'engine',
          text: `${probationary} tourism operator${probationary>1?'s':''} below trust threshold`,
          reason: 'License unverified, insurance unbound, or low review score — buyer risk if surfaced.',
          cta: 'Open tourism dashboard',
          actionKey: 'goto:tourism',
        });
      }
    }
    if (typeof seasonalSignals === 'function') {
      const sig = seasonalSignals(now);
      const top = sig.find(s => s.priority === 'high');
      if (top) {
        out.push({
          id: 'tourism:seasonal:' + top.category,
          priority: 'med',
          domain: 'engine',
          text: `Push ${top.category} experiences this week — ${top.window}`,
          reason: top.why,
          cta: `Open ${top.category} cohort`,
          actionKey: 'goto:tourism',
        });
      }
    }
  }

  // ── SUBSCRIPTION PROMOTION: ready-to-upgrade cohort (only if intel injected) ──
  if (state.promotionCohort && typeof state.promotionCohort === 'function') {
    const c = state.promotionCohort();
    if (c && c.cohortSize > 0) {
      const lift = c.expectedMrrLiftPaise || 0;
      out.push({
        id: 'subscriptions:cohort',
        priority: 'high',
        domain: 'subscriptions',
        text: `${c.cohortSize} seller${c.cohortSize>1?'s':''} ready to promote — potential +₹${(lift/100).toLocaleString('en-IN')}/mo`,
        reason: c.offers[0]
          ? `Top: ${c.offers[0].seller.id} (${c.offers[0].offer.fromName} → ${c.offers[0].offer.toName}). Signal: ${c.offers[0].offer.evidence}`
          : 'Behavioral signals indicate these sellers have outgrown their current tier.',
        cta: 'Open promotion cohort',
        actionKey: 'goto:cofounder',
      });
    }
  }

  // ── GRIEVANCES: SLA breaches surface as critical when ack-overdue ──
  if (Array.isArray(state.grievances) && state.grievances.length > 0 && typeof state.slaBreaches === 'function') {
    const breaches = state.slaBreaches(state.grievances, now);
    if (breaches.length > 0) {
      const ackBreached = breaches.filter(b => b.sla.ackBreached).length;
      const resolveBreached = breaches.filter(b => b.sla.resolveBreached).length;
      const priority = ackBreached > 0 ? 'critical' : 'high';
      const detail = ackBreached > 0
        ? `${ackBreached} not acknowledged within 24h (regulatory breach)`
        : `${resolveBreached} not resolved within 15d`;
      out.push({
        id: 'grievance:sla-breach',
        priority,
        domain: 'grievance',
        text: `${breaches.length} grievance${breaches.length>1?'s':''} need attention — ${detail}`,
        reason: 'SLA breach exposes the platform to Consumer Protection Act and IT Rules 2021 penalties. Acknowledge or resolve immediately.',
        cta: 'Open grievance queue',
        actionKey: 'goto:grievances',
      });
    }
  }

  // ── DOCUMENT VERIFICATION: pending or failed seller documents ──
  if (Array.isArray(state.docVerifications) && state.docVerifications.length > 0) {
    const failed = state.docVerifications.filter(d => d.status === 'failed').length;
    const manual = state.docVerifications.filter(d => d.status === 'manual_review').length;
    if (failed > 0) {
      out.push({
        id: 'docs:failed',
        priority: 'high',
        domain: 'verification',
        text: `${failed} document verification${failed>1?'s':''} failed`,
        reason: 'Seller cannot transact until documents are re-uploaded and pass verification.',
        cta: 'Open verification queue',
        actionKey: 'goto:grievances',
      });
    }
    if (manual > 0) {
      out.push({
        id: 'docs:manual-review',
        priority: 'med',
        domain: 'verification',
        text: `${manual} document${manual>1?'s':''} pending manual review`,
        reason: 'Automated providers cannot decide these. Founder review is required to onboard the seller.',
        cta: 'Open verification queue',
        actionKey: 'goto:grievances',
      });
    }
  }

  // ── UNIT ECONOMICS: tier health and pricing surfaces (founder-only, via injection) ──
  if (state.unitEconomics && typeof state.unitEconomics === 'object') {
    const ue = state.unitEconomics;
    // Tier health: any tier with margin < 30% or losing money
    if (Array.isArray(ue.profitabilityReport)) {
      const unhealthy = ue.profitabilityReport.filter(t => !t.healthy && t.tier !== 'sansthan');
      if (unhealthy.length > 0) {
        const worst = unhealthy.sort((a, b) => a.marginPct - b.marginPct)[0];
        out.push({
          id: 'economics:tier-margin',
          priority: worst.marginPaise < 0 ? 'critical' : 'high',
          domain: 'economics',
          text: `${worst.name} tier margin is ${worst.marginPct}% — ${worst.marginPaise < 0 ? 'losing money' : 'below 30% target'}`,
          reason: `${worst.name} subscribers contribute ₹${(worst.revenuePaise/100).toLocaleString('en-IN')}/mo at baseline GMV, but costs are ₹${(worst.costPaise/100).toLocaleString('en-IN')}/mo. Consider raising the price or reducing the variable cost allocation.`,
          cta: 'Review tier pricing',
          actionKey: 'goto:cofounder',
        });
      }
    }
    // Pending campaign with HITL approval — requires founder sign-off
    if (Array.isArray(ue.pendingCampaigns) && ue.pendingCampaigns.length > 0) {
      const totalBudget = ue.pendingCampaigns.reduce((s, c) => s + (c.budgetPaise || 0), 0);
      out.push({
        id: 'economics:campaign-approval',
        priority: 'high',
        domain: 'economics',
        text: `${ue.pendingCampaigns.length} marketing campaign${ue.pendingCampaigns.length>1?'s':''} awaiting your approval — ₹${(totalBudget/100).toLocaleString('en-IN')} total`,
        reason: 'Campaign spend over the HITL threshold requires founder sign-off. Review the proposed ROI before approving.',
        cta: 'Review campaigns',
        actionKey: 'goto:cofounder',
      });
    }
    // Ready-to-launch green campaigns (no approval needed but worth surfacing)
    if (Array.isArray(ue.rankedCampaigns) && ue.rankedCampaigns.length > 0) {
      const top = ue.rankedCampaigns[0];
      if (top.result.decision === 'green' && !top.result.requiresApproval) {
        out.push({
          id: 'economics:campaign-ready',
          priority: 'med',
          domain: 'economics',
          text: `Top-ranked campaign ready to run: ${top.campaign.channel}, ₹${(top.campaign.budgetPaise/100).toLocaleString('en-IN')}`,
          reason: `Expected ${top.result.expectedNewSellers} new sellers at CAC ₹${(top.result.cacPaise/100).toLocaleString('en-IN')}, payback ${top.result.paybackMonths} months.`,
          cta: 'Launch campaign',
          actionKey: 'goto:cofounder',
        });
      }
    }
  }

  // ── AD SPEND: per-seller margin warnings and headroom (founder-only) ──
  if (state.adSpend && typeof state.adSpend === 'object') {
    const ad = state.adSpend;
    // Sellers whose post-ad margin has dropped below the floor
    if (Array.isArray(ad.sellersBelowFloor) && ad.sellersBelowFloor.length > 0) {
      const worst = ad.sellersBelowFloor[0];
      out.push({
        id: 'ads:margin-below-floor',
        priority: 'critical',
        domain: 'economics',
        text: `${ad.sellersBelowFloor.length} seller${ad.sellersBelowFloor.length>1?'s have':' has'} post-ad margin below floor — top: ${worst.sellerId} at ${worst.adjustedMarginPct}%`,
        reason: 'These sellers are burning subscription revenue on ads faster than they generate commission. Cap their ad spend or move them to a higher tier.',
        cta: 'Review ad budgets',
        actionKey: 'goto:cofounder',
      });
    }
    // Campaigns awaiting founder approval for over-budget ad spend
    if (Array.isArray(ad.pendingApprovals) && ad.pendingApprovals.length > 0) {
      const totalPaise = ad.pendingApprovals.reduce((s,c) => s + (c.plannedSpendPaise || 0), 0);
      out.push({
        id: 'ads:approval-queue',
        priority: 'high',
        domain: 'economics',
        text: `${ad.pendingApprovals.length} ad campaign${ad.pendingApprovals.length>1?'s':''} awaiting founder approval (₹${(totalPaise/100).toLocaleString('en-IN')} total)`,
        reason: 'These exceed in-subscription budget or push margin below floor. Approve only if cohort value justifies the over-spend.',
        cta: 'Review ad approvals',
        actionKey: 'goto:cofounder',
      });
    }
    // Sellers with most headroom to push more ads
    if (Array.isArray(ad.headroomRanking) && ad.headroomRanking.length > 0) {
      const top = ad.headroomRanking[0];
      if (top.headroomBeforeFloorPaise > 50000) {  // only flag if at least ₹500 headroom
        out.push({
          id: 'ads:push-opportunity',
          priority: 'med',
          domain: 'economics',
          text: `${top.sellerId} (${top.tier}) has ₹${(top.headroomBeforeFloorPaise/100).toLocaleString('en-IN')} ad headroom — push more`,
          reason: `Current margin ${top.currentMarginPct}% is well above the floor. Increase ad spend on this seller to drive their GMV without breaking the margin guarantee.`,
          cta: 'Plan campaign',
          actionKey: 'goto:cofounder',
        });
      }
    }
  }

  // ── GEM EXPORT COMPLIANCE: blocked listings need founder review ──
  if (state.gemExportCompliance && typeof state.gemExportCompliance === 'object') {
    const gec = state.gemExportCompliance;
    if (Array.isArray(gec.blockedListings) && gec.blockedListings.length > 0) {
      const worst = gec.blockedListings[0];
      out.push({
        id: 'compliance:export-blocked',
        priority: 'critical',
        domain: 'compliance',
        text: `${gec.blockedListings.length} export listing${gec.blockedListings.length>1?'s':''} blocked by compliance — top: ${worst.productId || worst.title || 'unknown'}`,
        reason: `Blocker rule: ${worst.rule || (worst.blockers && worst.blockers[0] && worst.blockers[0].rule) || 'unknown'}. CITES/Kimberley/BIS checks failed; cannot be exported until resolved.`,
        cta: 'Review compliance queue',
        actionKey: 'goto:cofounder',
      });
    }
    if (Array.isArray(gec.warningsCount) && gec.warningsCount.length > 0) {
      // not surfaced as a separate signal — warnings just sit on the listing
    }
  }

  // ── OPERATIONAL COST: LLM cost dominates as customers scale ──
  if (state.operationalCost && typeof state.operationalCost === 'object') {
    const oc = state.operationalCost;
    if (oc.currentScenario && oc.currentScenario.byCategory) {
      const cat = oc.currentScenario.byCategory;
      const total = oc.currentScenario.totalCostPaise || 1;
      const inferencePct = Math.round((cat.inference / total) * 1000) / 10;
      if (inferencePct > 70) {
        out.push({
          id: 'cost:inference-dominant',
          priority: 'med',
          domain: 'economics',
          text: `Inference cost is ${inferencePct}% of total opex — consider LLM cost optimization`,
          reason: 'When inference > 70% of opex, the biggest cost-engineering win is improving the Sonnet/Haiku mix. Route simple support queries to Haiku, keep Sonnet for catalog and ads.',
          cta: 'Review LLM routing',
          actionKey: 'goto:cofounder',
        });
      }
      if (oc.currentScenario.opexPctOfRevenue && oc.currentScenario.opexPctOfRevenue > 15) {
        out.push({
          id: 'cost:opex-elevated',
          priority: 'high',
          domain: 'economics',
          text: `Opex is ${oc.currentScenario.opexPctOfRevenue}% of revenue — above the 2% steady-state target`,
          reason: 'Either revenue is too low (early-stage) or cost has grown. Investigate which category exceeded forecast.',
          cta: 'Review cost ledger',
          actionKey: 'goto:cofounder',
        });
      }
    }
  }

  // ── SOURCING: remote customer acquisition signals ──
  if (state.sourcing && typeof state.sourcing === 'object') {
    const src = state.sourcing;

    // High-priority leads waiting for first contact
    if (Array.isArray(src.priorityLeads) && src.priorityLeads.length > 0) {
      const top = src.priorityLeads[0];
      out.push({
        id: 'sourcing:contact-top-lead',
        priority: 'high',
        domain: 'sourcing',
        text: `Top-priority lead waiting: ${top.name} (${top.suggestedTier}, score ${top.score}) — contact now`,
        reason: `From ${top.source}. ${src.priorityLeads.length} lead${src.priorityLeads.length>1?'s':''} ready for first outreach. Higher score = better tier fit.`,
        cta: 'Open lead',
        actionKey: 'goto:cofounder',
      });
    }

    // Dormant leads needing re-engagement
    if (Array.isArray(src.dormantLeads) && src.dormantLeads.length > 0) {
      out.push({
        id: 'sourcing:dormant-leads',
        priority: 'med',
        domain: 'sourcing',
        text: `${src.dormantLeads.length} lead${src.dormantLeads.length>1?'s have':' has'} gone dormant (30+ days no response)`,
        reason: 'Send a brief follow-up or mark them rejected. Letting dormant leads pile up distorts your funnel metrics.',
        cta: 'Review dormant queue',
        actionKey: 'goto:cofounder',
      });
    }

    // Funnel leakage alert
    if (src.funnel && src.funnel.leakiestStep && src.funnel.leakiestRatePct !== null && src.funnel.leakiestRatePct < 25) {
      const stepLabel = src.funnel.leakiestStep.replace(/_to_/g, ' → ').replace(/_/g, ' ');
      out.push({
        id: 'sourcing:funnel-leak',
        priority: 'high',
        domain: 'sourcing',
        text: `Funnel leaking at ${stepLabel} (${src.funnel.leakiestRatePct}% conversion)`,
        reason: 'A conversion rate below 25% at a single step is unusual. Investigate: is your message at that step landing? Is timing right? Talk to leads who dropped.',
        cta: 'Review funnel',
        actionKey: 'goto:cofounder',
      });
    }

    // No new leads added in last 7 days — sourcing has stalled
    if (typeof src.daysSinceLastLead === 'number' && src.daysSinceLastLead >= 7) {
      out.push({
        id: 'sourcing:no-new-leads',
        priority: 'high',
        domain: 'sourcing',
        text: `No new leads added in ${src.daysSinceLastLead} days — sourcing has stalled`,
        reason: 'Pick a source from the registry (GJEPC, EPCH, GI registry, Udyam, FPO). Add 10-20 leads. Without new top-of-funnel, the pipeline runs dry.',
        cta: 'Add leads',
        actionKey: 'goto:cofounder',
      });
    }
  }

  // ── RETURNS: SLA breaches and high-value HITL queue ──
  if (state.returns && typeof state.returns === 'object') {
    const ret = state.returns;

    // SLA breaches
    if (Array.isArray(ret.breaches) && ret.breaches.length > 0) {
      const worst = ret.breaches[0];
      out.push({
        id: 'returns:sla-breach',
        priority: 'critical',
        domain: 'returns',
        text: `${ret.breaches.length} return${ret.breaches.length>1?'s':''} breaching SLA — top: ${worst.orderId} overdue ${worst.overdueDays}d`,
        reason: `Stuck at ${worst.currentStatus}. SLA target was ${worst.targetDays}d. Buyer is waiting and will escalate to grievance if not resolved.`,
        cta: 'Review return queue',
        actionKey: 'goto:cofounder',
      });
    }

    // High-value returns needing founder approval
    if (Array.isArray(ret.pendingHitl) && ret.pendingHitl.length > 0) {
      const totalPaise = ret.pendingHitl.reduce((s, r) => s + (r.originalSlicePaise || 0), 0);
      out.push({
        id: 'returns:hitl-queue',
        priority: 'high',
        domain: 'returns',
        text: `${ret.pendingHitl.length} high-value return${ret.pendingHitl.length>1?'s':''} need founder approval (₹${(totalPaise/100).toLocaleString('en-IN')} total)`,
        reason: 'Returns >₹50K require founder sign-off on approval. Review the case, confirm seller-fault attribution, then approve or reject.',
        cta: 'Approve / reject',
        actionKey: 'goto:cofounder',
      });
    }

    // High refund rate signal
    if (ret.summary && ret.summary.refundRate > 15 && ret.summary.total >= 10) {
      out.push({
        id: 'returns:high-refund-rate',
        priority: 'high',
        domain: 'returns',
        text: `Refund rate is ${ret.summary.refundRate}% — well above the 5% healthy benchmark`,
        reason: 'High refund rate suggests systematic quality issues, listing mismatches, or buyer expectation gaps. Check the reasonCounts to see which complaint dominates.',
        cta: 'Review return analytics',
        actionKey: 'goto:cofounder',
      });
    }
  }

  // ── OPERATIONS: health-check FAILs surface as top-priority signals ──
  if (state.operations && typeof state.operations === 'object') {
    const ops = state.operations;
    // Overall fail count summary signal
    if (ops.healthSummary && ops.healthSummary.fail > 0) {
      out.push({
        id: 'ops:health-failing',
        priority: 'critical',
        domain: 'operations',
        text: `${ops.healthSummary.fail} health check${ops.healthSummary.fail>1?'s':''} failing — run recommended runbooks`,
        reason: 'AI co-founder has run the health check sweep. Failures need action; the runbook queue below shows what to do for each.',
        cta: 'Open ops dashboard',
        actionKey: 'goto:cofounder',
      });
    }
    // Specific runbooks recommended
    if (Array.isArray(ops.recommendedRunbooks) && ops.recommendedRunbooks.length > 0) {
      const top = ops.recommendedRunbooks[0];
      out.push({
        id: 'ops:top-runbook',
        priority: top.level === 'fail' ? 'critical' : 'high',
        domain: 'operations',
        text: `Top runbook: ${top.runbook.title} (${top.runbook.estimated_minutes}min, ${top.runbook.autonomy})`,
        reason: `Triggered by ${top.triggeredBy}. Evidence: ${top.evidence}`,
        cta: 'Open runbook',
        actionKey: 'goto:cofounder',
      });
    }
    // Overdue maintenance windows
    if (Array.isArray(ops.dueWindows) && ops.dueWindows.length > 0) {
      const overdueDays = ops.dueWindows[0].overdueDays;
      if (overdueDays >= 2) {
        out.push({
          id: 'ops:windows-overdue',
          priority: 'med',
          domain: 'operations',
          text: `${ops.dueWindows.length} maintenance window${ops.dueWindows.length>1?'s':''} overdue — top by ${overdueDays}d`,
          reason: 'Scheduled jobs (backup verification, dependency audit, daily cost review) are overdue. Most are safe AI-autonomous; some need founder eyes.',
          cta: 'Run windows',
          actionKey: 'goto:cofounder',
        });
      }
    }
  }

  // ── SELLER MODEL MIX: if all one model, surface the gap ──
  if (customers.length >= 3) {
    const models = {};
    customers.forEach(c => { models[c.model] = (models[c.model]||0)+1; });
    const dominant = Object.entries(models).sort((a,b) => b[1]-a[1])[0];
    if (dominant && dominant[1] / customers.length >= 0.85 && customers.length >= 5) {
      const missing = ['merchant_of_record','saas_subscription','cooperative_umbrella','agent_intermediary'].filter(m => !models[m]);
      if (missing.length) {
        out.push({
          id: 'mix:model-skew',
          priority: 'low',
          domain: 'sellers',
          text: `${Math.round(dominant[1]/customers.length*100)}% of sellers on ${shortModel(dominant[0])} — onboard a ${shortModel(missing[0])} seller`,
          reason: 'The status-aware engine proves itself across multiple legal models. A skewed mix limits that proof.',
          cta: 'Open assign-model',
          actionKey: 'goto:assign',
        });
      }
    }
  }

  // ── IDLE LISTINGS: products that never sold ──
  const sold = new Set(orders.map(o => o.product_id));
  const idle = products.filter(p => !sold.has(p.id));
  if (idle.length >= 5 && products.length >= 5) {
    out.push({
      id: 'engine:idle-listings',
      priority: 'low',
      domain: 'engine',
      text: `${idle.length} listing${idle.length>1?'s':''} never sold — let the Marketing agent pick a winner to push`,
      reason: 'Idle inventory is sunk effort. Concentrate promotion on the top-performing items.',
      cta: 'Open Agents',
      actionKey: 'goto:agents',
    });
  }

  // ── SINCE-LAST-SEEN: what changed (only if we have a baseline) ──
  if (lastSeen > 0 && lastSeen < now - 5*60*1000) {
    const newOrders   = orders.filter(o => (o._created_at || 0) > lastSeen).length;
    const newHeld     = orders.filter(o => o.status === 'hitl_review' && (o._created_at || 0) > lastSeen).length;
    const newSettled  = orders.filter(o => o.payment?.state === 'settled' && (o._settled_at || o._created_at || 0) > lastSeen).length;
    if (newOrders + newHeld > 0) {
      const parts = [];
      if (newSettled) parts.push(`${newSettled} settled`);
      if (newHeld)    parts.push(`${newHeld} held`);
      if (newOrders)  parts.push(`${newOrders} new orders`);
      out.push({
        id: 'session:catchup',
        priority: newHeld > 0 ? 'high' : 'med',
        domain: 'orders',
        text: `Since you were away: ${parts.join(' · ')}`,
        reason: `Last seen ${humanAgo(now - lastSeen)} ago`,
        cta: newHeld > 0 ? 'Open approvals' : 'Open settlements',
        actionKey: newHeld > 0 ? 'goto:approvals' : 'goto:settlements',
      });
    }
  }

  return out.sort((a,b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

/** A one-line "what's happening" summary for the dock header. */
function dockHeadline(state = {}, insights = null) {
  insights = insights || generateInsights(state);
  if (insights.length === 0) {
    if ((state.customers || []).length === 0) return 'Quiet engine — onboard your first seller to wake it up.';
    return 'All clear. The engine is running; nothing needs you right now.';
  }
  const top = insights[0];
  return top.text;
}

/** Produce a state-aware answer to a free-form founder question.
 *  This is intentionally narrow — it matches intent keywords and answers
 *  from real state. If the question doesn't map to a known intent, it
 *  returns a fallback that surfaces the top insight rather than nothing. */
function answerQuestion(question, state = {}) {
  const q = (question || '').toLowerCase();
  const customers = state.customers || [];
  const products  = state.products  || [];
  const orders    = state.orders    || [];
  const hitl      = state.hitlQueue || [];

  if (/queue|pending|approv|held/.test(q)) {
    if (hitl.length === 0) return 'Nothing held right now. The queue is empty.';
    return `${hitl.length} action${hitl.length>1?'s':''} waiting on you. Highest severity: ${hitl[0].severity || 'med'}. Open Approvals to decide.`;
  }
  if (/order|sale|gmv|revenue|settle/.test(q)) {
    if (orders.length === 0) return 'No orders yet — onboard a seller and list a product first.';
    const gmv = orders.reduce((s,o) => s + (o.sell_price||0), 0);
    const settled = orders.filter(o => o.payment?.state === 'settled').length;
    return `${orders.length} order${orders.length>1?'s':''} total · ${settled} settled · GMV ₹${gmv.toLocaleString('en-IN')}.`;
  }
  if (/seller|artisan|customer|merchant|model/.test(q)) {
    if (customers.length === 0) return 'No sellers yet. The status-aware selector is ready — assign a legal model to start.';
    const models = {}; customers.forEach(c => models[c.model] = (models[c.model]||0)+1);
    const mix = Object.entries(models).map(([m,n]) => `${n} ${shortModel(m)}`).join(', ');
    return `${customers.length} seller${customers.length>1?'s':''}: ${mix}.`;
  }
  if (/product|listing|catalog/.test(q)) {
    if (products.length === 0) return 'No listings yet.';
    return `${products.length} listing${products.length>1?'s':''} across ${new Set(products.map(p=>p.vertical)).size} vertical(s).`;
  }
  if (/cost|spend|infer|gpu|bhashini/.test(q)) {
    return 'Phase-aware cost engine. Indic inference via Bhashini at ₹0; English via owned GPU; LLM API behind a monthly cap. 2% ceiling once GMV crosses ₹1L/mo.';
  }
  if (/operate|requirement|what do i need|what is required|setup|real business|launch checklist/.test(q)) {
    return 'To run this as a real business you need: a registered entity, Razorpay + a Postgres database, a DigiLocker/KYC approval, a lawyer + CA sign-off on the Merchant-of-Record + TCS model, and one pilot cluster. Everything else you can do now with no money — collect free government data, build the consent-gated prospect database, and test the whole engine.';
  }
  if (/collect|free data|gather data|open data/.test(q)) {
    return 'I collect authentic free government data — the GI registry (clusters and producers), data.gov.in (pincodes and stats), ODOP districts, and myScheme eligibility. No authorisation, no money; each record becomes a consent-gated prospect across every vertical.';
  }
  if (/float|escrow|money|gateway/.test(q)) {
    return 'Zero float by design: payments split at the gateway. The platform is never in the money path — funds go directly to the artisan, the commission account, and the tax account.';
  }
  const feePct = state.feePct || state.platformFeePct || 12;
  if (/\bfee\b|commission|\bcut\b|charge|how much.*take/.test(q)) {
    const keep = Math.round(5000*(1-feePct/100-0.067));
    return `Platform fee is ${feePct}%. On a ₹5,000 sale the maker keeps about ₹${keep.toLocaleString('en-IN')} (~${Math.round((keep/5000)*100)}%). A never-in-loss guard means the platform can't be configured to lose money.`;
  }
  if (/payout|paid|when.*pay|earn|disburse|\bbank\b/.test(q)) {
    return 'Makers are paid to their own bank in ~2 days via Razorpay Route. Any payout above the finance gate pauses for your approval (a HITL gate).';
  }
  if (/consent|onboard|sourc|upload|permission/.test(q)) {
    return 'Auto-sourcing fills the prospect database first. A maker is never listed or sold until they grant the 5 required consents (terms, selling-authorization, content-license, data-processing, payout-authorization) — the canSell gate enforces it.';
  }
  if (/pilot|cluster|odop|validat/.test(q)) {
    return 'Highest-leverage move: one government-partnered pilot in a single ODOP cluster — it brings makers, demand and funding together. That first real transaction de-risks everything after it.';
  }
  if (/deploy|launch|host|go.?live|publish/.test(q)) {
    return 'The website deploys free on Netlify Drop in ~2 minutes; this backend on Render (render.yaml), Fly, or Railway. Real money stays blocked until productionGuard\'s conditions are satisfied.';
  }
  if (/plan|pricing|subscri|tier/.test(q)) {
    return 'Plans: Karigar ₹799, Vyapari ₹3,999, Niryatak ₹11,999/mo, Sansthan custom; buyer membership Pravasi ₹2,999/yr. No free tier; annual billing at launch.';
  }
  if (/exim|export|import|customs|\biec\b/.test(q)) {
    return 'Exim is built as seams (IEC, customs, GI/gem export compliance) and promoted on the site, but not transacting end-to-end yet — a post-pilot engineering track.';
  }
  if (/shop|showroom|b2b2c|retail|reseller|boutique/.test(q)) {
    return 'Shops & showrooms source verified craft and resell as their own — Vyapari tier, on consignment, no inventory risk; a chain or cooperative joins as Sansthan.';
  }
  if (/tour|experience|workshop/.test(q)) {
    return 'Tourism is a full vertical: workshops, artisan visits and craft tours — safety-checked and maker-hosted.';
  }
  if (/kyc|digilocker|identity|verif/.test(q)) {
    return 'KYC requires a DigiLocker requester approval (a government application). Until that is live, identity verification runs in mock mode.';
  }
  if (/secur|encrypt|dpdp|privacy/.test(q)) {
    return 'Security: AES-256 + PII masking, DPDP-aware. Before production, rotate AUTH_SECRET, FOUNDER_TOKEN and WEBHOOK_SECRET from their dev defaults.';
  }
  if (/photo|image|picture/.test(q)) {
    return 'Product images are placeholders. Real photography needs cloud storage (S3/Cloudinary) — the genuine gap for live listings. I will not fabricate photos.';
  }
  if (/cxo|executive|\bteam\b|cfo|cmo|\bcro\b|advis|officer/.test(q)) {
    let line=''; try { const et=require('./executiveTeam'); const tm=et.assembleTeam(state); if (tm && (tm.top_priority||tm.headline)) line=' Right now the team flags: '+String(tm.top_priority||tm.headline).slice(0,140); } catch(e){}
    return 'Your 10 AI CXOs (CFO, CRO, CMO, COO, CSO, CCO, CTO, CPO, Growth, Risk) read the live business and recommend; you decide.'+line;
  }
  if (/hitl|gate|human.?in|halt|pause/.test(q)) {
    return 'The engine pauses for you on 6 gates: large payout, big price change, high fraud score, supplier contract, low GI-confidence, and DGTR filing. Nothing crosses them without your approval.';
  }
  if (/roadmap|upgrade|improve the|what to build|next build|what.s next to build/.test(q)) {
    return 'Smart next builds: per-vertical GI storefronts with the provenance thread, a deeper end-to-end Exim transaction flow, and the multi-screen voice onboarding. I propose each as a change; you approve it.';
  }
  if (/modify|change a rule|change the rule|update the|requirement|reconfigure/.test(q)) {
    return 'To change a rule or config I use change-control: I classify the change, check it against the protected invariants (never-in-loss, consent, child-safety, no-fabrication, honest-stage), and wait for your approval. A change that threatens an invariant is refused — even to you.';
  }
  if (/metric|performance|how are we doing|\bkpi\b|dashboard/.test(q)) {
    return 'Operating snapshot: sellers in onboarding, orders flowing, GMV building, escrow float at zero. Open the daily briefing for the full CXO read and the single top priority.';
  }
  if (/approve|approval|pending|queue/.test(q)) {
    return 'Whatever I cannot do autonomously waits in your approval queue — large payouts, big price changes, fraud flags, supplier contracts. Approve or correct each, and I proceed.';
  }
  if (/vertical|categor|what.*sell|handicraft|textile|jewell|\bgem/.test(q)) {
    return 'One universal core covers handicraft, textiles, jewellery, gems, naturals and experiences — adding a vertical is a config entry, not new code.';
  }
  if (/govern|govt|ministry|scheme|formal/.test(q)) {
    if (/scheme|vishwakarma|mudra|subsidy|odop|benefit|gem|sfurti|export incentive/.test(q)) {
      return 'NEXUS connects artisans to government schemes — PM Vishwakarma, PM MUDRA, e-Shram, ODOP, GeM, GI protection, ONDC, Udyam, SFURTI and export incentives (RoDTEP). We verify and formalise makers so the government can deliver to real beneficiaries, with an outcome dashboard. That is how NEXUS earns government as a partner.';
    }
    return 'For government: we formalise informal artisans (e-Shram), route schemes to verified beneficiaries, protect GI provenance, and lower the state\'s cost of formalisation — with an outcome dashboard.';
  }
  // Fallback: instead of "I don't know", surface the top action.
  const ins = generateInsights(state);
  if (ins.length) return `I don't have a direct answer — but the highest-priority thing right now is: ${ins[0].text}`;
  return 'The engine is quiet and nothing needs you. Try onboarding a seller to see the system in motion.';
}

// ── helpers ──
function severityRank(s) { return ({ high: 3, med: 2, low: 1 })[s] || 1; }
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n-1) + '…' : s; }
function startOfDay(ms) { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); }
function humanAgo(ms) {
  if (ms < HOUR) return Math.round(ms/60000) + 'm';
  if (ms < DAY)  return Math.round(ms/HOUR) + 'h';
  return Math.round(ms/DAY) + 'd';
}
function shortModel(m) {
  return ({
    merchant_of_record: 'MoR',
    saas_subscription:  'SaaS',
    cooperative_umbrella: 'Cooperative',
    agent_intermediary: 'Agent',
    guardian_mor: 'Guardian-MoR',
    blocked: 'Blocked',
  })[m] || m;
}

module.exports = { generateInsights, dockHeadline, answerQuestion, PRIORITY_RANK };
