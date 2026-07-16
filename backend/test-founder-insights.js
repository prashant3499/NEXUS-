'use strict';
const { generateInsights, dockHeadline, answerQuestion } = require('./src/founderInsights');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (name) => console.log('\n\u2501\u2501\u2501 ' + name + ' \u2501\u2501\u2501\n');
const find = (list, id) => list.find(i => i.id === id);

// ────────────────────────────────────────────────────────────
sec('COLD START — zero state');
{
  const ins = generateInsights({});
  a(ins.length > 0, 'Cold start produces actionable insights (not silent)');
  const demand = find(ins, 'demand:cold');
  a(demand && demand.priority === 'high', 'Demand-validation prompt is high-priority');
  a(demand.text.includes('Onboard') || demand.text.includes('cohort'), 'Imperative phrasing — "Onboard" or "cohort"');
  a(demand.actionKey === 'goto:assign', 'Has a real actionKey, not a placeholder');
  const headline = dockHeadline({});
  a(headline.toLowerCase().includes('onboard') || headline.toLowerCase().includes('quiet'), 'Dock headline acknowledges empty state');
}

// ────────────────────────────────────────────────────────────
sec('THIN PIPELINE — few sellers');
{
  const ins = generateInsights({ customers: [
    { id: 'c1', model: 'merchant_of_record' },
    { id: 'c2', model: 'merchant_of_record' },
  ]});
  const thin = find(ins, 'demand:thin');
  a(thin, 'Detects thin pipeline (2 sellers)');
  a(thin.text.includes('2'), 'Includes the actual count in the text');
  a(thin.priority === 'high', 'Thin pipeline is still high-priority');
}

// ────────────────────────────────────────────────────────────
sec('HELD ACTIONS — surface and escalate');
{
  // a fresh held item — should be med
  const fresh = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    hitlQueue: [{ id: 'h1', summary: 'Order ord_1 export compliance', severity: 'med', created_at: Date.now() - 5*60*1000 }],
  });
  const top = find(fresh, 'approvals:top');
  a(top, 'Surfaces the held action');
  a(/Decide/i.test(top.text), 'Phrased as "Decide …" (imperative)');
  a(top.text.includes('export compliance'), 'Includes the specific reason from the queue item');

  // an item stuck >24h — should escalate to critical
  const stale = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    hitlQueue: [
      { id: 'h1', summary: 'X', created_at: Date.now() - 30*3600*1000 },
      { id: 'h2', summary: 'Y', created_at: Date.now() - 26*3600*1000 },
    ],
  });
  const staleIns = find(stale, 'approvals:stale');
  a(staleIns && staleIns.priority === 'critical', 'Stale (>24h) holds escalate to CRITICAL');
  a(staleIns.text.includes('2'), 'Counts stale items in the text');
}

// ────────────────────────────────────────────────────────────
sec('HIGH-VALUE ORDER — specific call-out');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    orders: [{ id:'o1', status:'hitl_review', sell_price: 250000, buyer:'Ahmed', isExport:true }],
    hitlQueue: [{ id:'h1', summary:'high value', severity:'high', created_at: Date.now() }],
  });
  const big = ins.find(i => i.id.startsWith('highvalue:'));
  a(big, 'High-value held order surfaces its own insight');
  a(big.text.includes('2,50,000'), 'Includes the rupee amount with Indian formatting');
  a(big.text.includes('Ahmed'), 'Names the actual buyer');
}

// ────────────────────────────────────────────────────────────
sec('VELOCITY — silent day with active sellers');
{
  const yesterday = Date.now() - 30*3600*1000;
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}, {id:'c2',model:'saas_subscription'}],
    products: [{id:'p1',customer_id:'c1',sellPrice:1500,vertical:'handicraft'}],
    orders: [
      { id:'o_y', status:'settled', sell_price:1500, payment:{state:'settled'}, _created_at: yesterday, _settled_at: yesterday },
    ],
  });
  const silent = find(ins, 'velocity:silent');
  a(silent, 'Flags a silent settlement day');
  a(silent.text.toLowerCase().includes('today'), 'Phrasing is time-anchored');
}

// ────────────────────────────────────────────────────────────
sec('EXPORT CONCENTRATION — diversification nudge');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    orders: Array.from({length:6}, (_,i) => ({ id:'o'+i, status:'settled', sell_price:5000, isExport:true })),
  });
  const mix = find(ins, 'mix:export-heavy');
  a(mix, 'Detects export-heavy mix (≥60%)');
  a(mix.text.includes('100%'), 'Includes the actual percentage');
}

// ────────────────────────────────────────────────────────────
sec('MODEL SKEW — surfaces the gap, names what to onboard');
{
  const ins = generateInsights({
    customers: Array.from({length:6}, (_,i) => ({ id:'c'+i, model:'merchant_of_record' })),
  });
  const skew = find(ins, 'mix:model-skew');
  a(skew, 'Detects a single-model skew');
  a(/SaaS|Cooperative|Agent/.test(skew.text), 'Suggests a specific missing model to onboard');
}

// ────────────────────────────────────────────────────────────
sec('PRIORITY ORDERING — critical before high before med');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    hitlQueue: [{ id:'h1', summary:'old', created_at: Date.now() - 30*3600*1000 }],
    orders: Array.from({length:6}, (_,i) => ({ id:'o'+i, status:'settled', sell_price:5000, isExport:true })),
  });
  const ranks = ins.map(i => i.priority);
  const idxCritical = ranks.indexOf('critical');
  const idxMed = ranks.indexOf('med');
  a(idxCritical >= 0 && (idxMed < 0 || idxCritical < idxMed), 'critical sorts before med');
}

// ────────────────────────────────────────────────────────────
sec('SINCE-LAST-SEEN — catch-up summary');
{
  const last = Date.now() - 2*3600*1000;
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    orders: [
      { id:'o1', status:'settled', sell_price:1500, payment:{state:'settled'}, _created_at: last+60000, _settled_at: last+60000 },
      { id:'o2', status:'hitl_review', sell_price:5000, _created_at: last+120000 },
    ],
    hitlQueue: [{ id:'h2', summary:'x', created_at: last+120000 }],
    lastSeenAt: last,
  });
  const catchup = find(ins, 'session:catchup');
  a(catchup, 'Produces a "since last seen" summary');
  a(catchup.text.includes('settled') || catchup.text.includes('held'), 'Names what changed');
}

// ────────────────────────────────────────────────────────────
sec('FREE-FORM Q&A — answers from real state, not canned');
{
  const state = {
    customers: [{id:'c1',model:'merchant_of_record'}, {id:'c2',model:'saas_subscription'}],
    products: [{id:'p1',customer_id:'c1',sellPrice:1500,vertical:'handicraft'}],
    orders: [
      { id:'o1', status:'settled', sell_price:1500, payment:{state:'settled'} },
      { id:'o2', status:'settled', sell_price:3200, payment:{state:'settled'} },
    ],
    hitlQueue: [{ id:'h1', summary:'review', severity:'high' }],
  };
  const aQ = answerQuestion('how many orders today?', state);
  a(aQ.includes('2'), 'Answers "how many orders" with the actual count');
  a(aQ.includes('GMV') || aQ.includes('4,700') || aQ.includes('₹'), 'Quotes real GMV/value');

  const aS = answerQuestion('what sellers do I have?', state);
  a(aS.includes('2'), 'Names actual seller count');
  a(/MoR|SaaS/.test(aS), 'Names the actual models in the mix');

  const aH = answerQuestion('anything pending?', state);
  a(aH.includes('1') && /waiting|action/i.test(aH), 'Quotes pending queue from real state');

  // empty state — no fabrication
  const empty = answerQuestion('how many sellers?', {});
  a(empty.toLowerCase().includes('no sellers') || empty.toLowerCase().includes('zero'), 'Empty state — honest answer, no fabrication');

  // unknown intent — falls back to top insight, not "I don't know"
  const odd = answerQuestion('what is the weather', state);
  a(odd.length > 20, 'Unknown intent still produces something useful');
}

// ────────────────────────────────────────────────────────────
sec('GI SIGNALS — uses an injected verifier');
{
  const fakeVerify = (p) => p.bad ? {status:'suspicious'} : p.untagged ? {status:'untagged'} : {status:'verified'};
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    products: [
      { id:'p1', title:'Banarasi', bad:true },     // suspicious
      { id:'p2', title:'Pashmina' },                 // verified
      { id:'p3', title:'Generic 1', untagged:true },
      { id:'p4', title:'Generic 2', untagged:true },
      { id:'p5', title:'Generic 3', untagged:true },
    ],
    giVerify: fakeVerify,
  });
  const sus = find(ins, 'gi:suspicious');
  a(sus, 'Surfaces suspicious GI claims');
  a(sus.text.includes('1'), 'Counts suspicious claims in the text');
  a(sus.priority === 'high', 'Suspicious GIs are high priority (trust risk)');
  const unt = find(ins, 'gi:untagged');
  a(unt, 'Surfaces untagged catalog when share is high enough');
  a(unt.text.includes('3'), 'Counts untagged in the text');
}

// ────────────────────────────────────────────────────────────
sec('TOURISM SIGNALS — uses injected tourism intel');
{
  const fakeScore = (op, h) => ({
    score: op.licenseVerified ? 70 : 20,
    tier: op.licenseVerified ? 'standard' : 'blocked',
    reasons: [],
  });
  const fakeSeasonal = () => [
    { category: 'heritage', priority: 'high', window: 'winter peak', why: 'Rajasthan winter circuit' },
  ];
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    tourismIntel: {
      operators: [
        { spec: { licenseVerified: false }, history: {} },
        { spec: { licenseVerified: true },  history: {} },
      ],
      scoreOperator: fakeScore,
      seasonalSignals: fakeSeasonal,
    },
  });
  a(find(ins, 'tourism:operator-quality'), 'Surfaces operator quality issue when any operator is blocked/probationary');
  a(find(ins, 'tourism:operator-quality').text.includes('1'), 'Counts probationary operators');
  a(ins.some(i => i.id.startsWith('tourism:seasonal:')), 'Surfaces a seasonal push');
  a(ins.some(i => i.text.includes('heritage') && i.text.includes('winter peak')), 'Names the category and window');
}

// ────────────────────────────────────────────────────────────
sec('SUBSCRIPTION COHORT — surfaced via injected promotionCohort()');
{
  const fakeCohort = () => ({
    cohortSize: 3,
    expectedMrrLiftPaise: 1150000,  // ₹11,500
    offers: [
      { seller: {id:'s1'}, offer: { fromName:'Karigar', toName:'Vyapari', evidence:'crossed Karigar ceiling' } },
    ],
  });
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    promotionCohort: fakeCohort,
  });
  const promo = find(ins, 'subscriptions:cohort');
  a(promo,                              'Surfaces the promotion cohort');
  a(promo.priority === 'high',          'High priority — direct revenue impact');
  a(/3 seller/i.test(promo.text),       'Counts the cohort');
  a(promo.text.includes('11,500'),      'Quotes the expected MRR lift');
  a(/Karigar.*Vyapari/i.test(promo.reason), 'Reason names the top offer');
}

// ────────────────────────────────────────────────────────────
sec('GRIEVANCE SIGNALS — surfaces SLA breaches via injection');
{
  const now = Date.now();
  const fakeBreaches = (grievances) => grievances.map(g => ({
    grievance: g,
    sla: { ackBreached: g.severity === 'high', resolveBreached: false, ackHoursLeft: 0, resolveDaysLeft: 5, needsEscalation: true },
  }));
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    grievances: [
      { id:'g1', status:'open', severity:'high' },
      { id:'g2', status:'open', severity:'med' },
    ],
    slaBreaches: fakeBreaches,
    now,
  });
  const gIns = find(ins, 'grievance:sla-breach');
  a(gIns, 'Surfaces grievance SLA breaches');
  a(gIns.priority === 'critical', 'Ack-overdue breaches are CRITICAL priority');
  a(/24h|regulatory/i.test(gIns.text + ' ' + gIns.reason), 'Mentions regulatory exposure');
}

sec('DOCUMENT VERIFICATION SIGNALS — pending and failed surface');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    docVerifications: [
      { status: 'failed' },
      { status: 'failed' },
      { status: 'manual_review' },
      { status: 'verified' },
    ],
  });
  const failedIns = find(ins, 'docs:failed');
  const manualIns = find(ins, 'docs:manual-review');
  a(failedIns,                        'Surfaces failed-doc count');
  a(failedIns.text.includes('2'),     'Counts failed verifications');
  a(failedIns.priority === 'high',    'Failed docs high priority (seller cannot transact)');
  a(manualIns,                        'Surfaces manual-review queue');
  a(manualIns.text.includes('1'),     'Counts manual reviews');
}

// ────────────────────────────────────────────────────────────
sec('UNIT ECONOMICS SIGNALS — tier health, campaigns, approvals');
{
  // Unhealthy tier (negative margin) → critical
  const ins1 = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    unitEconomics: {
      profitabilityReport: [
        { tier:'karigar', name:'Karigar', marginPaise: -5000, marginPct: -10, revenuePaise: 50000, costPaise: 55000, healthy: false },
        { tier:'niryatak', name:'Niryatak', marginPaise: 200000, marginPct: 40, revenuePaise: 500000, costPaise: 300000, healthy: true },
      ],
    },
  });
  const tierIns = find(ins1, 'economics:tier-margin');
  a(tierIns,                              'Surfaces unhealthy tier');
  a(tierIns.priority === 'critical',      'Negative margin → CRITICAL');
  a(/losing money/i.test(tierIns.text),   'Names the loss');
  a(/Karigar/.test(tierIns.text),         'Names the tier');
}

{
  // Pending campaign (HITL approval needed)
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    unitEconomics: {
      pendingCampaigns: [
        { channel:'google', budgetPaise: 8000000 },
        { channel:'facebook', budgetPaise: 6000000 },
      ],
    },
  });
  const camp = find(ins, 'economics:campaign-approval');
  a(camp,                                'Surfaces pending campaign approvals');
  a(camp.priority === 'high',            'High priority');
  a(/2 marketing campaign/.test(camp.text), 'Counts pending campaigns');
  a(camp.text.includes('14,00,000') || camp.text.includes('1,40,000'),
    'Reports total budget (₹14L total = 14,00,000)');
}

{
  // Ready-to-run green campaign (no approval needed)
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    unitEconomics: {
      rankedCampaigns: [
        { campaign: { channel:'whatsapp', budgetPaise: 500000 },
          result: { decision: 'green', requiresApproval: false, expectedNewSellers: 20, cacPaise: 25000, paybackMonths: 4 }
        },
      ],
    },
  });
  const ready = find(ins, 'economics:campaign-ready');
  a(ready,                                  'Surfaces ready campaigns');
  a(ready.priority === 'med',               'Medium priority (not urgent)');
  a(ready.text.includes('whatsapp'),        'Names the channel');
  a(/payback/i.test(ready.reason),          'Reason mentions payback');
}

sec('AD-SPEND SIGNALS — margin floor, pending approvals, push opportunity');
{
  // Sellers below floor
  const ins1 = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    adSpend: {
      sellersBelowFloor: [
        { sellerId: 'cust_low_margin', adjustedMarginPct: 12 },
        { sellerId: 'cust_other', adjustedMarginPct: 18 },
      ],
    },
  });
  const floor = find(ins1, 'ads:margin-below-floor');
  a(floor,                                       'Surfaces below-floor warning');
  a(floor.priority === 'critical',               'Critical priority');
  a(floor.text.includes('cust_low_margin'),      'Names the worst seller');
  a(floor.text.includes('12%'),                  'Names the margin %');
}

{
  // Pending ad approvals
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    adSpend: {
      pendingApprovals: [
        { sellerId: 's1', plannedSpendPaise: 80000 },
        { sellerId: 's2', plannedSpendPaise: 60000 },
      ],
    },
  });
  const queue = find(ins, 'ads:approval-queue');
  a(queue,                                       'Surfaces ad approval queue');
  a(queue.priority === 'high',                   'High priority');
  a(/2 ad campaigns/.test(queue.text),           'Counts campaigns awaiting');
  a(/1,400/.test(queue.text),                    'Reports the total budget (₹1,400)');
}

{
  // Push-more opportunity (high headroom)
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    adSpend: {
      headroomRanking: [
        { sellerId: 'cust_top', tier: 'niryatak', currentMarginPct: 48, headroomBeforeFloorPaise: 250000 },
      ],
    },
  });
  const push = find(ins, 'ads:push-opportunity');
  a(push,                                        'Surfaces push opportunity');
  a(push.text.includes('cust_top'),              'Names the seller');
  a(push.text.includes('niryatak'),              'Names the tier');
}

{
  // Low headroom — don't surface (below threshold)
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    adSpend: {
      headroomRanking: [
        { sellerId: 'cust_small', tier: 'karigar', currentMarginPct: 32, headroomBeforeFloorPaise: 10000 },
      ],
    },
  });
  const push = find(ins, 'ads:push-opportunity');
  a(!push,                                       'Below-threshold headroom not surfaced');
}

sec('GEM EXPORT COMPLIANCE — blocked listings surface as critical');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    gemExportCompliance: {
      blockedListings: [
        { productId: 'p_ivory', title: 'Ivory bangle', rule: 'CITES_APPENDIX_I' },
        { productId: 'p_coral', title: 'Coral necklace', rule: 'CITES_PERMIT_MISSING' },
      ],
    },
  });
  const blocked = find(ins, 'compliance:export-blocked');
  a(blocked,                                       'Surfaces blocked listings');
  a(blocked.priority === 'critical',               'Critical priority');
  a(/2 export listings blocked/.test(blocked.text),'Counts blocked');
  a(blocked.text.includes('p_ivory'),              'Names top blocked');
  a(/CITES_APPENDIX_I/.test(blocked.reason),       'Reason names the rule');
}

sec('OPERATIONAL COST — inference dominance surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    operationalCost: {
      currentScenario: {
        totalCostPaise: 1000000,
        byCategory: { inference: 800000, infra: 200000 },
        opexPctOfRevenue: 5,
      },
    },
  });
  const cost = find(ins, 'cost:inference-dominant');
  a(cost,                                           'Surfaces inference dominance');
  a(/80%/.test(cost.text),                          'Names the percentage');
  a(/Sonnet\/Haiku mix/.test(cost.reason),           'Reason suggests Sonnet/Haiku optimization');
}

sec('OPERATIONAL COST — elevated opex surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    operationalCost: {
      currentScenario: {
        totalCostPaise: 500000,
        byCategory: { inference: 200000, infra: 300000 },
        opexPctOfRevenue: 25,
      },
    },
  });
  const opex = find(ins, 'cost:opex-elevated');
  a(opex,                                          'Surfaces elevated opex');
  a(opex.priority === 'high',                       'High priority');
  a(/25%/.test(opex.text),                          'Names the percentage');
}

sec('OPERATIONAL COST — healthy opex not surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    operationalCost: {
      currentScenario: {
        totalCostPaise: 100000,
        byCategory: { inference: 50000, infra: 50000 },
        opexPctOfRevenue: 3,
      },
    },
  });
  const opex = find(ins, 'cost:opex-elevated');
  a(!opex,                                          'Healthy opex below threshold not surfaced');
}

sec('SOURCING SIGNALS — top priority lead surfaces');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    sourcing: {
      priorityLeads: [
        { id: 'l1', name: 'Surat Diamond', suggestedTier: 'niryatak', score: 95, source: 'gjepc_member_directory' },
        { id: 'l2', name: 'Khurja Pottery', suggestedTier: 'vyapari', score: 70, source: 'gi_tag_holders' },
      ],
    },
  });
  const top = find(ins, 'sourcing:contact-top-lead');
  a(top,                                               'Surfaces top priority lead');
  a(top.priority === 'high',                            'High priority');
  a(top.text.includes('Surat Diamond'),                 'Names the top lead');
  a(top.text.includes('niryatak'),                      'Names the tier');
  a(top.text.includes('95'),                            'Names the score');
}

sec('SOURCING SIGNALS — dormant leads surface');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    sourcing: {
      dormantLeads: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }],
    },
  });
  const dorm = find(ins, 'sourcing:dormant-leads');
  a(dorm,                                               'Surfaces dormant leads');
  a(/3 leads have gone dormant/.test(dorm.text),        'Reports count');
}

sec('SOURCING SIGNALS — funnel leak surfaces');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    sourcing: {
      funnel: { leakiestStep: 'responded_to_demo_scheduled', leakiestRatePct: 18.2 },
    },
  });
  const leak = find(ins, 'sourcing:funnel-leak');
  a(leak,                                               'Surfaces funnel leak');
  a(leak.priority === 'high',                            'High priority');
  a(/18\.2%/.test(leak.text),                            'Names the rate');
}

sec('SOURCING SIGNALS — healthy funnel rate not surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    sourcing: {
      funnel: { leakiestStep: 'new_to_researched', leakiestRatePct: 70 },
    },
  });
  const leak = find(ins, 'sourcing:funnel-leak');
  a(!leak,                                              'Healthy 70% rate not surfaced');
}

sec('SOURCING SIGNALS — stalled sourcing surfaces');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    sourcing: { daysSinceLastLead: 10 },
  });
  const stalled = find(ins, 'sourcing:no-new-leads');
  a(stalled,                                            'Surfaces stalled sourcing');
  a(/10 days/.test(stalled.text),                       'Names the days');
}

sec('SOURCING SIGNALS — recent activity not surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    sourcing: { daysSinceLastLead: 3 },
  });
  const stalled = find(ins, 'sourcing:no-new-leads');
  a(!stalled,                                           'Fresh sourcing not surfaced');
}

sec('RETURNS SIGNALS — SLA breach');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    returns: {
      breaches: [
        { returnId: 'ret_1', orderId: 'ord_42', currentStatus: 'approved', overdueDays: 4, targetDays: 3 },
        { returnId: 'ret_2', orderId: 'ord_43', currentStatus: 'requested', overdueDays: 2, targetDays: 2 },
      ],
    },
  });
  const b = find(ins, 'returns:sla-breach');
  a(b,                                                  'Surfaces SLA breach');
  a(b.priority === 'critical',                          'Critical priority');
  a(b.text.includes('ord_42'),                          'Names the most-overdue order');
  a(b.text.includes('4d'),                              'Reports overdue days');
}

sec('RETURNS SIGNALS — HITL queue');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    returns: {
      pendingHitl: [
        { returnId: 'ret_x', originalSlicePaise: 8000000 },
        { returnId: 'ret_y', originalSlicePaise: 6000000 },
      ],
    },
  });
  const h = find(ins, 'returns:hitl-queue');
  a(h,                                                  'Surfaces HITL queue');
  a(/2 high-value/.test(h.text),                        'Counts items');
  a(/1,40,000|1,40000/.test(h.text),                    'Names total ₹1.4L');
}

sec('RETURNS SIGNALS — high refund rate');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    returns: {
      summary: { refundRate: 22, total: 50 },
    },
  });
  const h = find(ins, 'returns:high-refund-rate');
  a(h,                                                  'Surfaces high refund rate');
  a(h.priority === 'high',                              'High priority');
  a(/22%/.test(h.text),                                 'Names the rate');
}

sec('RETURNS SIGNALS — healthy refund rate not surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    returns: {
      summary: { refundRate: 4, total: 50 },
    },
  });
  const h = find(ins, 'returns:high-refund-rate');
  a(!h,                                                 'Healthy 4% rate not surfaced');
}

sec('RETURNS SIGNALS — low sample size suppresses rate alert');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    returns: {
      summary: { refundRate: 50, total: 4 },  // 50% but only 4 returns
    },
  });
  const h = find(ins, 'returns:high-refund-rate');
  a(!h,                                                 'Low sample size (4) suppresses alert');
}

sec('OPS SIGNALS — health failing surfaces as critical');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'saas_subscription'}],
    operations: {
      healthSummary: { ok: 4, warn: 1, fail: 2, total: 7 },
    },
  });
  const h = find(ins, 'ops:health-failing');
  a(h,                                                   'Surfaces health-failing signal');
  a(h.priority === 'critical',                           'Critical priority');
  a(/2 health checks failing/.test(h.text),              'Reports count');
}

sec('OPS SIGNALS — top runbook surfaces');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    operations: {
      recommendedRunbooks: [
        { triggeredBy: 'store_size', level: 'fail', evidence: '60MB store',
          runbook: { id: 'migrate_to_postgres', title: 'Migrate from file store to Postgres', estimated_minutes: 240, autonomy: 'manual', steps: [] } },
      ],
    },
  });
  const h = find(ins, 'ops:top-runbook');
  a(h,                                                   'Surfaces top runbook');
  a(h.priority === 'critical',                           'FAIL → critical');
  a(/Migrate from file store to Postgres/.test(h.text),  'Names runbook title');
}

sec('OPS SIGNALS — overdue windows');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    operations: {
      dueWindows: [
        { key: 'weekly_backup_verify', overdueDays: 5, label: 'Weekly backup' },
      ],
    },
  });
  const h = find(ins, 'ops:windows-overdue');
  a(h,                                                   'Surfaces overdue windows');
  a(h.text.includes('5d'),                               'Reports days overdue');
}

sec('OPS SIGNALS — fresh windows not surfaced');
{
  const ins = generateInsights({
    customers: [{id:'c1',model:'merchant_of_record'}],
    operations: {
      dueWindows: [
        { key: 'daily_inference_cost', overdueDays: 1 },
      ],
    },
  });
  const h = find(ins, 'ops:windows-overdue');
  a(!h,                                                  'Only 1d overdue does not surface');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
