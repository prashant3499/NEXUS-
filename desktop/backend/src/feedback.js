'use strict';
/**
 * feedback — capture input from everyone testing NEXUS (artisans, buyers, institutions,
 * founder) during UAT/pilot. Sanitised, in-memory for the demo; point `store` at Postgres
 * at deploy. Closes the "feedback loop" gap flagged in SAAS-BENCHMARK.
 */
const sanitize = require('./sanitize');
const ROLES = ['artisan', 'buyer', 'institution', 'founder', 'other'];
const AREAS = ['onboarding', 'listing', 'shop', 'checkout', 'cockpit', 'payments', 'language', 'performance', 'other'];

const _store = [];

function record(input) {
  input = input || {};
  const role = ROLES.indexOf(String(input.role || '').toLowerCase()) >= 0 ? input.role.toLowerCase() : 'other';
  const area = AREAS.indexOf(String(input.area || '').toLowerCase()) >= 0 ? input.area.toLowerCase() : 'other';
  const entry = {
    id: 'fb_' + (Date.now().toString(36)) + '_' + (_store.length + 1),
    role, area,
    rating: sanitize.sanitizeNumber(input.rating, 1, 5, 3),
    message: sanitize.sanitizeString(input.message, 1000),
    at: new Date().toISOString(),
  };
  _store.push(entry);
  return entry;
}

function list(filter) {
  filter = filter || {};
  return _store.filter((e) => (!filter.role || e.role === filter.role) && (!filter.area || e.area === filter.area));
}

function summary() {
  const byRole = {}, byArea = {}; let sum = 0;
  _store.forEach((e) => { byRole[e.role] = (byRole[e.role] || 0) + 1; byArea[e.area] = (byArea[e.area] || 0) + 1; sum += e.rating; });
  return { total: _store.length, avg_rating: _store.length ? +(sum / _store.length).toFixed(2) : null, by_role: byRole, by_area: byArea };
}

function reset() { _store.length = 0; }

module.exports = { ROLES, AREAS, record, list, summary, reset };
