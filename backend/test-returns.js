'use strict';

const R = require('./src/returns');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ─── Helpers ──────────────────────────────────────────────────
const NOW = 1735689600000;  // Fixed reference time for deterministic tests
const day = (n) => n * 86400000;

const baseArgs = {
  orderId: 'ord_1', buyerId: 'b1', sellerId: 's1',
  originalSlicePaise: 100000,  // ₹1,000
  deliveredAt: NOW - day(2),    // delivered 2 days ago
  reason: 'not_as_described', notes: 'colour did not match the listing',
  now: NOW,
};

// ════════════════════════════════════════════════════════════
sec('CREATE — basic valid request');
{
  const r = R.createReturn(baseArgs);
  a(r.id.startsWith('ret_'),                    'ID has correct prefix');
  a(r.status === 'requested',                    'Starts in requested status');
  a(r.autoRejected === false,                    'Not auto-rejected (within window)');
  a(r.requiresHitl === false,                    '₹1,000 is below HITL threshold');
  a(r.history.length === 1,                      'History has create entry');
  a(r.history[0].from === null,                  'Create entry has null from');
  a(r.history[0].to === 'requested',             'Create entry goes to requested');
  a(r.originalSlicePaise === 100000,             'Slice preserved');
  a(r.orderId === 'ord_1',                       'Order ID preserved');
}

sec('CREATE — validation');
{
  let threw = false;
  try { R.createReturn({}); } catch (e) { threw = true; }
  a(threw, 'No orderId throws');

  threw = false;
  try { R.createReturn({ ...baseArgs, originalSlicePaise: -100 }); } catch (e) { threw = true; }
  a(threw, 'Negative slice throws');

  threw = false;
  try { R.createReturn({ ...baseArgs, reason: 'unknown_reason' }); } catch (e) { threw = true; }
  a(threw, 'Unknown reason throws');

  threw = false;
  try { R.createReturn({ ...baseArgs, deliveredAt: null }); } catch (e) { threw = true; }
  a(threw, 'Null deliveredAt throws');
}

sec('CREATE — out of return window auto-expires');
{
  const r = R.createReturn({
    ...baseArgs,
    deliveredAt: NOW - day(10),  // 10 days ago — past 7-day window
  });
  a(r.status === 'expired',                       'Out-of-window → expired');
  a(r.autoRejected === true,                       'Marked auto-rejected');
  a(/window/i.test(r.autoRejectReason),            'Reason mentions window');
  a(r.history.length === 1,                        'Single history entry');
}

sec('CREATE — at the boundary (exactly 7 days)');
{
  // Just inside the boundary
  const r1 = R.createReturn({ ...baseArgs, deliveredAt: NOW - (day(7) - 1) });
  a(r1.status === 'requested',                     '6.999 days → still in window');

  // Just outside
  const r2 = R.createReturn({ ...baseArgs, deliveredAt: NOW - (day(7) + 1) });
  a(r2.status === 'expired',                       '7.001 days → expired');
}

sec('CREATE — customized products policy-rejected');
{
  const r = R.createReturn({ ...baseArgs, isCustomized: true });
  a(r.status === 'rejected',                       'Customized → rejected');
  a(r.autoRejected === true,                       'Marked auto-rejected');
  a(/customized/i.test(r.autoRejectReason),        'Reason mentions customized');
}

sec('CREATE — high-value flags HITL');
{
  const r = R.createReturn({ ...baseArgs, originalSlicePaise: 6000000 });  // ₹60,000
  a(r.status === 'requested',                       'High-value still requested');
  a(r.requiresHitl === true,                        'Flagged as requires HITL');
  a(/High-value/.test(r.hitlReason),                'HITL reason mentions high-value');
}

// ════════════════════════════════════════════════════════════
sec('TRANSITIONS — happy path: requested → approved → in_transit → received → refunded');
{
  let r = R.createReturn(baseArgs);
  r = R.transitionStatus(r, 'approved', 'seller approved', NOW + day(1));
  a(r.status === 'approved',                        'Moved to approved');
  a(r.history.length === 2,                          'History has 2 entries');

  r = R.transitionStatus(r, 'in_transit', 'buyer shipped via India Post', NOW + day(2));
  r = R.transitionStatus(r, 'received', 'seller received', NOW + day(5));
  r = R.transitionStatus(r, 'refunded', 'refund issued via Razorpay', NOW + day(6));
  a(r.status === 'refunded',                        'Fully refunded');
  a(r.history.length === 5,                          'All transitions recorded');
  a(r.history[4].to === 'refunded',                  'Last entry is refunded');
}

sec('TRANSITIONS — invalid jumps throw');
{
  const r = R.createReturn(baseArgs);

  let threw = false;
  try { R.transitionStatus(r, 'refunded'); } catch (e) { threw = true; }
  a(threw, 'Cannot jump requested → refunded');

  threw = false;
  try { R.transitionStatus(r, 'received'); } catch (e) { threw = true; }
  a(threw, 'Cannot jump requested → received');
}

sec('TRANSITIONS — terminal states sticky');
{
  let r = R.createReturn(baseArgs);
  r = R.transitionStatus(r, 'rejected', 'seller declined');
  let threw = false;
  try { R.transitionStatus(r, 'approved'); } catch (e) { threw = true; }
  a(threw, 'Cannot un-reject');

  r = R.createReturn({ ...baseArgs, deliveredAt: NOW - day(10) });
  // This one started expired
  threw = false;
  try { R.transitionStatus(r, 'requested'); } catch (e) { threw = true; }
  a(threw, 'Cannot un-expire');
}

sec('TRANSITIONS — original return not mutated');
{
  const r1 = R.createReturn(baseArgs);
  const r2 = R.transitionStatus(r1, 'approved');
  a(r1.status === 'requested',                      'Original still requested');
  a(r2.status === 'approved',                       'New is approved');
  a(r1.history.length === 1,                         'Original history unchanged');
  a(r2.history.length === 2,                         'New history has both');
}

sec('TRANSITIONS — in_transit can expire (package lost)');
{
  let r = R.createReturn(baseArgs);
  r = R.transitionStatus(r, 'approved');
  r = R.transitionStatus(r, 'in_transit');
  r = R.transitionStatus(r, 'expired', 'package lost in transit, never received');
  a(r.status === 'expired',                         'Can expire from in_transit');
}

sec('TRANSITIONS — received can be rejected (condition check fail)');
{
  let r = R.createReturn(baseArgs);
  r = R.transitionStatus(r, 'approved');
  r = R.transitionStatus(r, 'in_transit');
  r = R.transitionStatus(r, 'received');
  r = R.transitionStatus(r, 'rejected', 'item damaged by buyer, not refundable');
  a(r.status === 'rejected',                        'Can reject from received');
}

// ════════════════════════════════════════════════════════════
sec('REFUND CALC — seller-fault: full refund + platform commission reversed');
{
  let r = R.createReturn({ ...baseArgs, reason: 'not_as_described' });
  r = R.transitionStatus(r, 'approved');
  r = R.transitionStatus(r, 'in_transit');
  r = R.transitionStatus(r, 'received');

  // Original slice: maker ₹800, platform ₹100, gst ₹50, tcs ₹10, charity ₹2,
  // insurance ₹20, gateway_fee ₹18 → total ₹1,000
  const reverseSlice = {
    maker: 80000, platform: 10000, gst: 5000, tcs: 1000,
    charity: 200, insurance: 2000, gateway_fee: 1800,
  };
  const refund = R.computeRefund(r, reverseSlice);
  a(refund.sellerFault === true,                                'Seller-fault flagged');
  a(refund.breakdown.makerReversed === 80000,                   'Maker reversed');
  a(refund.breakdown.platformReversed === 10000,                'Platform reversed (seller-fault)');
  a(refund.breakdown.platformRetained === 0,                    'Nothing retained as commission');
  a(refund.breakdown.charityRetained === 200,                   'Charity NEVER refunded');
  a(refund.breakdown.gatewayRefunded === 1800,                  'Gateway fee refunded to buyer (seller-fault)');
  a(refund.buyerRefundPaise === 80000 + 10000 + 5000 + 1000 + 2000 + 1800,
                                                                 'Total refund: ₹998 (everything except charity)');
}

sec('REFUND CALC — changed mind: platform commission retained');
{
  let r = R.createReturn({ ...baseArgs, reason: 'changed_mind' });
  r = R.transitionStatus(r, 'approved');
  r = R.transitionStatus(r, 'in_transit');
  r = R.transitionStatus(r, 'received');

  const reverseSlice = {
    maker: 80000, platform: 10000, gst: 5000, tcs: 1000,
    charity: 200, insurance: 2000, gateway_fee: 1800,
  };
  const refund = R.computeRefund(r, reverseSlice);
  a(refund.sellerFault === false,                               'Not seller-fault');
  a(refund.breakdown.platformReversed === 0,                    'Platform commission NOT reversed');
  a(refund.breakdown.platformRetained === 10000,                'Platform commission retained');
  a(refund.breakdown.gatewayRefunded === 0,                     'Gateway fee NOT refunded');
  a(refund.breakdown.gatewayRetained === 1800,                  'Gateway fee retained');
  a(refund.buyerRefundPaise < 90000,                            'Less than full original');
}

sec('REFUND CALC — damaged in transit: carrier-fault, insurance retained for claim');
{
  let r = R.createReturn({ ...baseArgs, reason: 'damaged_in_transit' });
  r = R.transitionStatus(r, 'approved');
  r = R.transitionStatus(r, 'in_transit');
  r = R.transitionStatus(r, 'received');

  const reverseSlice = {
    maker: 80000, platform: 10000, gst: 5000, tcs: 1000,
    charity: 200, insurance: 2000, gateway_fee: 1800,
  };
  const refund = R.computeRefund(r, reverseSlice);
  a(refund.carrierFault === true,                               'Carrier-fault flagged');
  a(refund.breakdown.insuranceRetained === 2000,                'Insurance retained for claim');
  a(refund.breakdown.insuranceReversed === 0,                   'Insurance not reversed');
}

sec('REFUND CALC — can only run on received status');
{
  const r = R.createReturn(baseArgs);
  let threw = false;
  try { R.computeRefund(r, {}); } catch (e) { threw = true; }
  a(threw, 'computeRefund on requested throws');

  let r2 = R.createReturn(baseArgs);
  r2 = R.transitionStatus(r2, 'approved');
  r2 = R.transitionStatus(r2, 'in_transit');
  threw = false;
  try { R.computeRefund(r2, {}); } catch (e) { threw = true; }
  a(threw, 'computeRefund on in_transit throws');
}

// ════════════════════════════════════════════════════════════
sec('SLA — within target: not breached');
{
  const r = R.createReturn(baseArgs);
  const check = R.checkSLA(r, NOW + day(1));   // 1 day in requested status (target is 2)
  a(check.breached === false,                   'Within SLA → not breached');
  a(check.currentStatus === 'requested',         'Status reported');
  a(check.remainingMs > 0,                       'Remaining time reported');
}

sec('SLA — past target: breached');
{
  const r = R.createReturn(baseArgs);
  const check = R.checkSLA(r, NOW + day(5));   // 5 days in requested (target is 2)
  a(check.breached === true,                    'Past SLA → breached');
  a(check.overdueDays === 3,                    'Overdue by 3 days');
  a(check.targetDays === 2,                     'Target was 2 days');
}

sec('SLA — terminal statuses do not breach');
{
  let r = R.createReturn(baseArgs);
  r = R.transitionStatus(r, 'rejected');
  const check = R.checkSLA(r, NOW + day(30));
  a(check.breached === false,                   'Rejected never breaches');
  a(check.reason === 'terminal',                 'Reason is terminal');
}

sec('SLA — findBreaches sorted by most overdue');
{
  const r1 = R.createReturn({ ...baseArgs, orderId: 'o1' });
  const r2 = R.createReturn({ ...baseArgs, orderId: 'o2' });
  const r3 = R.createReturn({ ...baseArgs, orderId: 'o3' });

  // r1: 5 days overdue
  // r2: 2 days overdue
  // r3: not overdue (1 day in)
  // Test "now" is NOW + day(5)
  // r3 was created NOW; check at NOW+day(1) → only 1 day in, target 2 → not breached
  // For r3 we need a different created time
  const breaches = R.findBreaches([r1, r2, r3], NOW + day(5));
  a(breaches.length === 3,                       'All 3 have been requested >2 days');
  // All three should be breached, ordered by most overdue, but they all entered at same NOW...
  // Let me use a more discriminating test
}

sec('SLA — findBreaches with varied overdue times');
{
  const r_old = R.createReturn({ ...baseArgs, orderId: 'old', now: NOW - day(10) });
  const r_mid = R.createReturn({ ...baseArgs, orderId: 'mid', now: NOW - day(5) });
  const r_new = R.createReturn({ ...baseArgs, orderId: 'new', now: NOW - day(1) });  // 1 day in, target 2 → not breached
  const breaches = R.findBreaches([r_old, r_mid, r_new], NOW);
  a(breaches.length === 2,                                'Two breaches (old + mid)');
  a(breaches[0].orderId === 'old',                         'Most-overdue first');
  a(breaches[1].orderId === 'mid',                         'Next-overdue second');
  a(breaches[0].overdueDays > breaches[1].overdueDays,     'Sorted descending by overdue');
}

// ════════════════════════════════════════════════════════════
sec('SUMMARIZE — aggregate metrics');
{
  const returns = [
    R.createReturn({ ...baseArgs, orderId: 'a' }),
    R.transitionStatus(R.createReturn({ ...baseArgs, orderId: 'b' }), 'approved'),
    (() => {
      let r = R.createReturn({ ...baseArgs, orderId: 'c' });
      r = R.transitionStatus(r, 'approved');
      r = R.transitionStatus(r, 'in_transit');
      r = R.transitionStatus(r, 'received');
      r = R.transitionStatus(r, 'refunded');
      return r;
    })(),
    R.transitionStatus(R.createReturn({ ...baseArgs, orderId: 'd' }), 'rejected'),
    R.createReturn({ ...baseArgs, orderId: 'e', deliveredAt: NOW - day(15) }),  // expired
  ];
  const s = R.summarize(returns);
  a(s.total === 5,                              '5 returns');
  a(s.refundedCount === 1,                       '1 refunded');
  a(s.rejectedCount === 1,                       '1 rejected');
  a(s.expiredCount === 1,                        '1 expired');
  a(s.inProgressCount === 2,                     '2 in progress');
  a(s.refundRate === 20,                         '20% refund rate');
  a(s.totalRefundedPaise === 100000,             '₹1,000 refunded total');
  a(s.reasonCounts.not_as_described === 5,       'Reason counts populated');
}

sec('SUMMARIZE — empty returns');
{
  const s = R.summarize([]);
  a(s.total === 0,                              'Empty input → 0');
  a(s.refundedCount === 0,                       'No refunds');
  a(s.refundRate === 0,                          'No rate');
}

// ════════════════════════════════════════════════════════════
sec('END-TO-END — full return lifecycle');
{
  // Buyer files return 1 day after delivery
  let r = R.createReturn({
    orderId: 'ord_42', buyerId: 'b_amita', sellerId: 's_ramvati',
    originalSlicePaise: 200000,  // ₹2,000
    deliveredAt: NOW - day(1),
    reason: 'quality_issue',
    notes: 'Glaze on pottery cracked',
    now: NOW,
  });
  a(r.status === 'requested',                   'Filed: requested');

  // Seller approves 1 day later (within SLA of 2 days)
  r = R.transitionStatus(r, 'approved', 'will accept return', NOW + day(1));
  const sla1 = R.checkSLA(r, NOW + day(1));
  a(sla1.breached === false,                     'Within SLA at approval');

  // Buyer ships 2 days after approval
  r = R.transitionStatus(r, 'in_transit', 'buyer shipped', NOW + day(3));

  // Carrier delivers 4 days later
  r = R.transitionStatus(r, 'received', 'seller received', NOW + day(7));

  // Seller refunds 2 days after receipt
  const refund = R.computeRefund(r, {
    maker: 160000, platform: 20000, gst: 10000, tcs: 2000,
    charity: 400, insurance: 4000, gateway_fee: 3600,
  });
  a(refund.sellerFault === true,                 'quality_issue is seller-fault');
  a(refund.buyerRefundPaise === 160000 + 20000 + 10000 + 2000 + 4000 + 3600,
                                                 'Full refund except charity');

  r = R.transitionStatus(r, 'refunded', `refunded ₹${refund.buyerRefundPaise/100} to buyer`, NOW + day(9));
  a(r.status === 'refunded',                     'Lifecycle complete');
  a(r.history.length === 5,                      'Full audit trail (5 entries)');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
