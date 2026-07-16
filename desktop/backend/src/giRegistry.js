/**
 * NEXUS — GI Registry seed.
 *
 * This is a SEED file containing 50+ entries from India's Geographical
 * Indications (GI) register. The full register at ipindia.gov.in lists
 * approximately 600+ active entries. In production, this file is replaced
 * by a live feed from the GI register; this seed is sufficient for the
 * most common categories to make verification meaningful from day one.
 *
 * Source: Public records of registered GIs maintained by the Geographical
 * Indications Registry, Office of the Controller-General of Patents,
 * Designs and Trade Marks, Government of India.
 *
 * Each entry:
 *   gi        — the registered GI name (canonical form)
 *   aliases   — common variant spellings buyers/sellers use
 *   region    — registered region(s) of origin (state, district)
 *   states    — normalized state list for region cross-check
 *   category  — high-level grouping (textile, craft, food, spice, etc.)
 *   craft     — the traditional craft technique or product type
 *   year      — year of GI registration
 *
 * The format is deliberately verbose so verification can cross-check
 * against multiple signals (region match, craft match, alias match)
 * rather than just a name lookup.
 */

'use strict';

const REGISTRY = [
  // ── Textiles & Weaving ──
  { gi: 'Banarasi Saree', aliases: ['banaras saree','varanasi silk','banarasi silk'], region: 'Varanasi', states: ['uttar pradesh','up'], category: 'textile', craft: 'silk weaving brocade zari', year: 2009 },
  { gi: 'Kanchipuram Silk', aliases: ['kanjivaram','kanjeevaram'], region: 'Kanchipuram', states: ['tamil nadu','tn'], category: 'textile', craft: 'silk weaving zari', year: 2005 },
  { gi: 'Mysore Silk', aliases: ['mysuru silk'], region: 'Mysuru', states: ['karnataka'], category: 'textile', craft: 'silk weaving', year: 2005 },
  { gi: 'Pochampally Ikat', aliases: ['pochampalli','pochampally'], region: 'Bhoodan Pochampally', states: ['telangana'], category: 'textile', craft: 'ikat tie-dye weaving', year: 2005 },
  { gi: 'Pashmina Shawl', aliases: ['kashmir pashmina','cashmere'], region: 'Kashmir', states: ['jammu and kashmir','jk','j&k','ladakh'], category: 'textile', craft: 'pashmina wool weaving', year: 2008 },
  { gi: 'Kani Shawl', aliases: ['kashmiri kani'], region: 'Kashmir', states: ['jammu and kashmir'], category: 'textile', craft: 'pashmina twill tapestry weaving', year: 2008 },
  { gi: 'Chanderi Saree', aliases: ['chanderi silk','chanderi fabric'], region: 'Chanderi', states: ['madhya pradesh','mp'], category: 'textile', craft: 'silk-cotton weaving zari', year: 2005 },
  { gi: 'Maheshwari Saree', aliases: ['maheshwar'], region: 'Maheshwar', states: ['madhya pradesh'], category: 'textile', craft: 'silk-cotton weaving', year: 2010 },
  { gi: 'Sambalpuri Saree', aliases: ['sambalpur ikat'], region: 'Sambalpur', states: ['odisha','orissa'], category: 'textile', craft: 'ikat weaving bandha', year: 2010 },
  { gi: 'Kullu Shawl', aliases: ['kullu wool'], region: 'Kullu', states: ['himachal pradesh','hp'], category: 'textile', craft: 'wool weaving handloom', year: 2005 },
  { gi: 'Kashmir Pashmina', aliases: ['pashmina'], region: 'Kashmir', states: ['jammu and kashmir'], category: 'textile', craft: 'pashmina spinning weaving', year: 2008 },
  { gi: 'Muga Silk', aliases: ['assam muga'], region: 'Assam', states: ['assam'], category: 'textile', craft: 'muga silk weaving', year: 2007 },
  { gi: 'Bhagalpur Silk', aliases: ['bhagalpuri','tussar silk bhagalpur'], region: 'Bhagalpur', states: ['bihar'], category: 'textile', craft: 'tussar silk weaving', year: 2013 },
  { gi: 'Solapur Chaddar', aliases: ['solapur towel'], region: 'Solapur', states: ['maharashtra'], category: 'textile', craft: 'cotton weaving', year: 2010 },
  { gi: 'Paithani Saree', aliases: ['paithan silk'], region: 'Paithan', states: ['maharashtra'], category: 'textile', craft: 'silk weaving zari peacock motif', year: 2010 },
  { gi: 'Patola Saree', aliases: ['patan patola','patola silk'], region: 'Patan', states: ['gujarat'], category: 'textile', craft: 'double ikat silk weaving', year: 2013 },
  { gi: 'Tangaliya Shawl', aliases: ['tangalia'], region: 'Surendranagar', states: ['gujarat'], category: 'textile', craft: 'cotton wool weaving dana work', year: 2009 },

  // ── Block Printing & Embroidery ──
  { gi: 'Ajrakh', aliases: ['ajrakh print','kutch ajrakh'], region: 'Kutch', states: ['gujarat'], category: 'craft', craft: 'block printing natural dyes', year: 2011 },
  { gi: 'Phulkari', aliases: ['punjabi phulkari'], region: 'Punjab', states: ['punjab','haryana'], category: 'craft', craft: 'embroidery floss silk', year: 2010 },
  { gi: 'Kasuti Embroidery', aliases: ['kasuti work'], region: 'Karnataka', states: ['karnataka'], category: 'craft', craft: 'embroidery counted stitch', year: 2008 },
  { gi: 'Chikankari', aliases: ['lucknow chikan','chikan work'], region: 'Lucknow', states: ['uttar pradesh'], category: 'craft', craft: 'embroidery white-on-white', year: 2008 },
  { gi: 'Kantha', aliases: ['bengal kantha','nakshi kantha'], region: 'West Bengal', states: ['west bengal','wb'], category: 'craft', craft: 'embroidery running stitch quilt', year: 2008 },
  { gi: 'Kalamkari', aliases: ['srikalahasti kalamkari','machilipatnam kalamkari'], region: 'Andhra Pradesh', states: ['andhra pradesh','ap','telangana'], category: 'craft', craft: 'hand-painted block-printed cotton', year: 2008 },
  { gi: 'Bagh Print', aliases: ['bagh prints'], region: 'Bagh', states: ['madhya pradesh'], category: 'craft', craft: 'block printing natural dyes', year: 2008 },

  // ── Pottery, Ceramics & Lacquerware ──
  { gi: 'Blue Pottery', aliases: ['jaipur blue pottery'], region: 'Jaipur', states: ['rajasthan'], category: 'craft', craft: 'glazed quartz pottery', year: 2008 },
  { gi: 'Khurja Pottery', aliases: ['khurja ceramic'], region: 'Khurja', states: ['uttar pradesh'], category: 'craft', craft: 'glazed pottery ceramic', year: 2008 },
  { gi: 'Channapatna Toys', aliases: ['channapatna lacquerware','wooden toys channapatna'], region: 'Channapatna', states: ['karnataka'], category: 'craft', craft: 'lacquerware wooden toy turning', year: 2006 },

  // ── Metalwork ──
  { gi: 'Bidri Ware', aliases: ['bidri','bidriware'], region: 'Bidar', states: ['karnataka'], category: 'craft', craft: 'metal inlay silver zinc', year: 2006 },
  { gi: 'Pembarthi Metal Craft', aliases: ['pembarthi brass'], region: 'Pembarthi', states: ['telangana'], category: 'craft', craft: 'sheet metal embossing brass', year: 2010 },
  { gi: 'Moradabad Metal Craft', aliases: ['moradabad brass'], region: 'Moradabad', states: ['uttar pradesh'], category: 'craft', craft: 'brass metal craft engraving', year: 2014 },
  { gi: 'Thanjavur Art Plate', aliases: ['thanjavur plate'], region: 'Thanjavur', states: ['tamil nadu'], category: 'craft', craft: 'metal art plate repousse silver', year: 2007 },

  // ── Painting & Folk Art ──
  { gi: 'Madhubani Painting', aliases: ['mithila painting'], region: 'Madhubani', states: ['bihar'], category: 'craft', craft: 'folk painting natural pigments', year: 2007 },
  { gi: 'Pattachitra', aliases: ['orissa pattachitra','odisha pattachitra'], region: 'Odisha', states: ['odisha'], category: 'craft', craft: 'palm-leaf cloth painting', year: 2008 },
  { gi: 'Warli Painting', aliases: ['warli art'], region: 'Maharashtra', states: ['maharashtra'], category: 'craft', craft: 'tribal folk painting', year: 2014 },
  { gi: 'Tanjore Painting', aliases: ['thanjavur painting'], region: 'Thanjavur', states: ['tamil nadu'], category: 'craft', craft: 'gold-foil painting devotional', year: 2007 },

  // ── Food & Agriculture ──
  { gi: 'Darjeeling Tea', aliases: ['darjeeling'], region: 'Darjeeling', states: ['west bengal'], category: 'food', craft: 'tea cultivation processing', year: 2004 },
  { gi: 'Assam Tea (Orthodox)', aliases: ['assam tea','assam orthodox'], region: 'Assam', states: ['assam'], category: 'food', craft: 'tea cultivation orthodox processing', year: 2007 },
  { gi: 'Nilgiri Tea (Orthodox)', aliases: ['nilgiri tea','nilgiri orthodox'], region: 'Nilgiris', states: ['tamil nadu'], category: 'food', craft: 'tea cultivation orthodox processing', year: 2008 },
  { gi: 'Coorg Orange', aliases: ['kodagu orange'], region: 'Kodagu', states: ['karnataka'], category: 'food', craft: 'citrus cultivation', year: 2007 },
  { gi: 'Naga Mircha', aliases: ['naga chilli','bhut jolokia naga'], region: 'Nagaland', states: ['nagaland'], category: 'food', craft: 'chilli cultivation', year: 2008 },
  { gi: 'Basmati', aliases: ['basmati rice'], region: 'Indo-Gangetic plains', states: ['punjab','haryana','himachal pradesh','uttarakhand','delhi','uttar pradesh','jammu and kashmir'], category: 'food', craft: 'aromatic long-grain rice', year: 2016 },
  { gi: 'Tirupati Laddu', aliases: ['tirupati ladoo'], region: 'Tirupati', states: ['andhra pradesh'], category: 'food', craft: 'sweet ladoo besan', year: 2009 },
  { gi: 'Mysore Pak', aliases: ['mysuru pak'], region: 'Mysuru', states: ['karnataka'], category: 'food', craft: 'sweet besan ghee', year: 2017 },
  { gi: 'Bikaneri Bhujia', aliases: ['bikaner bhujia'], region: 'Bikaner', states: ['rajasthan'], category: 'food', craft: 'savoury snack moth bean', year: 2010 },
  { gi: 'Ratlami Sev', aliases: ['ratlam sev'], region: 'Ratlam', states: ['madhya pradesh'], category: 'food', craft: 'savoury snack besan spiced', year: 2014 },
  { gi: 'Banglar Rasogolla', aliases: ['bengali rasgulla','bengal rasogolla'], region: 'West Bengal', states: ['west bengal'], category: 'food', craft: 'sweet chhena cottage cheese', year: 2017 },

  // ── Spices ──
  { gi: 'Kashmir Saffron', aliases: ['kashmiri saffron','pampore saffron'], region: 'Pampore Kashmir', states: ['jammu and kashmir'], category: 'spice', craft: 'saffron cultivation', year: 2020 },
  { gi: 'Guntur Sannam Chilli', aliases: ['guntur chilli'], region: 'Guntur', states: ['andhra pradesh'], category: 'spice', craft: 'chilli cultivation', year: 2011 },
  { gi: 'Byadagi Chilli', aliases: ['byadgi chilli'], region: 'Byadagi', states: ['karnataka'], category: 'spice', craft: 'chilli cultivation', year: 2011 },
  { gi: 'Alleppey Green Cardamom', aliases: ['alappuzha cardamom'], region: 'Idukki', states: ['kerala'], category: 'spice', craft: 'cardamom cultivation', year: 2008 },
  { gi: 'Malabar Pepper', aliases: ['kerala black pepper'], region: 'Malabar', states: ['kerala'], category: 'spice', craft: 'black pepper cultivation', year: 2008 },

  // ── Wood & Stone ──
  { gi: 'Saharanpur Wood Craft', aliases: ['saharanpur woodwork'], region: 'Saharanpur', states: ['uttar pradesh'], category: 'craft', craft: 'wood carving inlay', year: 2007 },
  { gi: 'Etikoppaka Toys', aliases: ['etikoppaka lacquerware'], region: 'Etikoppaka', states: ['andhra pradesh'], category: 'craft', craft: 'wooden toy turning lacquer', year: 2017 },
  { gi: 'Mahabalipuram Stone Sculpture', aliases: ['mamallapuram sculpture'], region: 'Mahabalipuram', states: ['tamil nadu'], category: 'craft', craft: 'stone carving sculpture', year: 2014 },
];

/** Normalize a string for case/space-insensitive matching. */
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Look up a registered GI by name or alias. Returns null if no match. */
function findRegistered(query) {
  const q = norm(query);
  if (!q) return null;
  const words = q.split(' ').filter(Boolean);
  if (!words.length) return null;
  // 1) exact match on canonical name or alias
  for (const entry of REGISTRY) {
    if (norm(entry.gi) === q) return entry;
    if (entry.aliases.some(a => norm(a) === q)) return entry;
  }
  // 2) canonical name appears as a contiguous run inside the query
  for (const entry of REGISTRY) {
    const canon = norm(entry.gi);
    if (q.includes(canon)) return entry;
  }
  // 3) any alias appears as a contiguous run inside the query
  for (const entry of REGISTRY) {
    if (entry.aliases.some(a => q.includes(norm(a)))) return entry;
  }
  // 4) partial: every meaningful (>=4 char) word of canonical name is in the query
  for (const entry of REGISTRY) {
    const canonWords = norm(entry.gi).split(' ').filter(w => w.length >= 4);
    if (canonWords.length && canonWords.every(w => words.includes(w))) return entry;
  }
  return null;
}

/** Return all registered GIs, optionally filtered by category. */
function list(category) {
  return category ? REGISTRY.filter(e => e.category === category) : REGISTRY.slice();
}

module.exports = { REGISTRY, findRegistered, norm, list };
