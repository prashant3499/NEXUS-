'use strict';

/**
 * craftInputs.js
 *
 * The platform sells what artisans MAKE. But artisans also BUY — the tools and
 * raw materials they make with. A weaver needs a loom, shuttles, and yarn; a
 * potter needs a wheel, a kiln, and clay; a block-printer needs carved blocks
 * and natural dyes. Today these are sourced from fragmented local suppliers at
 * poor prices.
 *
 * Modeling them turns the platform into a two-sided engine: a marketplace for
 * artisans' OUTPUT and a sourcing channel for their INPUTS — a second revenue
 * stream and a powerful retention hook (an artisan who buys their yarn here
 * stays here). This module is the catalog of those inputs, mapped to the crafts
 * that use them, with indicative price bands.
 *
 * Authenticity rule (same as everywhere): these are real, well-known tools and
 * materials of Indian crafts — not invented SKUs or fake suppliers.
 */

const INPUT_TYPE = Object.freeze({ TOOL: 'tool', MATERIAL: 'material', EQUIPMENT: 'equipment' });

// Indicative price bands in paise (min/typical) — a starting reference, not a
// live quote. Tools are durable (bought rarely); materials recur (bought often).
const band = (min, typical) => ({ min_paise: min, typical_paise: typical });

/**
 * Real craft inputs. `crafts` lists the craft categories that use each input,
 * so the platform can recommend inputs to a seller based on what they make.
 */
const CRAFT_INPUTS = Object.freeze([
  // ── Weaving / textile ──
  { id: 'handloom', name: 'Handloom (pit / frame loom)', type: INPUT_TYPE.EQUIPMENT, crafts: ['textile', 'apparel', 'home_textile'], recurring: false, band: band(800000, 2500000) },
  { id: 'shuttle', name: 'Shuttle & bobbins', type: INPUT_TYPE.TOOL, crafts: ['textile', 'apparel'], recurring: false, band: band(20000, 80000) },
  { id: 'silk_yarn', name: 'Mulberry / tussar silk yarn', type: INPUT_TYPE.MATERIAL, crafts: ['textile', 'apparel'], recurring: true, band: band(150000, 600000) },
  { id: 'cotton_yarn', name: 'Cotton yarn (various counts)', type: INPUT_TYPE.MATERIAL, crafts: ['textile', 'apparel', 'home_textile'], recurring: true, band: band(40000, 200000) },
  { id: 'zari', name: 'Zari (metallic thread)', type: INPUT_TYPE.MATERIAL, crafts: ['textile'], recurring: true, band: band(80000, 400000) },

  // ── Block printing / dyeing ──
  { id: 'carved_block', name: 'Hand-carved wooden printing blocks', type: INPUT_TYPE.TOOL, crafts: ['textile'], recurring: false, band: band(30000, 150000) },
  { id: 'natural_dye', name: 'Natural dyes (indigo, madder, turmeric)', type: INPUT_TYPE.MATERIAL, crafts: ['textile', 'naturals'], recurring: true, band: band(20000, 120000) },
  { id: 'mordant', name: 'Mordants (alum, iron)', type: INPUT_TYPE.MATERIAL, crafts: ['textile'], recurring: true, band: band(10000, 50000) },

  // ── Pottery / ceramics ──
  { id: 'potters_wheel', name: 'Potter\u2019s wheel (electric / kick)', type: INPUT_TYPE.EQUIPMENT, crafts: ['ceramics', 'craft'], recurring: false, band: band(400000, 1500000) },
  { id: 'kiln', name: 'Kiln (gas / electric)', type: INPUT_TYPE.EQUIPMENT, crafts: ['ceramics'], recurring: false, band: band(1500000, 8000000) },
  { id: 'clay', name: 'Terracotta / stoneware clay', type: INPUT_TYPE.MATERIAL, crafts: ['ceramics', 'craft'], recurring: true, band: band(15000, 80000) },
  { id: 'glaze', name: 'Ceramic glazes', type: INPUT_TYPE.MATERIAL, crafts: ['ceramics'], recurring: true, band: band(25000, 150000) },

  // ── Metalware / jewellery ──
  { id: 'anvil_hammer', name: 'Anvil & forming hammers', type: INPUT_TYPE.TOOL, crafts: ['metalware', 'jewellery'], recurring: false, band: band(50000, 250000) },
  { id: 'jewellers_kit', name: 'Jeweller\u2019s bench tools (files, pliers, torch)', type: INPUT_TYPE.TOOL, crafts: ['jewellery'], recurring: false, band: band(80000, 400000) },
  { id: 'brass_sheet', name: 'Brass / copper sheet & wire', type: INPUT_TYPE.MATERIAL, crafts: ['metalware'], recurring: true, band: band(60000, 300000) },
  { id: 'silver', name: 'Silver (for jadau / filigree)', type: INPUT_TYPE.MATERIAL, crafts: ['jewellery'], recurring: true, band: band(200000, 1000000) },

  // ── Woodcraft / furniture ──
  { id: 'chisel_set', name: 'Wood carving chisels & gouges', type: INPUT_TYPE.TOOL, crafts: ['woodcraft', 'furniture'], recurring: false, band: band(40000, 180000) },
  { id: 'wood_lathe', name: 'Wood lathe', type: INPUT_TYPE.EQUIPMENT, crafts: ['woodcraft', 'furniture'], recurring: false, band: band(300000, 1200000) },
  { id: 'seasoned_wood', name: 'Seasoned wood (sheesham, mango, teak)', type: INPUT_TYPE.MATERIAL, crafts: ['woodcraft', 'furniture'], recurring: true, band: band(100000, 500000) },
  { id: 'lac', name: 'Lac (for lacquerware)', type: INPUT_TYPE.MATERIAL, crafts: ['woodcraft'], recurring: true, band: band(15000, 70000) },

  // ── Leather ──
  { id: 'leather_tools', name: 'Leather working tools (awl, edge, punch)', type: INPUT_TYPE.TOOL, crafts: ['leather'], recurring: false, band: band(30000, 150000) },
  { id: 'tanned_leather', name: 'Vegetable-tanned leather hides', type: INPUT_TYPE.MATERIAL, crafts: ['leather'], recurring: true, band: band(80000, 400000) },

  // ── Packaging (every artisan needs it) ──
  { id: 'eco_packaging', name: 'Eco-friendly packaging & GI labels', type: INPUT_TYPE.MATERIAL, crafts: ['*'], recurring: true, band: band(5000, 40000) },
]);

/** All inputs an artisan in a given craft category would need. */
function inputsForCraft(craft) {
  const c = String(craft || '').toLowerCase();
  return CRAFT_INPUTS.filter((i) => i.crafts.includes('*') || i.crafts.includes(c));
}

/** Split a craft's inputs into the durable tools vs the recurring materials. */
function shoppingList(craft) {
  const items = inputsForCraft(craft);
  return {
    craft,
    tools: items.filter((i) => !i.recurring),
    materials: items.filter((i) => i.recurring),
    one_time_setup_paise: items.filter((i) => !i.recurring).reduce((s, i) => s + i.band.typical_paise, 0),
    recurring_monthly_estimate_paise: items.filter((i) => i.recurring).reduce((s, i) => s + i.band.typical_paise, 0),
  };
}

/** Full catalog, optionally filtered by type. */
function catalog({ type } = {}) {
  let items = CRAFT_INPUTS.slice();
  if (type) items = items.filter((i) => i.type === type);
  return {
    items,
    total: items.length,
    tools: CRAFT_INPUTS.filter((i) => i.type === INPUT_TYPE.TOOL).length,
    materials: CRAFT_INPUTS.filter((i) => i.type === INPUT_TYPE.MATERIAL).length,
    equipment: CRAFT_INPUTS.filter((i) => i.type === INPUT_TYPE.EQUIPMENT).length,
    crafts_covered: [...new Set(CRAFT_INPUTS.flatMap((i) => i.crafts).filter((c) => c !== '*'))],
  };
}

module.exports = {
  INPUT_TYPE,
  CRAFT_INPUTS,
  inputsForCraft,
  shoppingList,
  catalog,
};
