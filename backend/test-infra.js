'use strict';

const L = require('./src/logistics');
const W = require('./src/webhooks');
const D = require('./src/dbAdapter');
const A = require('./src/founderAdvisor');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

(async () => {

sec('Logistics — quote + shipment seam');
{
  const q = L.quote({ weight_kg: 2, mode: 'express' });
  a(q.cost_paise > 0 && q.mode === 'express', 'Quotes express shipping');
  a(L.quote({ international: true }).mode === 'international', 'International mode');
  a(L.quote({ weight_kg: 0.1 }).weight_kg === 0.5, 'Floors weight at 0.5kg');
  const courier = L.makeCourier({});
  a(courier.kind === 'mock' && courier.live === false, 'Mock courier without credentials');
  const s = L.createShipment({ from: 'Khurja', to: 'Berlin', weight_kg: 1, international: true }, courier, { order_ref: 'o1' });
  a(s.ok && s.shipment.awb, 'Creates a (mock) shipment with AWB');
  a(/not a real label/i.test(s.shipment.note), 'Mock shipment honestly labelled');
  a(L.createShipment({ from: 'x', to: 'y' }, null).ok === false, 'No courier → graceful fail');
  const live = L.makeCourier({ courierApiKey: 'k', courierId: 'id' });
  a(live.kind === 'partner' && live.live === true, 'Credentials → partner courier slot');
}

sec('Webhooks — sign / verify / retry / dead-letter');
{
  const secret = 'whsec_test';
  const payload = { event: 'payout.settled', amount: 448000 };
  const sig = W.sign(payload, secret);
  a(/^t=\d+,v1=[a-f0-9]+$/.test(sig.signature), 'Produces a signed header');
  a(W.verify(payload, sig.signature, secret) === true, 'Receiver verifies a valid signature');
  a(W.verify({ event: 'tampered' }, sig.signature, secret) === false, 'Tampered payload fails');
  a(W.verify(payload, 't=1,v1=deadbeef', secret) === false, 'Stale/forged signature fails');

  const q = W.makeQueue();
  const e = q.enqueue({ url: 'https://x', type: 'payout.settled', payload });
  a(e.ok && !e.duplicate, 'Enqueues an event');
  a(q.enqueue({ id: e.id, url: 'https://x', type: 'payout.settled', payload }).duplicate === true, 'Idempotent on same id');
  let r = await q.attempt(e.id, async () => { throw new Error('503'); }, secret);
  a(r.ok === false && r.retry_at > 0, 'Failed delivery schedules a retry');
  r = await q.attempt(e.id, async () => { return true; }, secret);
  a(r.ok === true, 'Successful delivery marks delivered');
  const e2 = q.enqueue({ url: 'https://y', type: 't', payload });
  let last;
  for (let i = 0; i < W.MAX_ATTEMPTS; i++) { last = await q.attempt(e2.id, async () => { throw new Error('down'); }, secret); if (last.dead) break; }
  a(last.dead === true, 'Exhausted retries → dead-letter');
  a(q.deadLetters().length === 1, 'Dead-letter list captured it');
}

sec('DB adapter — file live, Postgres ready-to-activate');
{
  const fa = D.FileAdapter({ file: '/tmp/nexus-test-kv-' + Date.now() + '.json' });
  a(fa.kind === 'file', 'File adapter');
  fa.set('orders:1', { total: 500000 });
  a(fa.get('orders:1').total === 500000, 'Set + get round-trips');
  fa.set('orders:2', { total: 100 });
  a(fa.keys('orders:').length === 2, 'Prefix keys');
  fa.del('orders:2');
  a(fa.get('orders:2') === null, 'Delete works');
  // No DATABASE_URL → file adapter chosen
  a(D.makeAdapter({}).kind === 'file', 'No URL → file adapter');
  // DATABASE_URL: with pg installed (the sanctioned store dependency) the
  // postgres adapter is chosen; without it, file fallback with honest reason.
  let pgInstalled = true; try { require('pg'); } catch (e) { pgInstalled = false; }
  const fallback = D.makeAdapter({ databaseUrl: 'postgres://x', file: '/tmp/nexus-test-fb.json' });
  if (pgInstalled) {
    a(fallback.kind === 'postgres' && fallback.durable === true, 'pg installed → postgres adapter chosen (durable)');
    // Bogus URL: swallow the async bootstrap failure and close the pool so
    // the test process exits cleanly.
    try { fallback.ready().catch(() => {}); } catch (e) {}
    try { fallback.pool.end().catch(() => {}); } catch (e) {}
  } else {
    a(fallback.kind === 'file' && /pg not installed/i.test(fallback.fallback_reason || ''), 'pg missing → file fallback, honest reason');
  }
}

sec('Founder advisor — what to do + who does it');
{
  const r = A.suggestTasks({
    watchdog: { findings: [{ severity: 'critical', area: 'solvency', message: 'margin thin' }] },
    compliance: { summary: { still_blocking_launch: [{ name: 'GST registration', issuer: 'GSTN' }] } },
    integrations: { summary: { blocking_live_launch: [{ name: 'Razorpay', link: 'http://x' }] } },
    metrics: { mrr_paise: 0, active_sellers: 0 },
  });
  a(r.tasks.length >= 4, 'Produces a prioritized task list');
  a(r.tasks[0].priority === 1, 'Critical watchdog item is top priority');
  a(r.tasks.some(t => t.who === 'founder' && /GST/.test(t.what)), 'Legal task assigned to the founder');
  a(r.tasks.some(t => t.who === 'ai' && /Source/.test(t.what)), 'Sourcing task assigned to the AI');
  a(r.counts.founder > 0 && r.counts.ai > 0, 'Splits work between founder and AI');
  a(/need you/.test(r.headline), 'Headline summarizes the split');
  const healthy = A.suggestTasks({ metrics: { mrr_paise: 100000, active_sellers: 10 } });
  a(/healthy|Nothing pressing/i.test(healthy.headline), 'Healthy platform → calm headline');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);

})();
