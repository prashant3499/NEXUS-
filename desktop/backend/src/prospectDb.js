'use strict';

/**
 * prospectDb.js
 *
 * Auto-sourcing finds authentic candidates, but until now the results were
 * ephemeral — generated on demand and forgotten. A real business needs its own
 * DATABASE: the candidates you've discovered, their stage in the pipeline, who
 * touched them last, and the institutional partners who help you reach them.
 *
 * This is that database — a lightweight CRM over two record kinds:
 *
 *   1. PROSPECTS — sourced sellers (artisans, cooperatives, exporters, tourism
 *      operators) ingested from autoSource, deduped by a stable key, each
 *      moving through a pipeline (sourced → contacted → engaged → onboarded /
 *      rejected / dormant).
 *
 *   2. PARTNERS — the "white-collar bodies" and partnering entities that give
 *      reach and trust: GI registries, handicraft & handloom boards, export
 *      promotion councils, the Development Commissioner (Handicrafts), NABARD/
 *      SIDBI, banks for payouts, NGOs and SHGs that aggregate artisans. These
 *      aren't customers — they're channels and credibility.
 *
 * Pure functions over a plain state object that the server persists. No deps.
 */

const STAGE = Object.freeze({
  SOURCED: 'sourced', CONTACTED: 'contacted', ENGAGED: 'engaged',
  ONBOARDED: 'onboarded', REJECTED: 'rejected', DORMANT: 'dormant',
});

const STAGE_ORDER = ['sourced', 'contacted', 'engaged', 'onboarded'];

// Kinds of institutional partner ("white-collar body"). Real categories.
const PARTNER_KIND = Object.freeze({
  GI_REGISTRY: 'gi_registry',                 // Geographical Indications Registry
  HANDICRAFT_BOARD: 'handicraft_board',       // state/central handicraft & handloom boards
  EXPORT_COUNCIL: 'export_council',           // EPCH, etc.
  DEV_COMMISSIONER: 'dev_commissioner',       // O/o Development Commissioner (Handicrafts/Handlooms)
  FINANCE_BODY: 'finance_body',               // NABARD, SIDBI, banks
  BANK: 'bank',                               // payout / settlement banking partner
  NGO: 'ngo',                                 // artisan-aggregating NGOs / foundations
  SHG: 'shg',                                 // self-help groups / federations
  TOURISM_BOARD: 'tourism_board',             // state tourism departments
});

// A curated seed of REAL institutional bodies relevant to India's craft economy.
// These are well-known public entities — not fabricated. Contact specifics are
// intentionally omitted (the founder/partnerships lead fills those in).
const SEED_PARTNERS = Object.freeze([
  { id: 'gi_registry_chennai', kind: PARTNER_KIND.GI_REGISTRY, name: 'Geographical Indications Registry, Chennai', role: 'Authoritative source + verification of GI-tagged crafts', reach: 'all GI crafts' },
  { id: 'dc_handicrafts', kind: PARTNER_KIND.DEV_COMMISSIONER, name: 'Office of the Development Commissioner (Handicrafts)', role: 'Artisan ID cards, cluster schemes, marketing support', reach: 'national artisans' },
  { id: 'dc_handlooms', kind: PARTNER_KIND.DEV_COMMISSIONER, name: 'Office of the Development Commissioner (Handlooms)', role: 'Weaver registration + handloom schemes', reach: 'national weavers' },
  { id: 'epch', kind: PARTNER_KIND.EXPORT_COUNCIL, name: 'Export Promotion Council for Handicrafts (EPCH)', role: 'Exporter directory, fairs, export readiness', reach: 'handicraft exporters' },
  { id: 'nabard', kind: PARTNER_KIND.FINANCE_BODY, name: 'NABARD', role: 'SHG financing, rural artisan credit linkages', reach: 'rural SHGs + clusters' },
  { id: 'sidbi', kind: PARTNER_KIND.FINANCE_BODY, name: 'SIDBI', role: 'Small-enterprise credit for registered sellers', reach: 'MSME sellers' },
  { id: 'state_handicraft_boards', kind: PARTNER_KIND.HANDICRAFT_BOARD, name: 'State Handicraft & Handloom Development Corporations', role: 'Cluster access, emporium networks', reach: 'state clusters' },
  { id: 'incredible_india', kind: PARTNER_KIND.TOURISM_BOARD, name: 'State Tourism Departments', role: 'Craft-tourism routing, operator licensing context', reach: 'tourism operators' },
]);

/** A fresh, empty database. */
function emptyDb() {
  return { prospects: {}, partners: {}, seeded: false };
}

/** Seed the institutional partners once (idempotent). */
function seedPartners(db) {
  if (db.seeded) return db;
  for (const p of SEED_PARTNERS) {
    if (!db.partners[p.id]) db.partners[p.id] = { ...p, status: 'prospective', added_at: Date.now(), linked_prospects: 0 };
  }
  db.seeded = true;
  return db;
}

/** Stable dedup key for a sourced candidate. */
function _key(candidate) {
  return candidate.candidate_id || ((candidate.name || '') + '|' + (candidate.segment || '')).toLowerCase().replace(/\s+/g, '_');
}

/**
 * ingest — add/refresh auto-sourced candidates into the database. Deduped:
 * an existing prospect is refreshed (score/signals) but its stage + history are
 * preserved, so re-running sourcing never resets your pipeline progress.
 * @returns { added, refreshed, total }
 */
function ingest(db, candidates = [], now = Date.now()) {
  let added = 0, refreshed = 0;
  for (const c of candidates) {
    const key = _key(c);
    const existing = db.prospects[key];
    if (existing) {
      existing.score = c.score != null ? c.score : existing.score;
      existing.signals = c.signals || existing.signals;
      existing.last_seen = now;
      refreshed++;
    } else {
      db.prospects[key] = {
        key,
        candidate_id: c.candidate_id,
        name: c.name, segment: c.segment, tier: c.tier,
        gi_craft: c.gi_craft || null, region: c.region || null, category: c.category || null,
        source: c.source, score: c.score != null ? c.score : 0,
        signals: c.signals || {},
        provenance: c.provenance || null,
        stage: STAGE.SOURCED,
        partner_id: c.source || null,   // which channel/body surfaced it
        history: [{ stage: STAGE.SOURCED, at: now }],
        added_at: now, last_seen: now,
      };
      added++;
      // Tie the prospect to the institutional partner that surfaced it.
      if (c.source && db.partners[c.source]) db.partners[c.source].linked_prospects++;
    }
  }
  return { added, refreshed, total: Object.keys(db.prospects).length };
}

/** Move a prospect to a new stage, recording history. */
function advance(db, key, stage, by, now = Date.now()) {
  const p = db.prospects[key];
  if (!p) return { ok: false, error: 'prospect not found' };
  if (!Object.values(STAGE).includes(stage)) return { ok: false, error: 'invalid stage' };
  p.stage = stage;
  p.history.push({ stage, at: now, by: by || 'system' });
  return { ok: true, prospect: p };
}

/** Query prospects with simple filters. */
function listProspects(db, { stage, segment, partner_id, minScore, limit } = {}) {
  let rows = Object.values(db.prospects);
  if (stage) rows = rows.filter((p) => p.stage === stage);
  if (segment) rows = rows.filter((p) => p.segment === segment);
  if (partner_id) rows = rows.filter((p) => p.partner_id === partner_id);
  if (minScore != null) rows = rows.filter((p) => (p.score || 0) >= minScore);
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  return limit ? rows.slice(0, limit) : rows;
}

/** Pipeline funnel counts + conversion. */
function funnel(db) {
  const counts = { sourced: 0, contacted: 0, engaged: 0, onboarded: 0, rejected: 0, dormant: 0 };
  for (const p of Object.values(db.prospects)) counts[p.stage] = (counts[p.stage] || 0) + 1;
  const total = Object.values(db.prospects).length;
  return {
    counts, total,
    onboard_rate: total ? Math.round((counts.onboarded / total) * 100) : 0,
    active: counts.sourced + counts.contacted + counts.engaged,
  };
}

/** Partners list, optionally by kind, with how many prospects each surfaced. */
function listPartners(db, { kind } = {}) {
  let rows = Object.values(db.partners);
  if (kind) rows = rows.filter((p) => p.kind === kind);
  return rows.sort((a, b) => (b.linked_prospects || 0) - (a.linked_prospects || 0));
}

/** Add or update a partner (e.g. a real MoU signed). */
function upsertPartner(db, partner, now = Date.now()) {
  if (!partner) return { ok: false, error: 'partner required' };
  const id = partner.id || (partner.name ? partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') : null);
  if (!id) return { ok: false, error: 'partner id or name required' };
  // A new partner needs a name; updating an existing one by id does not.
  if (!db.partners[id] && !partner.name) return { ok: false, error: 'new partner requires a name' };
  db.partners[id] = { ...(db.partners[id] || { added_at: now, linked_prospects: 0 }), ...partner, id };
  return { ok: true, partner: db.partners[id] };
}

module.exports = {
  STAGE, STAGE_ORDER, PARTNER_KIND, SEED_PARTNERS,
  emptyDb, seedPartners, ingest, advance, listProspects, funnel, listPartners, upsertPartner,
};
