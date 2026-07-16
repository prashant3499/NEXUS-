'use strict';

/**
 * supplyClusters.js
 *
 * The real supply universe beyond GI tags. India's craft + manufacturing
 * economy is overwhelmingly NON-GI: brassware in Moradabad, glass in
 * Firozabad, furniture in Jodhpur, knitwear in Tirupur, leather in Kanpur.
 * Each is a documented cluster (Development Commissioner Handicrafts / MSME
 * cluster programmes / well-known trade hubs), not a fabrication.
 *
 * Every cluster lists the ESTABLISHMENT TYPES actually found there — because a
 * single hub contains individual artisans, organised cooperatives, retail
 * shops/showrooms, manufacturing factories, and sellers already online. The
 * platform must source from all of them, not just lone artisans.
 *
 * Authenticity rule (same as autoSource): the cluster name, region, state, and
 * product are REAL. We never invent an individual producer's name or contact —
 * those are verified by a human before outreach.
 */

// The kinds of supply-side establishment the platform can onboard.
const ESTABLISHMENT_TYPES = Object.freeze({
  ARTISAN: 'artisan',           // individual maker, often unregistered → Karigar
  COOPERATIVE: 'cooperative',   // organised producer group → Sansthan
  SHOP: 'shop',                 // small retail outlet → Vyapari
  SHOWROOM: 'showroom',         // larger retail/display → Vyapari
  FACTORY: 'factory',           // manufacturing unit → Vyapari/Niryatak
  EXPORTER: 'exporter',         // export house → Niryatak
  ONLINE_SELLER: 'online_seller', // already selling on marketplaces → Vyapari
  TOUR_OPERATOR: 'tour_operator', // experiences/heritage → Pravasi
  // ── Tourism sector establishments ──
  HOTEL: 'hotel',               // accommodation provider → Pravasi
  HOMESTAY: 'homestay',         // village/heritage homestay → Pravasi
  EVENT_MANAGER: 'event_manager', // weddings, festivals, craft events → Pravasi
  TRANSPORT: 'transport',       // cabs, tempo-travellers, transfers → Pravasi
  GUIDE: 'guide',               // licensed local/heritage guide → Pravasi
});

// Map an establishment type → the customer segment it best fits.
const TYPE_TO_SEGMENT = Object.freeze({
  artisan:       'karigar_prospect',
  cooperative:   'sansthan_prospect',
  shop:          'vyapari_prospect',
  showroom:      'vyapari_prospect',
  factory:       'vyapari_prospect',
  exporter:      'niryatak_prospect',
  online_seller: 'vyapari_prospect',
  tour_operator: 'pravasi_prospect',
  hotel:         'pravasi_prospect',
  homestay:      'pravasi_prospect',
  event_manager: 'pravasi_prospect',
  transport:     'pravasi_prospect',
  guide:         'pravasi_prospect',
});

// Best real enumeration channel per establishment type (mirrors the channels
// in sourcing.LEAD_SOURCES).
const TYPE_TO_SOURCE = Object.freeze({
  artisan:       'state_handicraft_boards',
  cooperative:   'fpo_database',
  shop:          'udyam_aadhaar',
  showroom:      'udyam_aadhaar',
  factory:       'udyam_aadhaar',
  exporter:      'epch_member_directory',
  online_seller: 'indiamart_seller_profiles',
  tour_operator: 'tourism_operator_registry',
  hotel:         'tourism_operator_registry',
  homestay:      'tourism_operator_registry',
  event_manager: 'tourism_operator_registry',
  transport:     'tourism_operator_registry',
  guide:         'tourism_operator_registry',
});

/**
 * Real Indian craft + industrial clusters. `gi_tagged: false` is the common
 * case — this is the supply the GI registry misses. A few overlap with GI
 * tags (marked true) because a hub can contain both GI and non-GI production.
 */
const SUPPLY_CLUSTERS = Object.freeze([
  // ── Metalware ──
  { id: 'moradabad_brass', name: 'Moradabad brass & metal handicraft', state: 'uttar pradesh', region: 'Moradabad', product: 'brassware, metal décor, EPNS', category: 'metalware', gi_tagged: false, scale: 'large', types: ['artisan', 'factory', 'exporter', 'showroom'] },
  { id: 'jaipur_metal', name: 'Jaipur metal & enamel ware', state: 'rajasthan', region: 'Jaipur', product: 'meenakari, brass, silver', category: 'metalware', gi_tagged: false, scale: 'medium', types: ['artisan', 'shop', 'exporter'] },
  { id: 'thanjavur_bronze', name: 'Thanjavur bronze & art metal', state: 'tamil nadu', region: 'Thanjavur', product: 'bronze idols, art plates', category: 'metalware', gi_tagged: true, scale: 'medium', types: ['artisan', 'showroom'] },

  // ── Glass & ceramics ──
  { id: 'firozabad_glass', name: 'Firozabad glass & bangles', state: 'uttar pradesh', region: 'Firozabad', product: 'glassware, bangles, beads', category: 'glass', gi_tagged: false, scale: 'large', types: ['factory', 'exporter', 'online_seller'] },
  { id: 'khurja_pottery', name: 'Khurja pottery', state: 'uttar pradesh', region: 'Khurja', product: 'glazed ceramic pottery', category: 'ceramics', gi_tagged: true, scale: 'medium', types: ['artisan', 'factory', 'shop'] },
  { id: 'morbi_ceramics', name: 'Morbi ceramics & tiles', state: 'gujarat', region: 'Morbi', product: 'ceramic tiles, sanitaryware', category: 'ceramics', gi_tagged: false, scale: 'large', types: ['factory', 'exporter'] },

  // ── Wood ──
  { id: 'saharanpur_wood', name: 'Saharanpur wood carving', state: 'uttar pradesh', region: 'Saharanpur', product: 'carved wood furniture, décor', category: 'woodcraft', gi_tagged: false, scale: 'large', types: ['artisan', 'factory', 'exporter', 'showroom'] },
  { id: 'jodhpur_furniture', name: 'Jodhpur wooden & iron furniture', state: 'rajasthan', region: 'Jodhpur', product: 'colonial & vintage furniture', category: 'furniture', gi_tagged: false, scale: 'large', types: ['factory', 'exporter', 'showroom', 'online_seller'] },
  { id: 'channapatna_toys', name: 'Channapatna lacquerware toys', state: 'karnataka', region: 'Channapatna', product: 'wooden lacquered toys', category: 'woodcraft', gi_tagged: true, scale: 'medium', types: ['artisan', 'cooperative', 'shop'] },
  { id: 'nagina_ebony', name: 'Nagina ebony wood craft', state: 'uttar pradesh', region: 'Nagina', product: 'ebony carving, inlay', category: 'woodcraft', gi_tagged: false, scale: 'small', types: ['artisan', 'shop'] },

  // ── Leather & footwear ──
  { id: 'agra_footwear', name: 'Agra leather footwear', state: 'uttar pradesh', region: 'Agra', product: 'leather shoes, footwear', category: 'leather', gi_tagged: false, scale: 'large', types: ['factory', 'exporter', 'online_seller'] },
  { id: 'kanpur_leather', name: 'Kanpur leather & saddlery', state: 'uttar pradesh', region: 'Kanpur', product: 'leather goods, saddlery', category: 'leather', gi_tagged: false, scale: 'large', types: ['factory', 'exporter'] },
  { id: 'kolhapur_chappal', name: 'Kolhapuri chappal', state: 'maharashtra', region: 'Kolhapur', product: 'leather handcrafted sandals', category: 'leather', gi_tagged: true, scale: 'medium', types: ['artisan', 'cooperative', 'shop'] },

  // ── Textiles & apparel (non-GI industrial) ──
  { id: 'tirupur_knitwear', name: 'Tirupur knitwear', state: 'tamil nadu', region: 'Tirupur', product: 'knitted garments, t-shirts', category: 'apparel', gi_tagged: false, scale: 'very_large', types: ['factory', 'exporter', 'online_seller'] },
  { id: 'ludhiana_hosiery', name: 'Ludhiana hosiery & woollens', state: 'punjab', region: 'Ludhiana', product: 'woollens, hosiery, knitwear', category: 'apparel', gi_tagged: false, scale: 'very_large', types: ['factory', 'exporter', 'online_seller'] },
  { id: 'panipat_furnishing', name: 'Panipat home furnishings', state: 'haryana', region: 'Panipat', product: 'blankets, rugs, home textiles', category: 'home_textile', gi_tagged: false, scale: 'large', types: ['factory', 'exporter'] },
  { id: 'sanganer_blockprint', name: 'Sanganer & Bagru block printing', state: 'rajasthan', region: 'Jaipur', product: 'hand block printed textiles', category: 'textile', gi_tagged: false, scale: 'medium', types: ['artisan', 'cooperative', 'factory', 'online_seller'] },
  { id: 'kutch_embroidery', name: 'Kutch embroidery & bandhani', state: 'gujarat', region: 'Kutch', product: 'mirror embroidery, bandhani', category: 'textile', gi_tagged: true, scale: 'medium', types: ['artisan', 'cooperative', 'shop'] },

  // ── Jewellery & gems ──
  { id: 'surat_diamond', name: 'Surat diamond cutting & polishing', state: 'gujarat', region: 'Surat', product: 'cut & polished diamonds', category: 'gems', gi_tagged: false, scale: 'very_large', types: ['factory', 'exporter'] },
  { id: 'jaipur_gems', name: 'Jaipur coloured gemstones & jewellery', state: 'rajasthan', region: 'Jaipur', product: 'gemstones, kundan, jadau', category: 'jewellery', gi_tagged: false, scale: 'large', types: ['factory', 'exporter', 'showroom', 'shop'] },
  { id: 'rajkot_jewellery', name: 'Rajkot gold & silver jewellery', state: 'gujarat', region: 'Rajkot', product: 'gold, silver, imitation jewellery', category: 'jewellery', gi_tagged: false, scale: 'large', types: ['factory', 'showroom', 'online_seller'] },

  // ── Sports, instruments, misc industrial ──
  { id: 'jalandhar_sports', name: 'Jalandhar sports goods', state: 'punjab', region: 'Jalandhar', product: 'sports equipment, inflatables', category: 'sports_goods', gi_tagged: false, scale: 'large', types: ['factory', 'exporter'] },
  { id: 'meerut_sports', name: 'Meerut sports & musical instruments', state: 'uttar pradesh', region: 'Meerut', product: 'sports goods, band instruments', category: 'sports_goods', gi_tagged: false, scale: 'large', types: ['factory', 'exporter'] },
  { id: 'aligarh_locks', name: 'Aligarh locks & hardware', state: 'uttar pradesh', region: 'Aligarh', product: 'locks, builder hardware', category: 'hardware', gi_tagged: false, scale: 'large', types: ['factory', 'online_seller'] },
  { id: 'kannauj_attar', name: 'Kannauj attar & perfume', state: 'uttar pradesh', region: 'Kannauj', product: 'natural attar, essential oils', category: 'naturals', gi_tagged: true, scale: 'medium', types: ['artisan', 'factory', 'shop'] },

  // ── Tourism / experiences ──
  { id: 'jaipur_heritage_tours', name: 'Jaipur heritage & craft tourism', state: 'rajasthan', region: 'Jaipur', product: 'heritage walks, craft workshops, stays', category: 'tourism', gi_tagged: false, scale: 'large', types: ['tour_operator', 'hotel', 'event_manager', 'transport', 'guide'] },
  { id: 'udaipur_tourism', name: 'Udaipur lake & palace tourism', state: 'rajasthan', region: 'Udaipur', product: 'palace stays, boat tours, weddings', category: 'tourism', gi_tagged: false, scale: 'large', types: ['hotel', 'event_manager', 'tour_operator', 'transport'] },
  { id: 'kutch_homestay', name: 'Kutch artisan village homestays', state: 'gujarat', region: 'Kutch', product: 'craft-village homestays, tours', category: 'tourism', gi_tagged: false, scale: 'small', types: ['homestay', 'tour_operator', 'cooperative', 'guide'] },
  { id: 'varanasi_tourism', name: 'Varanasi spiritual & craft tourism', state: 'uttar pradesh', region: 'Varanasi', product: 'ghats, weaving tours, guides', category: 'tourism', gi_tagged: false, scale: 'large', types: ['tour_operator', 'hotel', 'guide', 'transport'] },
  { id: 'goa_events', name: 'Goa events & destination weddings', state: 'goa', region: 'Goa', product: 'destination weddings, festivals', category: 'tourism', gi_tagged: false, scale: 'large', types: ['event_manager', 'hotel', 'transport'] },
]);

/** List clusters with optional filters. */
function listClusters({ state, category, type, giTagged } = {}) {
  let out = SUPPLY_CLUSTERS.slice();
  if (state) out = out.filter((c) => c.state === String(state).toLowerCase());
  if (category) out = out.filter((c) => c.category === String(category).toLowerCase());
  if (type) out = out.filter((c) => c.types.includes(type));
  if (giTagged === true || giTagged === false) out = out.filter((c) => c.gi_tagged === giTagged);
  return out;
}

/** Distinct establishment types present across the dataset. */
function establishmentTypesPresent() {
  const s = new Set();
  for (const c of SUPPLY_CLUSTERS) for (const t of c.types) s.add(t);
  return [...s];
}

module.exports = {
  ESTABLISHMENT_TYPES,
  TYPE_TO_SEGMENT,
  TYPE_TO_SOURCE,
  SUPPLY_CLUSTERS,
  listClusters,
  establishmentTypesPresent,
};
