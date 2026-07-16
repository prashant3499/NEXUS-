'use strict';

/**
 * schemeAlignment.js
 *
 * The platform's posture toward government schemes is deliberate: it should be
 * COMPATIBLE WITH ALL beneficial schemes, surface them to whoever they help,
 * and — importantly — ALIGN ITSELF to serve new ones as they emerge, without a
 * rewrite. A scheme that puts money, recognition, or reach in an artisan's
 * hands is good for the artisan AND for the platform (more capable, credible,
 * lower-cost-to-acquire sellers). So this engine treats schemes as a first-
 * class, extensible part of the business — not an afterthought.
 *
 * It does three things:
 *   1. AGGREGATE every scheme source behind one interface (the built-in
 *      welfare/credit schemes, the ONDC/digital-commerce schemes, and any
 *      source registered in future — `registerSource`).
 *   2. MATCH a seller to every scheme they qualify for, ranked by benefit.
 *   3. Note the MUTUAL BENEFIT — what each scheme does for the seller and what
 *      it does for the platform — so alignment is an explicit, auditable choice.
 *
 * Forward-looking by design: new schemes (a future state subsidy, a new central
 * programme) drop in as a source function; nothing else changes.
 *
 * Pure + dependency-free. The server injects the concrete scheme modules so
 * this layer stays decoupled and testable.
 */

// How a scheme benefits the PLATFORM (not just the seller) — used to explain
// why aligning with it serves the business too. Inferred from scheme category.
const PLATFORM_BENEFIT = Object.freeze({
  ip_protection: 'Verified provenance raises buyer trust + price — strengthens the authenticity moat.',
  credit: 'Better-capitalised sellers list more and fulfil reliably — higher GMV per seller.',
  training: 'Skilled sellers produce better listings + fewer grievances — lower support cost.',
  recognition: 'Government recognition lowers acquisition cost and adds credibility to onboarding.',
  digital_commerce: 'Open-network reach (ONDC) means demand the platform doesn\u2019t have to buy — lower CAC.',
  registration: 'Formalised sellers unlock more modalities (B2B, EXIM) — larger basket + margin.',
  default: 'A more capable, credible seller base — compounding network value.',
});

function _platformBenefit(category) {
  return PLATFORM_BENEFIT[category] || PLATFORM_BENEFIT.default;
}

/**
 * A scheme source is a function: (seller) -> [{ id, name, body, category,
 * benefit, eligible, ... }]. The engine normalises whatever each source
 * returns into one shape.
 */
function _normalize(raw, sourceName) {
  // schemes.js findEligibleSchemes returns [{ scheme, ... }]; ondc returns the
  // scheme object directly. Handle both + a generic object.
  const s = raw.scheme || raw;
  return {
    id: s.id,
    name: s.name,
    body: s.ministry || s.body || 'Government of India',
    category: s.category || 'digital_commerce',
    seller_benefit: s.benefit || s.summary || '',
    platform_benefit: _platformBenefit(s.category || 'digital_commerce'),
    amount_paise: s.typical_amount_paise || null,
    url: s.application_url || s.url || '',
    source: sourceName,
    eligible: raw.eligible !== false, // sources that pre-filter imply eligible
  };
}

/**
 * createEngine — build an alignment engine over the given scheme sources. Each
 * source is { name, match(seller) -> rawSchemes[] }. More can be added later
 * with `registerSource`.
 */
function createEngine(sources = []) {
  const _sources = sources.slice();

  return {
    /** Extensibility hook — align with a new scheme programme in future. */
    registerSource(source) {
      if (source && typeof source.match === 'function') _sources.push(source);
      return this;
    },

    sourceCount() { return _sources.length; },

    /** Every scheme a seller qualifies for, across all sources, ranked. */
    matchSeller(seller = {}) {
      const out = [];
      for (const src of _sources) {
        let raws = [];
        try { raws = src.match(seller) || []; } catch (e) { raws = []; }
        for (const r of raws) out.push(_normalize(r, src.name));
      }
      // Rank: eligible first, then by whether there's a cash amount, then name.
      out.sort((a, b) => (b.eligible - a.eligible) || ((b.amount_paise || 0) - (a.amount_paise || 0)) || a.name.localeCompare(b.name));
      return out;
    },

    /**
     * alignmentReport — the platform-level view: total schemes reachable, the
     * mix by category, and a plain statement of the alignment posture. Used by
     * the founder + the self-explaining page.
     */
    alignmentReport(seller = {}) {
      const matched = this.matchSeller(seller);
      const byCategory = {};
      for (const m of matched) byCategory[m.category] = (byCategory[m.category] || 0) + 1;
      const cashSchemes = matched.filter((m) => m.amount_paise);
      const totalCashPaise = cashSchemes.reduce((a, m) => a + (m.amount_paise || 0), 0);
      return {
        sources: _sources.length,
        matched_count: matched.length,
        by_category: byCategory,
        potential_cash_benefit_paise: totalCashPaise,
        posture: 'The platform aligns with every scheme that benefits sellers — and is built to absorb new schemes as a source without a rewrite. What helps the artisan compounds for the platform.',
        schemes: matched,
      };
    },
  };
}

module.exports = { PLATFORM_BENEFIT, createEngine };
