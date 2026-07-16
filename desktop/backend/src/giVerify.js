/**
 * NEXUS — GI Verification.
 *
 * Verifies a product's claimed Geographical Indication against the registry,
 * with cross-checks for region match and craft technique. The output is
 * structured: a status, a 0–100 score, and the reasoning chain — so a
 * buyer trust badge can show *why* a product is verified, and so a
 * suspicious listing can be reviewed with clear grounds.
 *
 * Verification is rule-based, not ML. The signals it uses are:
 *   1. NAME match against the registry (canonical name or alias)
 *   2. REGION cross-check — does the seller's region match the GI's
 *      registered region?
 *   3. CRAFT cross-check — does the declared technique match the GI's
 *      traditional craft?
 *   4. CATEGORY consistency — does the product vertical match the GI's
 *      category (textile / craft / food / spice)?
 *
 * Each signal adds or removes score. Status thresholds are calibrated
 * so that "verified" requires more than a name match alone.
 */

'use strict';

const { findRegistered, norm } = require('./giRegistry');

/**
 * Verify a product's GI claim.
 *
 * @param {object} product
 *   .title              {string}  — product name (e.g. "Banarasi Saree — red")
 *   .vertical           {string}  — engine vertical key
 *   .sellerRegion       {string=} — seller's region/state (free text)
 *   .attributes         {object=} — vertical-specific attrs; .craft_technique etc.
 *   .claimedGI          {string=} — explicit GI claim, if separate from title
 *
 * @returns {{
 *   status: 'verified'|'unverified'|'suspicious'|'untagged',
 *   score: number,
 *   gi: object|null,
 *   reasons: Array<{ ok: boolean, text: string }>,
 * }}
 */
function verifyGI(product) {
  const reasons = [];
  if (!product) return { status: 'untagged', score: 0, gi: null, reasons: [{ ok: false, text: 'No product to verify' }] };

  // 1) Name match — try claimedGI first, then product title
  const hay = [product.claimedGI, product.title].filter(Boolean).join(' ');
  const gi = findRegistered(hay);
  if (!gi) {
    return { status: 'untagged', score: 0, gi: null,
      reasons: [{ ok: false, text: 'No registered GI tag claimed or matched' }] };
  }
  let score = 60;
  reasons.push({ ok: true, text: `Matched registered GI "${gi.gi}" (registered ${gi.year})` });

  // 2) Region cross-check
  const sellerRegion = norm(product.sellerRegion || '');
  if (sellerRegion) {
    const regionMatch = gi.states.some(st => sellerRegion.includes(norm(st))) ||
                        sellerRegion.includes(norm(gi.region));
    if (regionMatch) {
      score += 25;
      reasons.push({ ok: true, text: `Seller region matches registered region (${gi.region})` });
    } else {
      score -= 35;
      reasons.push({ ok: false, text: `Seller region "${product.sellerRegion}" does NOT match registered region "${gi.region}" — counterfeit risk` });
    }
  } else {
    reasons.push({ ok: false, text: 'Seller region not declared — cannot cross-check' });
  }

  // 3) Craft cross-check (if attrs available)
  const craftStr = norm(
    (product.attributes && (product.attributes.craft_technique || product.attributes.craft || product.attributes.technique || product.attributes.materials)) || ''
  );
  if (craftStr) {
    const giCraftWords = norm(gi.craft).split(' ').filter(w => w.length >= 4);
    const overlap = giCraftWords.filter(w => craftStr.includes(w));
    if (overlap.length) {
      score += 12;
      reasons.push({ ok: true, text: `Craft technique aligns with the GI tradition (${gi.craft})` });
    } else {
      score -= 8;
      reasons.push({ ok: false, text: `Declared craft does not align with "${gi.craft}"` });
    }
  }

  // 4) Category consistency
  if (product.vertical) {
    const v = norm(product.vertical);
    const cat = gi.category;
    const ok = (cat === 'textile' && /handicraft|textile|garment|saree|gi/.test(v)) ||
               (cat === 'craft'   && /handicraft|craft|decor|pottery|metal|gi/.test(v)) ||
               (cat === 'food'    && /food|natural|gi/.test(v)) ||
               (cat === 'spice'   && /natural|spice|food|gi/.test(v));
    if (ok) {
      score += 3;
    } else {
      score -= 5;
      reasons.push({ ok: false, text: `Product category "${product.vertical}" inconsistent with GI category "${gi.category}"` });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const status = score >= 80 ? 'verified' :
                 score >= 50 ? 'unverified' :
                              'suspicious';
  return { status, score, gi, reasons };
}

/** Aggregate verification across a product catalog. */
function portfolioReport(products) {
  const counts = { verified: 0, unverified: 0, suspicious: 0, untagged: 0 };
  const byGi = {};
  const flags = [];
  for (const p of products) {
    const v = verifyGI(p);
    counts[v.status]++;
    if (v.gi) byGi[v.gi.gi] = (byGi[v.gi.gi] || 0) + 1;
    if (v.status === 'suspicious') flags.push({ product: p, verification: v });
  }
  const topGi = Object.entries(byGi).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([gi, n]) => ({ gi, count: n }));
  return { total: products.length, counts, topGi, flags };
}

module.exports = { verifyGI, portfolioReport };
