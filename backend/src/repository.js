'use strict';
/**
 * repository — a uniform CRUD layer over domain entities. Every write is validated by the
 * domain model and emitted to the tamper-evident audit log. In-memory Maps now; the same
 * interface maps 1:1 onto Postgres tables at deploy (swap the persistence, keep the API).
 */
const domain = require('./domain');
const auditLog = require('./auditLog');

const _tables = new Map(); // kind -> Map(id -> entity)

function _table(kind) { if (!_tables.has(kind)) _tables.set(kind, new Map()); return _tables.get(kind); }

function create(kind, data, by) {
  const r = domain.create(kind, data);
  if (!r.ok) return r;
  _table(kind).set(r.entity.id, r.entity);
  auditLog.append({ action: 'create', kind, id: r.entity.id, by: by || 'system' });
  return r;
}

function get(kind, id) { const e = _table(kind).get(id); return e ? { ok: true, entity: e } : { ok: false, error: 'not found' }; }

function update(kind, id, patch, by) {
  const cur = _table(kind).get(id);
  if (!cur) return { ok: false, error: 'not found' };
  const merged = Object.assign({}, cur, patch, { id: cur.id, kind: cur.kind, createdAt: cur.createdAt, updatedAt: new Date().toISOString() });
  const v = domain.validate(kind, merged);
  if (!v.ok) return v;
  const next = Object.assign({}, merged, v.value);
  _table(kind).set(id, next);
  auditLog.append({ action: 'update', kind, id, by: by || 'system', fields: Object.keys(patch || {}) });
  return { ok: true, entity: next };
}

function remove(kind, id, by) {
  const had = _table(kind).delete(id);
  if (had) auditLog.append({ action: 'delete', kind, id, by: by || 'system' });
  return { ok: had, error: had ? undefined : 'not found' };
}

function list(kind) { return Array.from(_table(kind).values()); }
function find(kind, predicate) { return list(kind).filter(predicate); }
function count(kind) { return _table(kind).size; }
function reset() { _tables.clear(); }

module.exports = { create, get, update, remove, list, find, count, reset };
