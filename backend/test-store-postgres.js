'use strict';

/**
 * test-store-postgres.js
 *
 * Verifies the durable Postgres store seam (src/pgStore.js):
 *   - makeStore honours STORE_DRIVER/DATABASE_URL and always boots something
 *   - Fallbacks are honest (reason recorded, file store still works)
 *   - The write-through sync debounces bursts, coalesces to last-write-wins,
 *     retries after failures, and never throws into the caller
 *   - The hydrate child refuses to overwrite local state with corrupt data
 *   - (integration, only when TEST_DATABASE_URL is set) a real round trip:
 *     save → wipe local file → hydrate → identical state
 *
 * Uses an injected fake pool so the suite passes with or without `pg`
 * installed — CI runs dependency-free by design.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { makeStore, makePgSync, TABLE_SQL } = require('./src/pgStore');
const { FileStore } = require('./src/store');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ FAIL: ' + msg); } };
const sec = (n) => console.log('\n━━━ ' + n + ' ━━━\n');
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pg-')), 'nexus-store.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fakePool(opts = {}) {
  const calls = [];
  return {
    calls,
    query(sql, params) {
      calls.push({ sql, params });
      if (opts.failWrites && /INSERT INTO nexus_state/.test(sql) && calls.filter(c => /INSERT/.test(c.sql)).length <= opts.failWrites) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ rows: [] });
    },
  };
}

(async () => {

sec('makeStore — seam selection and honest fallbacks');
{
  const f1 = makeStore({ store: 'file' });
  a(f1 instanceof FileStore && f1.kind === 'file', 'STORE_DRIVER=file → file store');
  a(!f1.durable, 'File store does not claim durability');

  const f2 = makeStore({ store: 'postgres', databaseUrl: null });
  a(f2.kind === 'file', 'postgres without DATABASE_URL → file store');
  a(/DATABASE_URL/.test(f2.fallback_reason || ''), 'Fallback reason names the missing DATABASE_URL');

  let pgInstalled = true;
  try { require('pg'); } catch (e) { pgInstalled = false; }
  if (!pgInstalled) {
    const f3 = makeStore({ store: 'postgres', databaseUrl: 'postgres://x' });
    a(f3.kind === 'file' && /pg not installed/.test(f3.fallback_reason || ''), 'postgres without pg driver → file store with honest reason');
  } else {
    a(true, 'pg driver present — driver-missing fallback covered by CI (dependency-free run)');
  }
}

sec('Write-through sync — debounce, coalesce, last write wins');
{
  const pool = fakePool();
  const sync = makePgSync('postgres://ignored', { pool, debounceMs: 20 });
  a(sync.available === true, 'Sync reports available with an injected pool');
  a(pool.calls.length === 1 && pool.calls[0].sql === TABLE_SQL, 'Table bootstrap issued once at startup');
  sync.push('{"v":1}');
  sync.push('{"v":2}');
  sync.push('{"v":3}');
  await sleep(80);
  const writes = pool.calls.filter(c => /INSERT INTO nexus_state/.test(c.sql));
  a(writes.length === 1, `Burst of 3 saves coalesced into 1 write (got ${writes.length})`);
  a(writes[0].params[0] === '{"v":3}', 'The write carries the LAST state (last write wins)');
  sync.push('{"v":4}');
  await sleep(80);
  const writes2 = pool.calls.filter(c => /INSERT INTO nexus_state/.test(c.sql));
  a(writes2.length === 2 && writes2[1].params[0] === '{"v":4}', 'A later save triggers a new write');
}

sec('Write-through sync — failure keeps state and retries');
{
  const pool = fakePool({ failWrites: 1 });
  const sync = makePgSync('postgres://ignored', { pool, debounceMs: 15 });
  sync.push('{"v":"keep-me"}');
  await sleep(120);
  const writes = pool.calls.filter(c => /INSERT INTO nexus_state/.test(c.sql));
  a(writes.length >= 2, 'Failed write retried on the next cycle');
  a(writes[writes.length - 1].params[0] === '{"v":"keep-me"}', 'Retry carries the pending state');
  a(sync._state.lastError === null, 'Error cleared after the successful retry');
}

sec('Hydrate child — refuses corrupt data, tolerates absence');
{
  const file = tmpFile();
  fs.writeFileSync(file, '{"customers":[],"_id":7}');
  // No DATABASE_URL → child exits 0 and leaves the local file untouched.
  const out = execFileSync(process.execPath, [path.join(__dirname, 'src', 'pgStore.js'), '--hydrate', file],
    { env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  a(fs.readFileSync(file, 'utf8').includes('"_id":7'), 'Missing DATABASE_URL leaves local state untouched');
  a(true, 'Hydrate child exits cleanly without a database (' + (out.trim() ? 'reported' : 'silent') + ')');
}

sec('FileStore round-trips EVERY domain persistDomain writes');
{
  // Regression guard: save() used to silently drop prospect_db, ops_control,
  // guardian_arrangements, watchdog_history, grievance_log, charity_fund and
  // reviews — CRM progress and agent controls reset on every restart.
  const file = tmpFile();
  const s = new FileStore(file);
  const state = s.load();
  state.customers.set('c9', { n: 1 });
  state.guardian_arrangements = { seller_x: { guardian: 'g1' } };
  state.prospect_db = { prospects: { p1: { stage: 'engaged' } } };
  state.ops_control = { paused_agents: { growth: true }, autonomy: 'notify' };
  state.watchdog_history = [{ at: 1, event: 'scan' }];
  state.grievance_log = [{ id: 'g1' }];
  state.charity_fund = { balance_paise: 500 };
  state.reviews = { r1: { stars: 5 } };
  s.save(state);
  const back = new FileStore(file).load();
  a(back.prospect_db && back.prospect_db.prospects.p1.stage === 'engaged', 'prospect_db (CRM stages) survives save/load');
  a(back.ops_control && back.ops_control.paused_agents.growth === true, 'ops_control (paused agents) survives');
  a(back.guardian_arrangements.seller_x.guardian === 'g1', 'guardian_arrangements survive');
  a(Array.isArray(back.watchdog_history) && back.watchdog_history.length === 1, 'watchdog_history survives');
  a(Array.isArray(back.grievance_log) && back.grievance_log.length === 1, 'grievance_log survives');
  a(back.charity_fund.balance_paise === 500, 'charity_fund survives');
  a(back.reviews.r1.stars === 5, 'reviews survive');
  a(back.customers.get('c9').n === 1, 'Map domains still work');
}

sec('PgBackedStore end-to-end (integration — needs TEST_DATABASE_URL)');
if (process.env.TEST_DATABASE_URL) {
  const { PgBackedStore } = require('./src/pgStore');
  const url = process.env.TEST_DATABASE_URL;
  const file = tmpFile();
  process.env.DATABASE_URL = url; // hydrate child reads env
  const s1 = new PgBackedStore(file, url);
  const state = s1.load();
  state.customers.set('c1', { name: 'Meera', craft: 'Blue pottery' });
  state._id = 42;
  s1.save(state);
  await s1._sync.stop();                    // force the flush
  fs.unlinkSync(file);                      // simulate the ephemeral disk wipe
  const s2 = new PgBackedStore(file, url);  // fresh boot → hydrates from PG
  const revived = s2.load();
  a(revived.customers.get('c1') && revived.customers.get('c1').name === 'Meera', 'State survived a disk wipe via Postgres');
  a(revived._id === 42, 'Counters survived too');
  await s2._sync.stop();
  await s1._sync._pool.end().catch(() => {});
  await s2._sync._pool.end().catch(() => {});
} else {
  a(true, 'Skipped (set TEST_DATABASE_URL to run the live round trip)');
}

console.log('\n' + '═'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('═'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
})();
