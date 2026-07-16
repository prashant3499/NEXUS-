'use strict';
/**
 * governmentSchemes — real Indian government schemes relevant to artisans, and an
 * eligibility matcher. NEXUS becomes "favored" by government by being a verified
 * delivery + formalisation channel: it identifies eligible artisans, formalises them
 * (e-Shram / Udyam), and reports outcomes. Terms change — always link to the official
 * portal rather than asserting exact amounts.
 */
const TYPE = { CREDIT: 'credit', SUBSIDY: 'subsidy', MARKET: 'market_access', TRAINING: 'training', SOCIAL: 'social_security', EXPORT: 'export', FORMALISE: 'formalisation' };

const SCHEMES = [
  { id: 'pm_vishwakarma', name: 'PM Vishwakarma', ministry: 'MSME', type: [TYPE.CREDIT, TYPE.TRAINING, TYPE.MARKET],
    benefit: 'Recognition, skill training with stipend, a toolkit grant, collateral-free micro-credit and digital/marketing support for traditional artisans and craftspeople.',
    fits: ['handicraft', 'textile', 'jewellery', 'naturals'], official: 'https://pmvishwakarma.gov.in' },
  { id: 'pm_mudra', name: 'PM MUDRA Yojana', ministry: 'Finance / SIDBI', type: [TYPE.CREDIT],
    benefit: 'Collateral-free micro-loans for non-corporate micro enterprises (Shishu/Kishore/Tarun tiers).',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'experience'], official: 'https://www.mudra.org.in' },
  { id: 'e_shram', name: 'e-Shram', ministry: 'Labour & Employment', type: [TYPE.SOCIAL, TYPE.FORMALISE],
    benefit: 'National registry of unorganised workers — a Universal Account Number and a gateway to social-security benefits.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'experience'], official: 'https://eshram.gov.in' },
  { id: 'odop', name: 'ODOP (One District One Product)', ministry: 'DPIIT / States', type: [TYPE.MARKET],
    benefit: 'District-level product promotion, branding and market linkage for signature local crafts.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals'], official: 'https://odop.gov.in' },
  { id: 'nhdp', name: 'National Handloom / Handicrafts schemes', ministry: 'Textiles', type: [TYPE.SUBSIDY, TYPE.MARKET, TYPE.TRAINING],
    benefit: 'Weaver and artisan support — yarn supply, marketing events, design, and credit support.',
    fits: ['textile', 'handicraft'], official: 'https://texmin.nic.in' },
  { id: 'gi', name: 'GI (Geographical Indication) protection', ministry: 'DPIIT / GI Registry', type: [TYPE.MARKET],
    benefit: 'Legal protection and premium positioning for origin-linked crafts; stops fakes and lifts price.',
    fits: ['handicraft', 'textile', 'jewellery', 'naturals'], official: 'https://ipindia.gov.in' },
  { id: 'gem', name: 'GeM (Government e-Marketplace)', ministry: 'Commerce', type: [TYPE.MARKET],
    benefit: 'Sell directly to government departments and PSUs — a large, steady institutional buyer.',
    fits: ['handicraft', 'textile', 'jewellery', 'naturals'], official: 'https://gem.gov.in' },
  { id: 'ondc', name: 'ONDC (Open Network for Digital Commerce)', ministry: 'DPIIT', type: [TYPE.MARKET],
    benefit: 'Open commerce network giving small sellers reach across buyer apps without platform lock-in.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'experience'], official: 'https://ondc.org' },
  { id: 'rodtep', name: 'RoDTEP & export incentives', ministry: 'Commerce / DGFT', type: [TYPE.EXPORT],
    benefit: 'Remission of embedded duties/taxes on exported products, improving export margins.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals'], official: 'https://www.dgft.gov.in' },
  { id: 'udyam', name: 'Udyam (MSME) registration', ministry: 'MSME', type: [TYPE.FORMALISE],
    benefit: 'Free MSME registration that unlocks priority-sector credit, subsidies and tender benefits.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'experience'], official: 'https://udyamregistration.gov.in' },
  { id: 'sfurti', name: 'SFURTI (cluster development)', ministry: 'MSME', type: [TYPE.SUBSIDY, TYPE.TRAINING],
    benefit: 'Funds shared facilities, design and marketing for clusters of traditional artisans.',
    fits: ['handicraft', 'textile', 'naturals'], official: 'https://sfurti.msme.gov.in' },
  { id: 'standup', name: 'Stand-Up India', ministry: 'Finance', type: [TYPE.CREDIT],
    benefit: 'Bank loans for SC/ST and women entrepreneurs to set up enterprises.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'experience'], official: 'https://www.standupmitra.in' },
  { id: 'raj_icds', name: 'Integrated Cluster Development Scheme (Rajasthan)', ministry: 'Industries & Commerce, Govt. of Rajasthan', type: [TYPE.SUBSIDY, TYPE.TRAINING, TYPE.MARKET],
    benefit: 'State scheme (Jan 2025, valid to Mar 2029) for handicraft/handloom/MSME clusters: soft interventions for artisan capacity building, raw-material banks, e-commerce market development, and Common Facility Centres with state grants up to Rs 8-10 crore. Apply via the district GM DICC; SPV of 10+ artisans with artisan ID cards.',
    fits: ['handicraft', 'textile', 'jewellery', 'gems', 'naturals', 'sculpture'], official: 'https://industries.rajasthan.gov.in' },
];

function catalog() { return SCHEMES.map((s) => ({ id: s.id, name: s.name, ministry: s.ministry, type: s.type, benefit: s.benefit, official: s.official })); }

function eligibleFor(maker) {
  maker = maker || {};
  const vertical = String(maker.vertical || maker.cat || '').toLowerCase();
  const isExporter = !!maker.exporter;
  const out = SCHEMES.filter((s) => {
    if (!vertical) return true;
    const fit = s.fits.indexOf(vertical) >= 0;
    if (s.type.indexOf(TYPE.EXPORT) >= 0 && !isExporter) return fit; // export schemes still listed but flagged
    return fit;
  }).map((s) => ({ id: s.id, name: s.name, benefit: s.benefit, type: s.type, official: s.official,
    export_only: s.type.indexOf(TYPE.EXPORT) >= 0 }));
  return { vertical: vertical || 'all', count: out.length, schemes: out };
}

function deliveryValue() {
  return {
    headline: 'NEXUS is a verified delivery and formalisation channel for government craft schemes.',
    points: [
      'Identifies and verifies eligible artisans (e-Shram / Udyam / GI), reducing the cost of formalisation.',
      'Routes scheme benefits to verified beneficiaries, cutting leakage.',
      'Provides an outcome dashboard: who was reached, formalised, earning.',
      'Carries GST/TCS compliance as Merchant of Record, so scheme output reaches global markets cleanly.',
    ],
  };
}

module.exports = { TYPE, SCHEMES, catalog, eligibleFor, deliveryValue };
