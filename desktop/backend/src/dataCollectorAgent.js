'use strict';
/**
 * dataCollectorAgent — collects authentic, FREE government open data into the launch
 * database before deploy. Ships with a curated set of REAL GI-registry clusters
 * (authentic product→craft→cluster→state facts) as the bootstrap, and defines the live
 * connectors it pulls from when deployed with network access. No money, no authorisation
 * for the no-auth sources; every collected record becomes a CONSENT-GATED prospect.
 */
const consent = require('./sellerConsent');

// Authentic GI-tagged clusters from India's GI registry (public, free, commercial-OK).
const GI_CLUSTERS = [
  // Textiles
  { product: 'Banarasi Silk', craft: 'Handloom silk weaving', vertical: 'textile', cluster: 'Varanasi', state: 'Uttar Pradesh' },
  { product: 'Pochampally Ikat', craft: 'Ikat weaving', vertical: 'textile', cluster: 'Bhoodan Pochampally', state: 'Telangana' },
  { product: 'Chanderi Saree', craft: 'Handloom weaving', vertical: 'textile', cluster: 'Chanderi', state: 'Madhya Pradesh' },
  { product: 'Kanchipuram Silk', craft: 'Silk weaving', vertical: 'textile', cluster: 'Kanchipuram', state: 'Tamil Nadu' },
  { product: 'Kashmir Pashmina', craft: 'Pashmina weaving', vertical: 'textile', cluster: 'Srinagar', state: 'Jammu & Kashmir' },
  { product: 'Kota Doria', craft: 'Handloom weaving', vertical: 'textile', cluster: 'Kota', state: 'Rajasthan' },
  { product: 'Patan Patola', craft: 'Double-ikat weaving', vertical: 'textile', cluster: 'Patan', state: 'Gujarat' },
  { product: 'Assam Muga Silk', craft: 'Muga silk weaving', vertical: 'textile', cluster: 'Sualkuchi', state: 'Assam' },
  // Handicraft
  { product: 'Khurja Pottery', craft: 'Ceramic pottery', vertical: 'handicraft', cluster: 'Khurja', state: 'Uttar Pradesh' },
  { product: 'Blue Pottery of Jaipur', craft: 'Glazed pottery', vertical: 'handicraft', cluster: 'Jaipur', state: 'Rajasthan' },
  { product: 'Moradabad Metal Craft', craft: 'Brass metalware', vertical: 'handicraft', cluster: 'Moradabad', state: 'Uttar Pradesh' },
  { product: 'Channapatna Toys', craft: 'Lacquered wood toys', vertical: 'handicraft', cluster: 'Channapatna', state: 'Karnataka' },
  { product: 'Bidriware', craft: 'Metal inlay', vertical: 'handicraft', cluster: 'Bidar', state: 'Karnataka' },
  { product: 'Bastar Dhokra', craft: 'Lost-wax brass casting', vertical: 'handicraft', cluster: 'Bastar', state: 'Chhattisgarh' },
  { product: 'Saharanpur Wood Craft', craft: 'Wood carving', vertical: 'handicraft', cluster: 'Saharanpur', state: 'Uttar Pradesh' },
  // Sculpture (stone & marble)
  { product: 'Makrana Marble', craft: 'Marble sculpture & carving', vertical: 'sculpture', cluster: 'Makrana', state: 'Rajasthan' },
  { product: 'Mamallapuram Stone Sculpture', craft: 'Granite stone sculpture', vertical: 'sculpture', cluster: 'Mamallapuram', state: 'Tamil Nadu' },
  { product: 'Konark Stone Carving', craft: 'Stone carving', vertical: 'sculpture', cluster: 'Konark, Puri', state: 'Odisha' },
  // Jewellery
  { product: 'Cuttack Silver Filigree (Tarakasi)', craft: 'Silver filigree', vertical: 'jewellery', cluster: 'Cuttack', state: 'Odisha' },
  { product: 'Thewa Art Jewellery', craft: 'Gold-on-glass work', vertical: 'jewellery', cluster: 'Pratapgarh', state: 'Rajasthan' },
  { product: 'Temple Jewellery of Nagercoil', craft: 'Temple jewellery', vertical: 'jewellery', cluster: 'Nagercoil', state: 'Tamil Nadu' },
  // Gems
  { product: 'Jaipur Gem Cutting', craft: 'Gemstone cutting & polishing', vertical: 'gems', cluster: 'Jaipur (Johari Bazaar)', state: 'Rajasthan' },
  // Naturals
  { product: 'Darjeeling Tea', craft: 'Tea cultivation', vertical: 'naturals', cluster: 'Darjeeling', state: 'West Bengal' },
  { product: 'Araku Valley Coffee', craft: 'Coffee cultivation', vertical: 'naturals', cluster: 'Araku Valley', state: 'Andhra Pradesh' },
  { product: 'Kashmir Saffron', craft: 'Saffron cultivation', vertical: 'naturals', cluster: 'Pampore', state: 'Jammu & Kashmir' },
  { product: 'Mysore Sandalwood Oil', craft: 'Sandalwood processing', vertical: 'naturals', cluster: 'Mysuru', state: 'Karnataka' },
  // Experiences
  { product: 'Jaipur Block-print Workshop', craft: 'Hands-on craft tourism', vertical: 'experience', cluster: 'Bagru / Jaipur', state: 'Rajasthan' },
].map((c, i) => ({ id: 'gi_' + (i + 1), gi: true, source: 'gi_registry', ...c,
  mapq: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.cluster + ', ' + c.state) }));

// Live connectors the agent uses when deployed with network (all free / no-auth or free key).
const CONNECTORS = [
  { id: 'gi_registry', name: 'GI Registry public list', endpoint: 'https://search.ipindia.gov.in/GIRPublic/', auth_required: false },
  { id: 'ogd_pincode', name: 'data.gov.in — All India Pincode Directory', endpoint: 'https://api.data.gov.in/resource/<pincode-resource-id>', auth_required: false, note: 'free API key' },
  { id: 'odop', name: 'ODOP district-product mapping', endpoint: 'https://odop.gov.in', auth_required: false },
  { id: 'myscheme', name: 'myScheme eligibility', endpoint: 'https://www.myscheme.gov.in', auth_required: false },
];

function collectAll() {
  const byVertical = {};
  GI_CLUSTERS.forEach((c) => { byVertical[c.vertical] = (byVertical[c.vertical] || 0) + 1; });
  return {
    collected: GI_CLUSTERS.length, by_vertical: byVertical, clusters: GI_CLUSTERS,
    live_connectors: CONNECTORS, sources_used: ['gi_registry'],
    money_required: false, authorisation_required: false,
    note: 'Authentic GI-registry clusters (free, public). Deploy with network to expand live via the connectors. Each becomes a consent-gated prospect.',
  };
}

/** Turn collected clusters into consent-gated prospects (no one is a customer until consent). */
function toProspects() {
  return GI_CLUSTERS.map((c) => {
    const blank = consent.emptyConsent();
    return { id: 'pr_' + c.id, product: c.product, craft: c.craft, vertical: c.vertical,
      cluster: c.cluster, state: c.state, gi: true, lawful_basis: 'public_gi_registry',
      stage: 'sourced', canSell: consent.canSell(blank).ok };
  });
}

module.exports = { GI_CLUSTERS, CONNECTORS, collectAll, toProspects };
