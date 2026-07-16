'use strict';

/**
 * test-prospect-db.js — the SaaS's own prospect database + partner registry.
 *   - Ingests auto-sourced candidates, deduped, preserving pipeline progress
 *   - Tracks lifecycle stages with history
 *   - Funnel counts + conversion
 *   - Institutional partners (white-collar bodies) seeded + linked to prospects
 */

const P = require('./src/prospectDb');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const cand = [
  { candidate_id: 'auto_banarasi_karigar', name: 'Banarasi cluster', segment: 'karigar_prospect', tier: 'karigar', score: 100, source: 'state_handicraft_boards', signals: { hasGITag: true } },
  { candidate_id: 'auto_moradabad_vyapari', name: 'Moradabad brass', segment: 'vyapari_prospect', tier: 'vyapari', score: 70, source: 'epch' },
];

sec('Seed institutional partners (white-collar bodies)');
{
  const db = P.seedPartners(P.emptyDb());
  const partners = P.listPartners(db);
  a(partners.length >= 8, 'Seeds real institutional bodies (GI registry, DC Handicrafts, EPCH, NABARD…)');
  a(partners.some(p => p.kind === P.PARTNER_KIND.GI_REGISTRY), 'Includes the GI Registry');
  a(partners.some(p => p.kind === P.PARTNER_KIND.EXPORT_COUNCIL), 'Includes an export council');
  a(P.seedPartners(db).seeded === true, 'Seeding is idempotent');
}

sec('Ingest sourced candidates → persistent prospects');
{
  const db = P.seedPartners(P.emptyDb());
  const r = P.ingest(db, cand);
  a(r.added === 2 && r.total === 2, 'Adds new prospects');
  a(db.prospects[Object.keys(db.prospects)[0]].stage === P.STAGE.SOURCED, 'New prospect starts at sourced');
  // Re-ingest: dedup, no progress reset
  P.advance(db, 'auto_banarasi_karigar', P.STAGE.ENGAGED, 'agent1');
  const r2 = P.ingest(db, cand);
  a(r2.added === 0 && r2.refreshed === 2, 'Re-ingest refreshes, does not duplicate');
  a(db.prospects['auto_banarasi_karigar'].stage === P.STAGE.ENGAGED, 'Pipeline progress preserved across re-source');
}

sec('Partner linkage');
{
  const db = P.seedPartners(P.emptyDb());
  P.ingest(db, cand);
  const epch = P.listPartners(db).find(p => p.id === 'epch');
  a(epch.linked_prospects === 1, 'Partner tracks how many prospects it surfaced');
}

sec('Lifecycle + funnel');
{
  const db = P.seedPartners(P.emptyDb());
  P.ingest(db, cand);
  P.advance(db, 'auto_banarasi_karigar', P.STAGE.CONTACTED, 'agent1');
  P.advance(db, 'auto_banarasi_karigar', P.STAGE.ONBOARDED, 'agent1');
  const p = db.prospects['auto_banarasi_karigar'];
  a(p.history.length === 3, 'Stage history recorded (sourced→contacted→onboarded)');
  const f = P.funnel(db);
  a(f.counts.onboarded === 1, 'Funnel counts onboarded');
  a(f.onboard_rate === 50, 'Onboard rate = 1/2 = 50%');
  const bad = P.advance(db, 'nope', P.STAGE.ENGAGED);
  a(bad.ok === false, 'Advancing a missing prospect fails cleanly');
  const badStage = P.advance(db, 'auto_moradabad_vyapari', 'flying');
  a(badStage.ok === false, 'Invalid stage rejected');
}

sec('Query + upsert partner (e.g. MoU signed)');
{
  const db = P.seedPartners(P.emptyDb());
  P.ingest(db, cand);
  const karigars = P.listProspects(db, { segment: 'karigar_prospect' });
  a(karigars.length === 1 && karigars[0].segment === 'karigar_prospect', 'Filters prospects by segment');
  const top = P.listProspects(db, { minScore: 80 });
  a(top.length === 1, 'Filters by minimum score');
  const up = P.upsertPartner(db, { id: 'epch', status: 'mou_signed' });
  a(up.ok && db.partners.epch.status === 'mou_signed', 'Can update a partner (MoU signed)');
  const newp = P.upsertPartner(db, { name: 'Dastkar NGO', kind: P.PARTNER_KIND.NGO });
  a(newp.ok && db.partners['dastkar_ngo'], 'Can add a new partner');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
