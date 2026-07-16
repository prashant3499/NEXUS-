'use strict';

/**
 * autoSource.js
 *
 * The platform's supply-side discovery engine. It produces a clean, ranked
 * list of AUTHENTIC candidate leads — artisans, exporters, cooperatives, tour
 * operators — by cross-referencing two sources of ground truth already in the
 * codebase:
 *
 *   1. giRegistry — 54 real Geographical-Indication crafts (Banarasi saree,
 *      Pochampally ikat, Pashmina, Channapatna toys, …) with real regions,
 *      states, and craft descriptions.
 *   2. sourcing.LEAD_SOURCES — 8 real Indian enumeration channels (GI tag
 *      holders, GJEPC, EPCH, Udyam, FPO database, state handicraft boards,
 *      tourism operator registry, IndiaMART) each mapped to a customer segment.
 *
 * "Authentic" here means: every candidate is grounded in a real craft + real
 * region + real source channel. The engine never invents a craft or a place.
 * It does synthesize a plausible producer handle (so the founder has something
 * to act on), but every such field is clearly flagged `synthesized: true` and
 * must be verified before outreach — we never present a fabricated phone
 * number or name as real.
 *
 * "Clean" means: deterministic dedup (one candidate per craft×region×segment),
 * scored with the existing sourcing.scoreLead, ranked, and capped.
 *
 * The output feeds sourcing.createLead — auto-sourcing and manual addition
 * converge on the same lead pipeline.
 */

const giRegistry = require('./giRegistry');
const sourcing = require('./sourcing');
const supplyClusters = require('./supplyClusters');

// Map a GI craft category → the best-fit source channel. These are the REAL
// categories present in the GI registry (textile, craft, food, spice). The
// customer SEGMENT is derived from the scorer's bestTier, not hardcoded, so
// the routing reflects the actual signal profile rather than a guess.
const CATEGORY_SOURCE = Object.freeze({
  textile: 'state_handicraft_boards',   // handloom artisans → Karigar route
  craft:   'epch_member_directory',     // handicraft producers
  food:    'fpo_database',              // producer organisations / cooperatives
  spice:   'fpo_database',
});
const DEFAULT_SOURCE = 'gi_tag_holders';

// Map a scorer bestTier → the customer segment + best source channel for
// reaching that tier in India.
const TIER_TO_SEGMENT = Object.freeze({
  karigar:  { segment: sourcing.SEGMENTS.KARIGAR,  source: 'state_handicraft_boards' },
  vyapari:  { segment: sourcing.SEGMENTS.VYAPARI,  source: 'gi_tag_holders' },
  niryatak: { segment: sourcing.SEGMENTS.NIRYATAK, source: 'gjepc_member_directory' },
  sansthan: { segment: sourcing.SEGMENTS.SANSTHAN, source: 'fpo_database' },
  pravasi:  { segment: sourcing.SEGMENTS.PRAVASI,  source: 'tourism_operator_registry' },
});

/**
 * Derive scorer signal flags from a GI entry's category. Different craft
 * categories have genuinely different producer profiles in India, so we vary
 * the signals by category — this lets the scorer route each craft to the tier
 * that actually fits rather than a blanket guess.
 */
function _signalsFor(giEntry) {
  const cat = (giEntry.category || '').toLowerCase();
  if (cat === 'textile') {
    // Handloom weavers — classic Karigar: registered artisan, often no GST.
    return { registeredArtisan: true, hasGITag: true, hasNoGST: true, hasNoIEC: true, hasBankAccount: true };
  }
  if (cat === 'craft') {
    // Handicraft producers — often small registered businesses (Vyapari).
    return { hasGITag: true, hasGST: true, hasWebsite: true, hasBankAccount: true, registeredArtisan: true };
  }
  if (cat === 'food' || cat === 'spice') {
    // Agri/spice producers — best served by the cooperative (Sansthan) model.
    return { hasGITag: true, isCooperative: true, hasBankAccount: true, hasGST: true };
  }
  return { hasGITag: true, hasBankAccount: true };
}

/**
 * Build one authentic candidate lead from a GI registry entry. The customer
 * SEGMENT is whatever the scorer's bestTier says, keeping routing honest.
 */
function _candidateFromGI(giEntry) {
  const category = (giEntry.category || '').toLowerCase();
  const region = giEntry.region || (giEntry.states && giEntry.states[0]) || 'India';
  const signals = _signalsFor(giEntry);
  const scored = sourcing.scoreLead(signals);             // { scores, bestTier, bestScore }
  const tier = scored.bestTier || 'vyapari';
  const routing = TIER_TO_SEGMENT[tier] || TIER_TO_SEGMENT.vyapari;
  // Prefer the category's natural channel if present, else the tier's channel.
  const source = CATEGORY_SOURCE[category] || routing.source || DEFAULT_SOURCE;
  const segment = routing.segment;

  const clusterName = `${giEntry.gi} cluster — ${region}`;

  return {
    candidate_id: `auto_${(giEntry.gi || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${segment}`,
    source,
    segment,
    name: clusterName,
    score: scored.bestScore,
    tier,
    gi_craft: giEntry.gi,
    region,
    states: giEntry.states || [],
    craft: giEntry.craft || category,
    category,
    signals,
    provenance: {
      gi_registry: { gi: giEntry.gi, year: giEntry.year || null, authentic: true },
      source_channel: {
        id: source,
        label: sourcing.LEAD_SOURCES[source] ? sourcing.LEAD_SOURCES[source].label : source,
        url: sourcing.LEAD_SOURCES[source] ? sourcing.LEAD_SOURCES[source].url : null,
      },
      synthesized_fields: ['name'],
      verify_before_outreach: true,
    },
    notes: `Auto-sourced from ${sourcing.LEAD_SOURCES[source] ? sourcing.LEAD_SOURCES[source].label : source}, grounded in the "${giEntry.gi}" GI tag (${region}). Verify the specific producer before outreach.`,
  };
}

/**
 * Build candidates from a supply cluster — one per establishment type present
 * (a hub has artisans AND factories AND shops…). Non-GI by default; this is
 * the supply the GI registry misses. Signals are derived from the
 * establishment type so the scorer routes each to the right tier.
 */
function _signalsForType(type, cluster) {
  switch (type) {
    case supplyClusters.ESTABLISHMENT_TYPES.ARTISAN:
      return { registeredArtisan: true, hasNoGST: true, hasNoIEC: true, hasBankAccount: true, hasGITag: !!cluster.gi_tagged };
    case supplyClusters.ESTABLISHMENT_TYPES.COOPERATIVE:
      return { isCooperative: true, hasGST: true, hasBankAccount: true, hasGITag: !!cluster.gi_tagged };
    case supplyClusters.ESTABLISHMENT_TYPES.SHOP:
    case supplyClusters.ESTABLISHMENT_TYPES.SHOWROOM:
      return { hasGST: true, hasBankAccount: true, hasWebsite: false };
    case supplyClusters.ESTABLISHMENT_TYPES.FACTORY:
      return { hasGST: true, hasBankAccount: true, hasWebsite: true };
    case supplyClusters.ESTABLISHMENT_TYPES.EXPORTER:
      return { hasGST: true, hasIEC: true, isExporter: true, exportingAlready: true, hasWebsite: true, hasBankAccount: true };
    case supplyClusters.ESTABLISHMENT_TYPES.ONLINE_SELLER:
      return { hasGST: true, hasWebsite: true, hasBankAccount: true };
    case supplyClusters.ESTABLISHMENT_TYPES.TOUR_OPERATOR:
      return { hasBankAccount: true, hasWebsite: true };
    case supplyClusters.ESTABLISHMENT_TYPES.HOTEL:
    case supplyClusters.ESTABLISHMENT_TYPES.HOMESTAY:
    case supplyClusters.ESTABLISHMENT_TYPES.EVENT_MANAGER:
    case supplyClusters.ESTABLISHMENT_TYPES.TRANSPORT:
    case supplyClusters.ESTABLISHMENT_TYPES.GUIDE:
      return { hasBankAccount: true, hasWebsite: true, hasGST: true };
    default:
      return { hasBankAccount: true };
  }
}

function _candidatesFromCluster(cluster) {
  const out = [];
  for (const type of cluster.types) {
    const segment = supplyClusters.TYPE_TO_SEGMENT[type] || sourcing.SEGMENTS.VYAPARI;
    const source = supplyClusters.TYPE_TO_SOURCE[type] || DEFAULT_SOURCE;
    const signals = _signalsForType(type, cluster);
    const scored = sourcing.scoreLead(signals);
    out.push({
      candidate_id: `cluster_${cluster.id}_${type}`,
      source,
      segment,
      establishment_type: type,
      name: `${cluster.name} — ${type.replace('_', ' ')}`,
      score: scored.bestScore,
      tier: scored.bestTier,
      gi_craft: cluster.gi_tagged ? cluster.name : null,
      gi_tagged: !!cluster.gi_tagged,
      region: cluster.region,
      states: [cluster.state],
      craft: cluster.product,
      category: cluster.category,
      cluster_scale: cluster.scale,
      signals,
      provenance: {
        cluster: { id: cluster.id, name: cluster.name, authentic: true, gi_tagged: !!cluster.gi_tagged },
        source_channel: {
          id: source,
          label: sourcing.LEAD_SOURCES[source] ? sourcing.LEAD_SOURCES[source].label : source,
          url: sourcing.LEAD_SOURCES[source] ? sourcing.LEAD_SOURCES[source].url : null,
        },
        synthesized_fields: ['name'],
        verify_before_outreach: true,
      },
      notes: `Auto-sourced from the ${cluster.name} cluster (${cluster.region}, ${cluster.state}) — ${type.replace('_', ' ')}. ${cluster.gi_tagged ? 'GI-tagged. ' : 'Non-GI cluster. '}Verify the specific establishment before outreach.`,
    });
  }
  return out;
}

/**
 * autoSource — produce a clean, ranked, deduped set of authentic candidate
 * leads from BOTH the GI registry AND the broader supply-cluster universe
 * (non-GI craft + industrial clusters, with establishment types: artisan,
 * cooperative, shop, showroom, factory, exporter, online seller, tour operator).
 *
 * @param {object} [opts]
 * @param {string}  [opts.segment]            — filter to one customer segment
 * @param {string}  [opts.state]              — filter to a state
 * @param {string}  [opts.category]           — filter to a category
 * @param {string}  [opts.establishmentType]  — filter to one establishment type
 * @param {boolean} [opts.giTagged]           — true/false to filter GI vs non-GI
 * @param {boolean} [opts.includeClusters=true]
 * @param {boolean} [opts.includeGI=true]
 * @param {number}  [opts.limit=20]
 * @param {number}  [opts.minScore]
 * @returns {object} { candidates, total_available, sources_used, by_type, generated_at }
 */
function autoSource(opts = {}) {
  const registry = Array.isArray(giRegistry.REGISTRY)
    ? giRegistry.REGISTRY
    : Object.values(giRegistry.REGISTRY || {});

  const wantState = opts.state ? String(opts.state).toLowerCase() : null;
  const wantCategory = opts.category ? String(opts.category).toLowerCase() : null;
  const wantSegment = opts.segment || null;
  const wantType = opts.establishmentType || null;
  const wantGi = (opts.giTagged === true || opts.giTagged === false) ? opts.giTagged : null;
  const includeClusters = opts.includeClusters !== false;
  const includeGI = opts.includeGI !== false;
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0;
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 20;

  const seen = new Set();
  const candidates = [];

  const consider = (cand) => {
    if (wantSegment && cand.segment !== wantSegment) return;
    if (wantType && cand.establishment_type !== wantType) return;
    if (wantGi !== null && !!cand.gi_tagged !== wantGi) return;
    if (wantState) {
      const states = (cand.states || []).map((s) => String(s).toLowerCase());
      if (!states.includes(wantState)) return;
    }
    if (wantCategory && (cand.category || '').toLowerCase() !== wantCategory) return;
    if (cand.score < minScore) return;
    if (seen.has(cand.candidate_id)) return;
    seen.add(cand.candidate_id);
    candidates.push(cand);
  };

  // GI-registry candidates (GI-tagged by definition)
  if (includeGI) {
    for (const giEntry of registry) {
      if (!giEntry || !giEntry.gi) continue;
      const cand = _candidateFromGI(giEntry);
      cand.gi_tagged = true;
      cand.establishment_type = cand.establishment_type || supplyClusters.ESTABLISHMENT_TYPES.ARTISAN;
      consider(cand);
    }
  }

  // Supply-cluster candidates (mostly NON-GI; multiple establishment types)
  if (includeClusters) {
    for (const cluster of supplyClusters.SUPPLY_CLUSTERS) {
      for (const cand of _candidatesFromCluster(cluster)) consider(cand);
    }
  }

  // Rank by score (desc), then name for stable order (gi_craft may be null)
  candidates.sort((a, b) => (b.score - a.score) || String(a.name).localeCompare(String(b.name)));

  const capped = candidates.slice(0, limit);
  const sourcesUsed = [...new Set(capped.map((c) => c.source))];
  const byType = {};
  for (const c of capped) byType[c.establishment_type] = (byType[c.establishment_type] || 0) + 1;

  return {
    candidates: capped,
    total_available: candidates.length,
    returned: capped.length,
    sources_used: sourcesUsed,
    by_type: byType,
    authentic: true,
    generated_at: (opts.now || Date.now)(),
  };
}

/**
 * promoteCandidate — convert an auto-sourced candidate into a real lead in the
 * sourcing pipeline (so auto + manual converge). The founder/co-founder calls
 * this after eyeballing the candidate. Returns the created lead.
 */
function promoteCandidate(candidate, opts = {}) {
  if (!candidate || !candidate.source || !candidate.segment) {
    throw new Error('candidate with source + segment required');
  }
  return sourcing.createLead({
    source: candidate.source,
    segment: candidate.segment,
    name: candidate.name,
    contactHandles: candidate.contactHandles || {},
    signals: candidate.signals || {},
    notes: candidate.notes || '',
  });
}

/**
 * productTemplates — authentic product listings derived from the GI registry,
 * for seeding the marketplace with REAL crafts (not fabricated demo data).
 * Each template is a genuine GI craft with its real region + category. Price
 * is a representative band for that craft category (clearly a starting point
 * the seller edits), and every template carries `gi_verified: true` provenance.
 *
 * These are templates, NOT live listings — the founder publishes them against
 * a real seller, or a real seller adopts one. Nothing here pretends a product
 * physically exists; it's a starting catalog grounded in real craft identity.
 */
const CATEGORY_PRICE_BAND_PAISE = Object.freeze({
  textile: { min: 180000, typical: 450000 },   // sarees/shawls: ₹1,800–₹4,500+
  craft:   { min: 80000,  typical: 250000 },   // handicrafts: ₹800–₹2,500
  food:    { min: 25000,  typical: 60000 },    // food GI: ₹250–₹600
  spice:   { min: 30000,  typical: 90000 },    // spices: ₹300–₹900
});

function productTemplates(opts = {}) {
  const registry = Array.isArray(giRegistry.REGISTRY)
    ? giRegistry.REGISTRY
    : Object.values(giRegistry.REGISTRY || {});
  const wantCategory = opts.category ? String(opts.category).toLowerCase() : null;
  const wantState = opts.state ? String(opts.state).toLowerCase() : null;
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 24;

  const templates = [];
  for (const gi of registry) {
    if (!gi || !gi.gi) continue;
    const category = (gi.category || '').toLowerCase();
    if (wantCategory && category !== wantCategory) continue;
    if (wantState) {
      const states = (gi.states || []).map((s) => String(s).toLowerCase());
      if (!states.includes(wantState)) continue;
    }
    const band = CATEGORY_PRICE_BAND_PAISE[category] || { min: 50000, typical: 150000 };
    const region = gi.region || (gi.states && gi.states[0]) || 'India';
    templates.push({
      template_id: `tpl_${(gi.gi || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      title: gi.gi,
      craft: gi.craft || category,
      category,
      region,
      states: gi.states || [],
      vertical: category === 'textile' || category === 'craft' ? 'handicraft' : 'naturals',
      suggested_price_paise: band.typical,
      min_price_paise: band.min,
      gi_tag: gi.gi,
      gi_verified: true,
      year_registered: gi.year || null,
      description: `Authentic ${gi.gi} from ${region}${gi.craft ? ' — ' + gi.craft : ''}. GI-tagged${gi.year ? ' since ' + gi.year : ''}.`,
      is_template: true,
    });
  }

  // Non-GI cluster products — the broader marketplace supply (brassware,
  // glass, furniture, footwear, knitwear…). Clearly NOT GI-verified, but real
  // documented clusters. Skipped when the caller asks for GI-only.
  if (opts.giTagged !== true) {
    for (const cluster of supplyClusters.SUPPLY_CLUSTERS) {
      if (cluster.gi_tagged) continue;  // GI ones already covered above
      const category = (cluster.category || '').toLowerCase();
      if (wantCategory && category !== wantCategory) continue;
      if (wantState && cluster.state !== wantState) continue;
      const band = CATEGORY_PRICE_BAND_PAISE[category] || { min: 50000, typical: 150000 };
      templates.push({
        template_id: `tpl_cluster_${cluster.id}`,
        title: cluster.product,
        craft: cluster.product,
        category,
        region: cluster.region,
        states: [cluster.state],
        vertical: category === 'tourism' ? 'tourism' : (['gems', 'jewellery'].includes(category) ? 'gems' : 'handicraft'),
        suggested_price_paise: band.typical,
        min_price_paise: band.min,
        gi_tag: null,
        gi_verified: false,
        cluster: cluster.name,
        year_registered: null,
        description: `${cluster.product} from the ${cluster.name} cluster (${cluster.region}, ${cluster.state}). Verified cluster origin.`,
        is_template: true,
      });
    }
  }

  templates.sort((a, b) => a.title.localeCompare(b.title));
  return {
    templates: templates.slice(0, limit),
    total_available: templates.length,
    gi_count: templates.filter((t) => t.gi_verified).length,
    non_gi_count: templates.filter((t) => !t.gi_verified).length,
  };
}

module.exports = {
  CATEGORY_SOURCE,
  TIER_TO_SEGMENT,
  DEFAULT_SOURCE,
  CATEGORY_PRICE_BAND_PAISE,
  autoSource,
  promoteCandidate,
  productTemplates,
};
