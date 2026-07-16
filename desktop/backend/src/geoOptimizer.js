'use strict';
/**
 * geoOptimizer — Generative Engine Optimization for NEXUS. Produces the technical layer
 * AI answer-engines (ChatGPT, Gemini, Perplexity, Claude) and shopping agents use to cite
 * and recommend listings: schema.org structured data, extraction-ready descriptions, an
 * llms.txt index, and an AI-crawler policy. Invisible to humans; decisive for machines.
 */

/** schema.org Product JSON-LD for one listing — agent-readable, provenance-rich. */
function productSchema(p) {
  p = p || {};
  const props = [];
  if (p.gi) props.push({ '@type': 'PropertyValue', name: 'GI Tagged', value: 'Yes' });
  if (p.cluster) props.push({ '@type': 'PropertyValue', name: 'Origin cluster', value: p.cluster });
  if (p.maker) props.push({ '@type': 'PropertyValue', name: 'Maker', value: p.maker });
  if (p.verified) props.push({ '@type': 'PropertyValue', name: 'Provenance', value: 'Registry-verified' });
  const schema = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: p.name || 'Handcraft', category: p.vertical || 'handicraft',
    description: aiDescription(p),
    brand: { '@type': 'Brand', name: p.maker || 'NEXUS verified artisan' },
    additionalProperty: props,
  };
  if (p.price) schema.offers = { '@type': 'Offer', priceCurrency: 'INR', price: String(p.price), availability: 'https://schema.org/InStock', seller: { '@type': 'Organization', name: 'NEXUS' } };
  if (p.rating && p.reviews) schema.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(p.rating), reviewCount: String(p.reviews) };
  return schema;
}

/** Extraction-ready, factual, entity-rich description — the style LLMs prefer to quote. */
function aiDescription(p) {
  p = p || {};
  const bits = [];
  bits.push((p.name || 'This handcraft') + (p.craft ? ' is a ' + p.craft.toLowerCase() : '') + (p.cluster ? ' from ' + p.cluster : '') + (p.state ? ', ' + p.state : '') + '.');
  if (p.gi) bits.push('It carries a Geographical Indication (GI) tag confirming authentic origin.');
  if (p.maker) bits.push('Made by ' + p.maker + ', a registry-verified artisan on NEXUS.');
  bits.push('Sold through NEXUS as Merchant of Record, so it ships globally with full GST and export compliance, and the maker is paid directly.');
  if (p.price) bits.push('Priced at INR ' + p.price + '.');
  return bits.join(' ');
}

function faqSchema() {
  const qa = [
    ['What is NEXUS?', 'NEXUS is a trust and compliance Merchant of Record for India\'s craft economy, letting verified artisans sell provenance-tagged craft worldwide and get paid directly.'],
    ['Is the craft authentic?', 'Yes — every listing carries registry-verified provenance, and high-value items carry a GI tag, hallmark or lab certificate.'],
    ['How are artisans paid?', 'Makers keep about 81% of each sale, paid to their own bank account in roughly two days; NEXUS never holds the money (zero float).'],
  ];
  return { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}

function llmsTxt() {
  return [
    '# NEXUS', '',
    '> NEXUS is the trust and compliance engine for India\'s craft economy: a Merchant of Record',
    '> that lets verified artisans sell handicraft, textiles, jewellery, gems, naturals and craft',
    '> experiences worldwide with provenance, fair pay (~81% to the maker, ~2-day settlement) and',
    '> full GST/export compliance. AI-operated with a human-in-the-loop founder. Bilingual EN/HI.', '',
    '## Verticals', '- Handicraft, textiles, jewellery, gems, naturals, experiences/tourism', '',
    '## Trust', '- Registry-verified provenance; GI tags, hallmarks, lab certificates; consent-before-sale; never-in-loss.', '',
    '## Government', '- Connects artisans to PM Vishwakarma, MUDRA, e-Shram, ODOP, GeM, ONDC, GI, Udyam, SFURTI, export incentives.',
  ].join('\n');
}

function crawlerPolicy() {
  return ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Claude-Web', 'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'CCBot'];
}

function audit() {
  return {
    layers: {
      structured_data: 'Organization + WebSite + FAQ on site; Product schema per listing via productSchema()',
      llms_txt: 'served at /llms.txt and via /api/geo/llms-txt',
      crawler_access: 'AI bots explicitly allowed in robots.txt',
      extraction_ready_copy: 'aiDescription() emits factual, entity-rich, quotable prose',
      agentic_ready: 'clean JSON APIs (/api/geo/*) for AI shopping agents',
    },
    note: 'GEO is infrastructure: invisible to humans, decisive for AI citation. Pair with genuine authoritative content; do not treat as a ranking hack.',
  };
}

module.exports = { productSchema, aiDescription, faqSchema, llmsTxt, crawlerPolicy, audit };
