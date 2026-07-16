'use strict';

/**
 * test-fraud-detection.js — the risk engine.
 *   - Clean transaction → allow
 *   - Risk signals accumulate → review (hold), not silent block
 *   - Blocklist / extreme signals → block
 *   - Every verdict is explainable (signals listed)
 *   - Account fraud (shared payout, device cluster)
 */

const F = require('./src/fraudDetection');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const NOW = 1_000_000_000_000;

sec('Clean transaction → allow');
{
  const r = F.scoreTransaction(
    { amount_paise: 250000, buyer_id: 'b1', device_id: 'd1', ship_country: 'IN', bill_country: 'IN', ip_country: 'IN', contact: 'ravi@gmail.com' },
    { recentOrders: [], accountAgeDays: 120, failedPayments: 0, deviceAddresses: 1, now: NOW });
  a(r.verdict === 'allow', 'No signals → allow');
  a(r.score === 0, 'Score 0');
  a(Array.isArray(r.signals), 'Signals array present (explainable)');
}

sec('Velocity → review (held, not blocked)');
{
  const recent = [{ at: NOW - 1000 }, { at: NOW - 2000 }, { at: NOW - 3000 }];
  const r = F.scoreTransaction({ amount_paise: 100000, buyer_id: 'b1', device_id: 'd1' }, { recentOrders: recent, now: NOW });
  a(r.signals.some(s => s.signal === 'velocity_orders'), 'Flags order velocity');
  a(r.verdict === 'review', 'Velocity alone → review, not block');
  a(/hold for human review/i.test(r.recommendation), 'Recommends human review (HITL)');
}

sec('Multiple signals stack → block');
{
  const recent = [{ at: NOW - 1000, amount_paise: 3000000 }, { at: NOW - 2000, amount_paise: 3000000 }, { at: NOW - 3000, amount_paise: 3000000 }];
  const r = F.scoreTransaction(
    { amount_paise: 3000000, buyer_id: 'b1', device_id: 'd1', ship_country: 'IN', bill_country: 'US', ip_country: 'RU', contact: 'x@mailinator.com' },
    { recentOrders: recent, accountAgeDays: 0, failedPayments: 4, deviceAddresses: 5, now: NOW });
  a(r.score >= F.BLOCK_THRESHOLD, 'Many signals push score over block threshold');
  a(r.verdict === 'block', 'Stacked signals → block');
  a(r.signals.length >= 4, 'Lists all contributing signals');
}

sec('Blocklist → hard block regardless of score');
{
  const r = F.scoreTransaction({ amount_paise: 100, buyer_id: 'badguy', device_id: 'd9' }, { blocklist: ['badguy'], now: NOW });
  a(r.verdict === 'block', 'Blocklisted buyer → block');
  a(r.signals.some(s => s.signal === 'blocklist_hit'), 'Names the blocklist hit');
}

sec('Geo mismatch + disposable contact');
{
  const r = F.scoreTransaction({ amount_paise: 100000, buyer_id: 'b2', ship_country: 'IN', bill_country: 'NG', ip_country: 'IN', contact: 'a@tempmail.com' }, { now: NOW });
  a(r.signals.some(s => s.signal === 'geo_mismatch'), 'Flags geo mismatch');
  a(r.signals.some(s => s.signal === 'disposable_contact'), 'Flags disposable contact');
}

sec('Account fraud — payout harvesting');
{
  const shared = F.scoreAccount({ payoutAccount: 'acct1', idVerified: true }, { sharedPayoutCount: 4 });
  a(shared.signals.some(s => s.signal === 'shared_payout'), 'Flags a shared payout account');
  const cluster = F.scoreAccount({ idVerified: false }, { sameDeviceSellers: 5, rapidListings: 30 });
  a(cluster.verdict !== 'allow', 'Device-cluster + listing-flood account → not allow');
  a(cluster.signals.some(s => s.signal === 'device_cluster'), 'Flags device cluster');
}

sec('Score is bounded');
{
  const r = F.scoreTransaction({ buyer_id: 'b', amount_paise: 9999999 }, { blocklist: ['b'], recentOrders: [{at:NOW},{at:NOW},{at:NOW}], failedPayments: 9, deviceAddresses: 9, now: NOW });
  a(r.score <= 100, 'Score capped at 100');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
