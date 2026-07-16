'use strict';

const { findRegistered, list } = require('./src/giRegistry');
const { verifyGI, portfolioReport } = require('./src/giVerify');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (name) => console.log('\n\u2501\u2501\u2501 ' + name + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('REGISTRY — sourced, structured data');
{
  const all = list();
  a(all.length >= 50, `Registry has ${all.length} entries (≥ 50 required)`);
  // categories
  const cats = new Set(all.map(e => e.category));
  a(cats.has('textile') && cats.has('craft') && cats.has('food') && cats.has('spice'),
    'Covers textile, craft, food and spice categories');
  // every entry has the required structure
  const wellFormed = all.every(e => e.gi && Array.isArray(e.aliases) && e.region && Array.isArray(e.states) && e.craft && e.year);
  a(wellFormed, 'Every entry is well-formed (gi, aliases, region, states, craft, year)');
  // states are normalized
  const sampleStates = new Set();
  all.forEach(e => e.states.forEach(s => sampleStates.add(s)));
  a(sampleStates.has('uttar pradesh') && sampleStates.has('karnataka') && sampleStates.has('tamil nadu'),
    'State names are normalized (lowercase, full names)');
}

// ────────────────────────────────────────────────────────────
sec('LOOKUP — canonical names, aliases, partial');
{
  a(findRegistered('Banarasi Saree')?.gi === 'Banarasi Saree', 'Finds canonical "Banarasi Saree"');
  a(findRegistered('kanjivaram')?.gi === 'Kanchipuram Silk',   'Resolves alias "kanjivaram" → "Kanchipuram Silk"');
  a(findRegistered('CASHMERE')?.gi === 'Pashmina Shawl',       'Case-insensitive alias lookup');
  a(findRegistered('Madhubani Painting')?.gi === 'Madhubani Painting', 'Folk-art GI found');
  a(findRegistered('Darjeeling')?.gi === 'Darjeeling Tea',     'Partial-name match: "Darjeeling" → tea');
  a(findRegistered('not a real gi')         === null,          'Unknown name returns null (no fabrication)');
  a(findRegistered('')                       === null,         'Empty input returns null');
  a(findRegistered(null)                     === null,         'Null input returns null');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — verified case (everything aligns)');
{
  const v = verifyGI({
    title: 'Authentic Banarasi Saree — red brocade',
    vertical: 'gi',
    sellerRegion: 'Varanasi, Uttar Pradesh',
    attributes: { craft_technique: 'silk brocade zari weaving', materials: 'silk' },
  });
  a(v.status === 'verified',         `Status is "verified" (got ${v.status})`);
  a(v.score >= 80,                   `Score ≥ 80 (got ${v.score})`);
  a(v.gi?.gi === 'Banarasi Saree',   'Returns the matched registry entry');
  a(v.reasons.length >= 3,           'Multiple reasons surfaced (auditable chain)');
  a(v.reasons.some(r => r.ok && /region matches/i.test(r.text)), 'Region match recorded in reasons');
  a(v.reasons.some(r => r.ok && /craft/i.test(r.text)),          'Craft alignment recorded in reasons');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — suspicious case (wrong-region claim)');
{
  // A Mumbai seller claiming Banarasi — should fail region cross-check
  const v = verifyGI({
    title: 'Banarasi Saree',
    vertical: 'gi',
    sellerRegion: 'Mumbai, Maharashtra',
    attributes: { craft_technique: 'silk weaving' },
  });
  a(v.status === 'suspicious' || v.status === 'unverified',
    `Wrong region → status "${v.status}" (suspicious or unverified, NOT verified)`);
  a(v.score < 60, `Score depressed by region mismatch (got ${v.score})`);
  a(v.reasons.some(r => !r.ok && /region/i.test(r.text) && /not match/i.test(r.text)),
    'Reason explicitly cites the region mismatch');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — untagged case (no GI claimed)');
{
  const v = verifyGI({
    title: 'Handmade ceramic mug',
    vertical: 'handicraft',
    sellerRegion: 'Pune',
    attributes: { craft_technique: 'wheel throwing' },
  });
  a(v.status === 'untagged', 'Generic product → "untagged"');
  a(v.score === 0,           'Score 0 when no GI matched');
  a(v.gi === null,           'No registry entry returned');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — alias resolves correctly');
{
  const v = verifyGI({
    title: 'Pure Kanjivaram silk wedding saree',
    vertical: 'gi',
    sellerRegion: 'Kanchipuram, Tamil Nadu',
    attributes: { craft_technique: 'silk zari weaving' },
  });
  a(v.gi?.gi === 'Kanchipuram Silk', 'Alias "Kanjivaram" resolves to Kanchipuram Silk');
  a(v.status === 'verified',         'Aliased match still reaches verified status when region aligns');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — no region declared');
{
  const v = verifyGI({
    title: 'Pashmina Shawl',
    vertical: 'gi',
    attributes: { craft_technique: 'pashmina weaving' },
  });
  a(v.status === 'unverified' || v.status === 'suspicious',
    `Match without region → "${v.status}" (cannot fully verify)`);
  a(v.reasons.some(r => !r.ok && /region not declared/i.test(r.text)),
    'Flags missing region in the reason chain');
}

// ────────────────────────────────────────────────────────────
sec('VERIFY — multi-state GI (Basmati)');
{
  const v = verifyGI({
    title: 'Premium Basmati rice',
    vertical: 'naturals',
    sellerRegion: 'Karnal, Haryana',
    attributes: { materials: 'aromatic long-grain rice' },
  });
  a(v.gi?.gi === 'Basmati',      'Finds Basmati');
  a(v.status === 'verified',     'Multi-state GI verifies when seller is in any registered state');
}
{
  const v2 = verifyGI({
    title: 'Premium Basmati rice',
    vertical: 'naturals',
    sellerRegion: 'Chennai, Tamil Nadu',  // not in the Basmati states
  });
  a(v2.status !== 'verified',     'Multi-state GI does NOT verify when seller is in a wrong state');
}

// ────────────────────────────────────────────────────────────
sec('PORTFOLIO — aggregate report over a catalog');
{
  const products = [
    { title: 'Banarasi Saree',  vertical: 'gi', sellerRegion: 'Varanasi, UP',     attributes: { craft_technique: 'silk brocade' } },
    { title: 'Kanjivaram saree', vertical: 'gi', sellerRegion: 'Kanchipuram, TN', attributes: { craft_technique: 'silk weaving' } },
    { title: 'Banarasi Saree',  vertical: 'gi', sellerRegion: 'Mumbai',           attributes: { craft_technique: 'silk' } }, // suspicious
    { title: 'Plain cotton mug', vertical: 'handicraft' }, // untagged
  ];
  const r = portfolioReport(products);
  a(r.total === 4, 'Total counted correctly');
  a(r.counts.verified >= 2, `Two verified entries (got ${r.counts.verified})`);
  a(r.counts.suspicious >= 1, 'Flags the Mumbai/Banarasi as suspicious');
  a(r.counts.untagged >= 1, 'Counts the untagged product');
  a(r.flags.length >= 1 && r.flags[0].verification.status === 'suspicious',
    'Returns the suspicious items for review');
  a(r.topGi[0]?.gi === 'Banarasi Saree' && r.topGi[0].count === 2,
    'Top-GI ranking aggregates by registered name');
}

// ────────────────────────────────────────────────────────────
sec('INTEGRATION — verification plugs into the engine product type');
{
  // Mirror the shape a real engine product carries
  const product = {
    id: 'prod_1',
    customer_id: 'cust_1',
    title: 'Authentic Pashmina Shawl from Kashmir valley',
    supplierPrice: 8500,
    sellPrice: 15800,
    vertical: 'gi',
    sellerRegion: 'Srinagar, Jammu and Kashmir',
    attributes: {
      craft_technique: 'pashmina handloom weaving',
      materials: 'pashmina wool',
      artisan_story: 'Hand-spun and woven in the Kashmir valley',
      is_handmade: true,
    },
  };
  const v = verifyGI(product);
  a(v.status === 'verified', 'Engine-shaped product verifies end-to-end');

  // Buyer-card data — what the UI will render
  const card = {
    title: product.title,
    price: product.sellPrice,
    trustBadge: v.status === 'verified' ? { label: 'GI Verified', score: v.score, gi: v.gi.gi } : null,
  };
  a(card.trustBadge !== null,                   'Trust badge would render on the buyer card');
  a(card.trustBadge.gi === 'Pashmina Shawl',    'Badge names the matched GI');
  a(card.trustBadge.score >= 80,                 'Badge carries the verification score');

  // The auditable reasons would render in a "why this is verified" tooltip
  const explanation = v.reasons.map(r => (r.ok ? '✓ ' : '✗ ') + r.text).join('\n');
  a(explanation.includes('Pashmina') && explanation.includes('region'),
    'Verification chain is human-readable for the buyer');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
