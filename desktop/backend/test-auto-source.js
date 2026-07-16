'use strict';

/**
 * test-auto-source.js
 *
 * Verifies the auto-sourcing engine is strong, clean, and authentic:
 *   - Every candidate is grounded in a real GI craft + real source channel
 *   - Synthesized fields are always flagged + verify-before-outreach set
 *   - Dedup is clean (no duplicate craft×segment)
 *   - Ranking is by score desc
 *   - Filters (segment, state, category, minScore, limit) work
 *   - Candidates promote into the real lead pipeline
 */

const AS = require('./src/autoSource');
const sourcing = require('./src/sourcing');
const giRegistry = require('./src/giRegistry');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const registrySize = Array.isArray(giRegistry.REGISTRY) ? giRegistry.REGISTRY.length : Object.keys(giRegistry.REGISTRY).length;

sec('Authenticity — grounded in real data');
{
  const r = AS.autoSource({ limit: 100 });
  a(r.authentic === true, 'Result flagged authentic');
  a(r.candidates.length > 0, 'Produces candidates');
  a(r.candidates.every(c => (c.provenance.gi_registry && c.provenance.gi_registry.authentic) || (c.provenance.cluster && c.provenance.cluster.authentic)), 'Every candidate grounded in GI registry OR a real cluster');
  a(r.candidates.every(c => c.region && (c.gi_craft || c.craft)), 'Every candidate has a real craft + region');
  a(r.candidates.every(c => sourcing.LEAD_SOURCES[c.source]), 'Every source is a real enumeration channel');
  a(r.candidates.every(c => c.provenance.verify_before_outreach === true), 'All flagged verify-before-outreach');
  a(r.candidates.every(c => c.provenance.synthesized_fields.includes('name')), 'Synthesized name always flagged (never presented as a real person)');
}

sec('No fabricated contact data');
{
  const r = AS.autoSource({ limit: 100 });
  // Critical authenticity guard: the engine must NOT invent phone/email.
  a(r.candidates.every(c => !c.phone && !c.email), 'No fabricated phone or email on any candidate');
}

sec('Clean — dedup + valid segments');
{
  const r = AS.autoSource({ limit: 100 });
  const ids = r.candidates.map(c => c.candidate_id);
  a(new Set(ids).size === ids.length, 'No duplicate candidate_id (clean dedup)');
  const validSegs = Object.values(sourcing.SEGMENTS);
  a(r.candidates.every(c => validSegs.includes(c.segment)), 'Every segment is valid');
  a(r.candidates.every(c => Number.isFinite(c.score)), 'Every score is a real number');
}

sec('Ranking — score descending');
{
  const r = AS.autoSource({ limit: 20 });
  let ordered = true;
  for (let i = 1; i < r.candidates.length; i++) {
    if (r.candidates[i].score > r.candidates[i - 1].score) { ordered = false; break; }
  }
  a(ordered, 'Candidates ranked by score descending');
}

sec('Filters');
{
  const limited = AS.autoSource({ limit: 5 });
  a(limited.candidates.length <= 5, 'limit respected');

  const tn = AS.autoSource({ state: 'tamil nadu', limit: 50 });
  a(tn.candidates.length > 0, 'State filter returns matches for Tamil Nadu');
  a(tn.candidates.every(c => c.states.map(s => s.toLowerCase()).includes('tamil nadu')), 'All matches are actually in Tamil Nadu');

  const textiles = AS.autoSource({ category: 'textile', limit: 50 });
  a(textiles.candidates.length > 0, 'Category filter returns textiles');
  a(textiles.candidates.every(c => c.category === 'textile'), 'All matches are textile');

  const highBar = AS.autoSource({ minScore: 90, limit: 50 });
  a(highBar.candidates.every(c => c.score >= 90), 'minScore filter respected');

  const seg = AS.autoSource({ segment: sourcing.SEGMENTS.SANSTHAN, limit: 50 });
  a(seg.candidates.every(c => c.segment === sourcing.SEGMENTS.SANSTHAN), 'Segment filter respected');
}

sec('Coverage — multiple segments discovered');
{
  const all = AS.autoSource({ limit: 100 });
  const segs = new Set(all.candidates.map(c => c.segment));
  a(segs.size >= 2, `Discovers multiple customer segments (${[...segs].join(', ')})`);
  a(all.total_available === all.candidates.length || all.total_available >= all.returned, 'total_available reported');
}

sec('Expanded supply universe — non-GI clusters + establishment types');
{
  const all = AS.autoSource({ limit: 500 });
  a(all.total_available > 54, `Supply universe exceeds GI-only (now ${all.total_available})`);
  const types = new Set(all.candidates.map(c => c.establishment_type));
  a(types.has('factory'), 'Includes factories');
  a(types.has('shop') || types.has('showroom'), 'Includes shops/showrooms');
  a(types.has('online_seller'), 'Includes e-commerce / online sellers');
  a(types.has('exporter'), 'Includes exporters');
  a(types.has('artisan'), 'Includes artisans');
  a(all.by_type && Object.keys(all.by_type).length >= 4, 'Reports a by_type breakdown');
  const nonGi = AS.autoSource({ giTagged: false, limit: 500 });
  a(nonGi.total_available > 0, `Non-GI candidates exist (${nonGi.total_available})`);
  a(nonGi.candidates.every(c => c.gi_tagged === false), 'giTagged:false returns only non-GI');
  const giOnly = AS.autoSource({ giTagged: true, limit: 500 });
  a(giOnly.candidates.every(c => c.gi_tagged === true), 'giTagged:true returns only GI');
  const factories = AS.autoSource({ establishmentType: 'factory', limit: 50 });
  a(factories.candidates.length > 0 && factories.candidates.every(c => c.establishment_type === 'factory'), 'establishmentType filter isolates factories');
  const exporters = AS.autoSource({ establishmentType: 'exporter', limit: 50 });
  a(exporters.candidates.every(c => c.segment === sourcing.SEGMENTS.NIRYATAK), 'Exporters route to Niryatak');
  a(all.candidates.every(c => c.provenance && (c.provenance.gi_registry || c.provenance.cluster)), 'Every candidate traces to GI registry OR a real cluster');
  a(all.candidates.every(c => !c.phone && !c.email), 'Still no fabricated contacts anywhere');
}

sec('Promotion into the lead pipeline');
{
  const r = AS.autoSource({ limit: 1 });
  const cand = r.candidates[0];
  const lead = AS.promoteCandidate(cand);
  a(lead && lead.id, 'Candidate promotes to a real lead');
  a(lead.status === sourcing.LEAD_STATUS.NEW || lead.status === 'new', 'Promoted lead starts in new status');
  a(lead.source === cand.source, 'Lead carries the candidate source');
  // Promotion requires source + segment
  let threw = false;
  try { AS.promoteCandidate({}); } catch (e) { threw = true; }
  a(threw, 'Promotion rejects an invalid candidate');
}

sec('Determinism — same input, same output');
{
  const r1 = AS.autoSource({ limit: 10 });
  const r2 = AS.autoSource({ limit: 10 });
  a(JSON.stringify(r1.candidates.map(c => c.candidate_id)) === JSON.stringify(r2.candidates.map(c => c.candidate_id)),
    'Deterministic candidate ordering across runs');
}

sec('Product templates — authentic GI + non-GI marketplace seed');
{
  const t = AS.productTemplates({ limit: 200 });
  a(t.templates.length > 0, 'Produces product templates');
  a(t.gi_count > 0 && t.non_gi_count > 0, `Includes BOTH GI (${t.gi_count}) and non-GI cluster (${t.non_gi_count}) products`);
  a(t.templates.every(x => x.region && x.title), 'Every template has a real title + region');
  a(t.templates.every(x => x.suggested_price_paise >= x.min_price_paise), 'Suggested price >= min for category');
  a(t.templates.every(x => x.is_template === true), 'Flagged as template (nothing pretends to physically exist)');
  // GI ones carry a verified tag; non-GI carry a cluster origin instead
  a(t.templates.filter(x => x.gi_verified).every(x => x.gi_tag), 'GI templates carry a GI tag');
  a(t.templates.filter(x => !x.gi_verified).every(x => x.cluster), 'Non-GI templates carry a cluster origin');
  // GI-only filter
  const giOnly = AS.productTemplates({ giTagged: true, limit: 200 });
  a(giOnly.templates.every(x => x.gi_verified), 'giTagged:true returns only GI-verified products');
  // Category filter
  const tex = AS.productTemplates({ category: 'textile', limit: 50 });
  a(tex.templates.every(x => x.category === 'textile'), 'Category filter works');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed (registry size: ${registrySize})`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
