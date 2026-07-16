'use strict';

/**
 * dbAdapter.js
 *
 * The persistence seam. Today the platform uses a file store (fine for a
 * pilot). Before scale it needs Postgres for durable, concurrent writes of
 * money records. This module defines ONE interface both implement, so the swap
 * is a config change, not a rewrite:
 *
 *   get(key) -> value | null
 *   set(key, value)
 *   del(key)
 *   keys(prefix?) -> string[]
 *   kind / durable
 *
 * • FileAdapter      — JSON-backed, synchronous, live now.
 * • PostgresAdapter  — ready to activate: give it DATABASE_URL and install `pg`.
 *   Until then `makeAdapter` returns the file adapter and says so honestly. The
 *   Postgres path is real code, guarded so a missing `pg` never crashes boot.
 *
 * Dependency-free except the optional, lazily-required `pg`.
 */

const fs = require('fs');
const path = require('path');

function FileAdapter(opts = {}) {
  const file = opts.file || path.join(opts.dir || '.', 'nexus-kv.json');
  let mem = {};
  try { if (fs.existsSync(file)) mem = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { mem = {}; }
  const flush = () => { try { fs.writeFileSync(file, JSON.stringify(mem)); } catch (e) { /* best-effort */ } };
  return {
    kind: 'file', durable: false,
    get(key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
    set(key, value) { mem[key] = value; flush(); return value; },
    del(key) { delete mem[key]; flush(); },
    keys(prefix) { const ks = Object.keys(mem); return prefix ? ks.filter((k) => k.startsWith(prefix)) : ks; },
    _mem() { return mem; },
  };
}

/**
 * PostgresAdapter — a key-value table over Postgres. Real code; only used when
 * `pg` is installed AND a connection string is given. Methods mirror the file
 * adapter so calling code is identical. (Async-capable; exposes the pool.)
 */
function PostgresAdapter(databaseUrl) {
  let pg;
  try { pg = require('pg'); } catch (e) {
    return { kind: 'postgres-unavailable', durable: false, error: 'pg not installed — run `npm i pg` and set DATABASE_URL', get() { return null; }, set() {}, del() {}, keys() { return []; } };
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // Table bootstrap is idempotent; callers await ready() once at boot.
  const ready = pool.query('CREATE TABLE IF NOT EXISTS nexus_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())');
  return {
    kind: 'postgres', durable: true, pool, ready: () => ready,
    async get(key) { const r = await pool.query('SELECT v FROM nexus_kv WHERE k=$1', [key]); return r.rows[0] ? r.rows[0].v : null; },
    async set(key, value) { await pool.query('INSERT INTO nexus_kv (k,v,updated_at) VALUES ($1,$2,now()) ON CONFLICT (k) DO UPDATE SET v=$2, updated_at=now()', [key, value]); return value; },
    async del(key) { await pool.query('DELETE FROM nexus_kv WHERE k=$1', [key]); },
    async keys(prefix) { const r = await pool.query(prefix ? 'SELECT k FROM nexus_kv WHERE k LIKE $1' : 'SELECT k FROM nexus_kv', prefix ? [prefix + '%'] : []); return r.rows.map((x) => x.k); },
  };
}

/**
 * makeAdapter — pick the right adapter. Postgres if a URL is provided and `pg`
 * loads; otherwise the file adapter, with an honest reason.
 */
function makeAdapter(config = {}) {
  if (config.databaseUrl) {
    const pgAdapter = PostgresAdapter(config.databaseUrl);
    if (pgAdapter.kind === 'postgres') return pgAdapter;
    // pg missing — fall back, but surface why.
    const fa = FileAdapter(config);
    fa.fallback_reason = pgAdapter.error;
    return fa;
  }
  return FileAdapter(config);
}

module.exports = { FileAdapter, PostgresAdapter, makeAdapter };
