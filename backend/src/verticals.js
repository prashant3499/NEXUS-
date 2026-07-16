/**
 * UNIFIED — Vertical Configuration Registry
 * The 5 verticals (gems, GI, handicraft, naturals, tourism) are NOT separate
 * codebases. They are CONFIG MODULES on one engine. Adding/changing a vertical
 * is data, not code — the "no-code in future" principle, in practice.
 *
 * Each vertical declares: its attribute schema, compliance hooks, the modalities
 * it supports (D2C/B2B/B2B2C/EXIM/POS), and which engine model applies by default.
 * Pure Node.js.
 */

'use strict';

const MODALITY = { D2C: 1, B2B: 2, B2B2C: 4, EXIM: 8, POS: 16 };

/** A vertical is pure configuration. The engine reads this — it has no per-vertical code. */
const VERTICALS = {
  gems: {
    label: 'Gems & Gemstones',
    attributes: ['carat', 'cut', 'clarity', 'cert_lab', 'cert_no', 'origin', 'treatment'],
    compliance: ['kimberley_process', 'bis_hallmark_if_set', 'gjepc_membership', 'pmla_high_value'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.EXIM | MODALITY.POS,
    high_value: true,            // triggers enhanced KYC + PMLA monitoring
    default_export_model: 'mor', // platform as exporter of record for small sellers
    risk_notes: 'PMLA reporting on high-value; Kimberley for diamonds; treatment disclosure mandatory.',
  },
  jewellery: {
    label: 'Jewellery',
    attributes: ['metal', 'purity', 'huid', 'gross_weight', 'stone_details', 'making_charges'],
    compliance: ['bis_hallmark_huid', 'huid_mandatory', 'gst_3pct_gold'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.B2B2C | MODALITY.EXIM | MODALITY.POS,
    high_value: true,
    default_export_model: 'mor',
    risk_notes: 'HUID hallmarking mandatory since 2021; 3% GST on gold; weight-based valuation.',
  },
  gi: {
    label: 'GI-Tagged Products',
    attributes: ['gi_registry_no', 'origin_state', 'craft_cluster', 'authorised_user_no', 'gi_verified'],
    compliance: ['gi_registry_verification', 'authorised_user_check', 'origin_proof'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.B2B2C | MODALITY.EXIM | MODALITY.POS,
    high_value: false,
    default_export_model: 'mor',
    risk_notes: 'GI authenticity is the trust anchor; verify authorised-user status against IP India registry.',
  },
  handicraft: {
    label: 'Handicrafts & Home Decor',
    attributes: ['materials', 'dimensions', 'craft_technique', 'artisan_story', 'is_handmade'],
    compliance: ['epch_if_export', 'wood_legality_if_timber', 'handmade_certification'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.B2B2C | MODALITY.EXIM | MODALITY.POS,
    high_value: false,
    default_export_model: 'mor',
    risk_notes: 'EPCH for export promotion; timber legality for wooden goods; artisan provenance.',
  },
  naturals: {
    label: 'Sustainable Naturals (nature to nature)',
    attributes: ['organic_cert_no', 'harvest_date', 'farm_gps', 'carbon_footprint_kg', 'biodegradable'],
    compliance: ['fssai_if_edible', 'organic_apeda', 'eu_csrd_if_export', 'phytosanitary_if_plant'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.EXIM,
    high_value: false,
    default_export_model: 'mor',
    risk_notes: 'FSSAI mandatory for edibles; APEDA organic cert; phytosanitary for plant export; CSRD for EU.',
  },
  tourism: {
    label: 'Tourism (all 7 categories)',
    attributes: ['duration_min', 'risk_level', 'max_group', 'guide_languages', 'seasonality', 'accessibility_rating'],
    compliance: ['mot_registration', 'operator_license', 'cgl_insurance', 'adventure_insurance_if_high_risk'],
    modalities: MODALITY.D2C | MODALITY.B2B2C,
    high_value: false,
    default_export_model: 'agent', // services → agent model always
    risk_notes: 'Risk-stratified; operator-bound insurance; platform is always the agent, never operator.',
  },
  environment: {
    label: 'Environment & Climate (green craft, regenerative, carbon)',
    // Eco-craft, upcycled/regenerative goods, and verified-green products —
    // plus the climate layer: carbon-offset attribution and ESG-grade claims.
    attributes: ['eco_certification', 'material_source', 'carbon_kg_avoided', 'recycled_pct', 'biodegradable', 'impact_claim'],
    compliance: ['eco_claim_substantiation', 'no_greenwashing_disclosure', 'organic_cert_if_claimed', 'carbon_methodology_if_credited'],
    modalities: MODALITY.D2C | MODALITY.B2B | MODALITY.B2B2C | MODALITY.EXIM,
    high_value: false,
    default_export_model: 'mor',
    risk_notes: 'Green claims must be substantiated (anti-greenwashing); carbon credits require an accredited methodology. Opens ESG/CSR capital + carbon-credit revenue.',
  },
};

/** Does a vertical support a given modality? (bitmask check) */
function supportsModality(verticalKey, modality) {
  const v = VERTICALS[verticalKey];
  if (!v) throw new Error(`Unknown vertical: ${verticalKey}`);
  return (v.modalities & modality) === modality;
}

/** Validate a product's attributes against its vertical schema. */
function validateAttributes(verticalKey, attrs = {}) {
  const v = VERTICALS[verticalKey];
  if (!v) throw new Error(`Unknown vertical: ${verticalKey}`);
  const missing = v.attributes.filter(a => attrs[a] === undefined);
  return { valid: missing.length === 0, missing, required: v.attributes };
}

/** Compliance hooks that fire for a vertical + modality combination. */
function complianceHooks(verticalKey, { isExport = false, isEdible = false } = {}) {
  const v = VERTICALS[verticalKey];
  if (!v) throw new Error(`Unknown vertical: ${verticalKey}`);
  return v.compliance.filter(hook => {
    if (hook.includes('export') || hook.includes('csrd') || hook.includes('phytosanitary')) return isExport;
    if (hook.includes('fssai') || hook.includes('edible')) return isEdible;
    return true;
  });
}

/** Register or update a vertical at runtime — no code change, pure data (no-code principle). */
function registerVertical(key, config) {
  if (!config.attributes || !config.compliance || config.modalities === undefined) {
    throw new Error('Vertical config requires: attributes, compliance, modalities');
  }
  VERTICALS[key] = { high_value: false, default_export_model: 'mor', ...config };
  return VERTICALS[key];
}

module.exports = { VERTICALS, MODALITY, supportsModality, validateAttributes, complianceHooks, registerVertical };
