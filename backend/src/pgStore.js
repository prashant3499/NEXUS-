'use strict';

/**
 * pgStore.js — durable Postgres persistence behind the existing store seam.
 *
 * The platform's whole state flows through ONE FileStore (load/save of a
 * single JSON document). On hosts with ephemeral disks (Render free tier)
 * that file — and every order, consent and audit record in it — dies on
 * each deploy or restart. This module makes the SAME document durable:
 *
 *   • Boot:  hydrate the local file from Postgres (synchronously, via a
 *            short-lived child process, so the server's synchronous
 *            module-load state initialisation reads warm data).
 *   • Save:  after every atomic file save, push the serialised state to
 *            Postgres (debounced write-through; last write wins).
 *
 * Design notes, honestly:
 *   - One row (`nexus_state.id = 1`) holding the whole document. At pilot
 *     scale (a few MB) this is simple, atomic and correct. The relational
 *     DDL in docs/BACKEND-SCHEMA.md remains the scale-up path; this makes
 *     the data DURABLE today without rewriting 125 modules.
 *   - `pg` is the single sanctioned dependency (see CLAUDE.md rule 2),
 *     lazily required ONLY when STORE_DRIVER=postgres. Without it, or
 *     without DATABASE_URL, everything falls back to the file store with
 *     an honest reason — boot never breaks.
 *
 * This file is both a module and the hydrate child:
 *   node src/pgStore.js --hydrate <filePath>   (DATABASE_URL from env)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FileStore } = require('./store');

const TABLE_SQL =
  'CREATE TABLE IF NOT EXISTS nexus_state (' +
  'id INT PRIMARY KEY, state TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())';

/** Lazily require pg. Returns { pg } or { error }. */
function loadPg() {
  try { return { pg: require('pg') }; }
  catch (e) { return { error: 'pg not installed — `npm install` (pg is the sanctioned store dependency)' }; }
}

/**
 * makePgSync — write-through pusher. Debounces bursts (persistDomain fires on
 * every mutation) and coalesces to the latest state; last write wins.
 * `poolFactory` is injectable for tests.
 */
function makePgSync(databaseUrl, opts = {}) {
  const debounceMs = opts.debounceMs != null ? opts.debounceMs : 250;
  let pool = null;
  if (opts.pool) {
    pool = opts.pool;
  } else {
    const { pg, error } = loadPg();
    if (error) return { available: false, reason: error, push: () => {}, stop: () => {} };
    pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  }
  const ready = pool.query(TABLE_SQL).catch((e) => { state.lastError = e.message; });
  const state = { pending: null, timer: null, inFlight: false, pushes: 0, lastError: null };

  async function flush() {
    if (state.inFlight || state.pending === null) return;
    const doc = state.pending;
    state.pending = null;
    state.inFlight = true;
    try {
      await ready;
      await pool.query(
        'INSERT INTO nexus_state (id, state, updated_at) VALUES (1, $1, now()) ' +
        'ON CONFLICT (id) DO UPDATE SET state = $1, updated_at = now()', [doc]);
      state.pushes++;
      state.lastError = null;
    } catch (e) {
      state.lastError = e.message;
      // Keep the latest doc so the next save retries.
      if (state.pending === null) state.pending = doc;
    } finally {
      state.inFlight = false;
      if (state.pending !== null) schedule();
    }
  }

  function schedule() {
    if (state.timer) return;
    state.timer = setTimeout(() => { state.timer = null; flush(); }, debounceMs);
    if (state.timer.unref) state.timer.unref();
  }

  return {
    available: true,
    push(serialised) { state.pending = serialised; schedule(); },
    stop() { if (state.timer) clearTimeout(state.timer); return flush(); },
    _state: state,
    _pool: pool,
  };
}

/**
 * hydrateFileSync — before the server's synchronous state init runs, pull the
 * last persisted state from Postgres into the local file. Runs `this` module
 * as a short-lived child so the parent stays synchronous. Best-effort: any
 * failure leaves the (possibly absent) local file as-is and boot continues.
 */
function hydrateFileSync(filePath) {
  try {
    execFileSync(process.execPath, [__filename, '--hydrate', filePath], {
      env: process.env, timeout: 20000, stdio: ['ignore', 'inherit', 'inherit'],
    });
    return true;
  } catch (e) {
    console.error('[pgStore] hydrate skipped:', e.message);
    return false;
  }
}

/** PgBackedStore — FileStore semantics + Postgres durability. */
class PgBackedStore extends FileStore {
  constructor(filePath, databaseUrl) {
    hydrateFileSync(filePath || path.join(__dirname, '..', 'data', 'nexus-store.json'));
    super(filePath);
    this.kind = 'postgres';
    this.durable = true;
    this._sync = makePgSync(databaseUrl);
  }
  save(state) {
    super.save(state);                                   // atomic local write (source for reads)
    try { this._sync.push(fs.readFileSync(this.filePath, 'utf8')); } catch (e) { /* best-effort */ }
  }
}

/**
 * makeStore — the seam the server calls. Postgres when configured AND the
 * driver loads; otherwise the file store with an honest reason on the
 * instance (surfaced in the boot line).
 */
function makeStore(config = {}) {
  const filePath = config.dataDir ? path.join(config.dataDir, 'nexus-store.json') : undefined;
  if (config.store === 'postgres' && config.databaseUrl) {
    const { error } = loadPg();
    if (!error) return new PgBackedStore(filePath, config.databaseUrl);
    const fallback = new FileStore(filePath);
    fallback.kind = 'file';
    fallback.fallback_reason = error;
    console.error('[pgStore] falling back to file store:', error);
    return fallback;
  }
  const fileStore = new FileStore(filePath);
  fileStore.kind = 'file';
  if (config.store === 'postgres' && !config.databaseUrl) {
    fileStore.fallback_reason = 'STORE_DRIVER=postgres but DATABASE_URL is missing';
    console.error('[pgStore] falling back to file store: DATABASE_URL missing');
  }
  return fileStore;
}

module.exports = { makeStore, makePgSync, PgBackedStore, hydrateFileSync, TABLE_SQL };

/* ── Child mode: --hydrate <filePath> ── */
if (require.main === module && process.argv[2] === '--hydrate') {
  const target = process.argv[3];
  const url = process.env.DATABASE_URL;
  (async () => {
    if (!target || !url) { console.error('[pgStore] hydrate: missing file path or DATABASE_URL'); process.exit(0); }
    const { pg, error } = loadPg();
    if (error) { console.error('[pgStore] hydrate: ' + error); process.exit(0); }
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query(TABLE_SQL);
      const r = await client.query('SELECT state FROM nexus_state WHERE id = 1');
      if (r.rows[0] && r.rows[0].state) {
        JSON.parse(r.rows[0].state); // refuse to write a corrupt doc over local state
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const tmp = target + '.tmp';
        fs.writeFileSync(tmp, r.rows[0].state, 'utf8');
        fs.renameSync(tmp, target);
        console.log('[pgStore] hydrated state from Postgres (' + r.rows[0].state.length + ' bytes)');
      } else {
        console.log('[pgStore] no persisted state in Postgres yet — starting from local/empty');
      }
    } catch (e) {
      console.error('[pgStore] hydrate failed (continuing with local state):', e.message);
    } finally {
      try { await client.end(); } catch (e) {}
    }
    process.exit(0);
  })();
}
