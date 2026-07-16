'use strict';

/**
 * products.js
 *
 * Seller product catalog. Every seller signed up via /api/sellers can
 * list products through this module. The lifecycle:
 *
 *   draft → pending_review → active → sold_out → archived
 *                       └─→ rejected (by founder review)
 *
 * Archetypes affect how products are listed:
 *   - Karigar    — basic listing, NEXUS handles HSN+GST automatically (MoR)
 *   - Vyapari    — needs HSN code, NEXUS suggests from craft
 *   - Niryatak   — needs HSN + export-eligibility flag
 *   - Sansthan   — products attached to a member (sub-beneficiary)
 *   - Pravasi    — "experiences" (different model — not handled here)
 *
 * This is a pure module. Caller owns persistence. Photos pass through
 * as base64 strings or external URLs; production would use multipart
 * upload to object storage (S3/R2). The module just records the URLs.
 */

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const VALID_STATUSES = ['draft', 'pending_review', 'active', 'sold_out', 'archived', 'rejected'];

/** Forward-only state machine. Founder approves a pending_review →
 *  active. Seller can archive an active. Stock change can flip active
 *  ↔ sold_out. Rejection is terminal until the seller edits + resubmits. */
const VALID_TRANSITIONS = {
  draft: ['pending_review', 'archived'],
  pending_review: ['active', 'rejected', 'draft'],   // back-to-draft if seller edits
  active: ['sold_out', 'archived'],
  sold_out: ['active', 'archived'],                  // restock or retire
  rejected: ['draft'],                                // edit + resubmit
  archived: [],                                       // terminal
};

/** Six verticals (matches src/verticals.js). */
const VALID_VERTICALS = ['handicraft', 'gi', 'gems', 'jewellery', 'naturals', 'tourism'];

/** HSN auto-suggest table — small static mapping per craft category.
 *  Production would call the CBIC HSN Finder API. The numbers are real
 *  CBIC HSN codes with their applicable GST rates. */
const HSN_BY_CRAFT = Object.freeze({
  pottery:           { hsn: '6913', name: 'Ornamental ceramic articles',           gst_rate: 12 },
  ceramic:           { hsn: '6913', name: 'Ornamental ceramic articles',           gst_rate: 12 },
  terracotta:        { hsn: '6914', name: 'Other ceramic articles',                gst_rate: 5  },
  block_printing:    { hsn: '5208', name: 'Cotton woven fabric',                   gst_rate: 5  },
  bandhani:          { hsn: '5208', name: 'Cotton woven fabric (tie-dyed)',         gst_rate: 5  },
  block_print_apparel:{ hsn:'6204', name: 'Womens or girls suits and dresses',     gst_rate: 12 },
  pashmina:          { hsn: '5111', name: 'Woollen fabric',                        gst_rate: 5  },
  weaving:           { hsn: '5208', name: 'Cotton woven fabric',                   gst_rate: 5  },
  painting:          { hsn: '9701', name: 'Paintings, drawings and pastels',       gst_rate: 12 },
  madhubani:         { hsn: '9701', name: 'Folk paintings (Madhubani)',            gst_rate: 12 },
  jewellery_gold:    { hsn: '7113', name: 'Articles of jewellery (precious metal)', gst_rate: 3  },
  jewellery_silver:  { hsn: '7113', name: 'Articles of jewellery (silver)',         gst_rate: 3  },
  jewellery_imitation:{ hsn:'7117', name: 'Imitation jewellery',                    gst_rate: 3  },
  gemstones:         { hsn: '7103', name: 'Precious or semi-precious stones',       gst_rate: 0.25 },
  diamonds:          { hsn: '7102', name: 'Diamonds, cut or uncut',                 gst_rate: 0.25 },
  soap:              { hsn: '3401', name: 'Soap (handmade)',                       gst_rate: 18 },
  honey:             { hsn: '0409', name: 'Natural honey',                         gst_rate: 0  },
  spices:            { hsn: '0910', name: 'Other spices',                          gst_rate: 5  },
  carpet:            { hsn: '5701', name: 'Carpets, knotted',                      gst_rate: 12 },
  woodcraft:         { hsn: '4420', name: 'Wood marquetry and inlaid wood',         gst_rate: 12 },
  metalwork:         { hsn: '8306', name: 'Statuettes, ornaments of base metal',    gst_rate: 12 },
  leather:           { hsn: '4202', name: 'Leather articles',                      gst_rate: 18 },
});

const MIN_PRICE_PAISE = 1000;          // ₹10 minimum — anything less is likely a typo
const MAX_PRICE_PAISE = 5_00_00_000;   // ₹5 crore — anything more needs founder verification
const MAX_PHOTOS = 8;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;

// ════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════

/** Get HSN suggestion for a craft category. Falls back to a generic
 *  handicraft HSN if the craft isn't in our mapping. */
function suggestHsn(craft) {
  if (!craft || typeof craft !== 'string') return null;
  const key = craft.toLowerCase().trim().replace(/[\s-]+/g, '_');
  return HSN_BY_CRAFT[key] || null;
}

/** Validate the create-product input. Returns { ok, errors }. */
function validateProductInput(input, sellerArchetype) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input required'] };
  if (!input.title || typeof input.title !== 'string' || input.title.trim().length < 3) {
    errors.push('title must be at least 3 characters');
  }
  if (input.title && input.title.length > MAX_TITLE_LENGTH) {
    errors.push(`title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  if (input.description && typeof input.description !== 'string') {
    errors.push('description must be a string');
  }
  if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }
  if (!input.vertical || !VALID_VERTICALS.includes(input.vertical)) {
    errors.push(`vertical must be one of: ${VALID_VERTICALS.join(', ')}`);
  }
  if (typeof input.price_paise !== 'number' || !Number.isInteger(input.price_paise)) {
    errors.push('price_paise must be an integer');
  } else if (input.price_paise < MIN_PRICE_PAISE) {
    errors.push(`price must be at least ₹${MIN_PRICE_PAISE / 100}`);
  } else if (input.price_paise > MAX_PRICE_PAISE) {
    errors.push(`price exceeds ₹${MAX_PRICE_PAISE / 100} — needs founder review`);
  }
  if (input.stock != null) {
    if (!Number.isInteger(input.stock) || input.stock < 0) {
      errors.push('stock must be a non-negative integer');
    }
  }
  if (input.photos != null) {
    if (!Array.isArray(input.photos)) {
      errors.push('photos must be an array');
    } else if (input.photos.length > MAX_PHOTOS) {
      errors.push(`at most ${MAX_PHOTOS} photos allowed`);
    } else {
      for (const p of input.photos) {
        if (typeof p !== 'string' || !p.trim()) {
          errors.push('each photo must be a non-empty string (URL or base64 data URI)');
          break;
        }
      }
    }
  }
  // Archetype-specific
  if (sellerArchetype === 'vyapari' || sellerArchetype === 'niryatak') {
    if (!input.hsn || typeof input.hsn !== 'string' || !/^\d{4,8}$/.test(input.hsn)) {
      errors.push(`HSN code required for ${sellerArchetype} (4-8 digit numeric)`);
    }
  }
  if (sellerArchetype === 'niryatak') {
    if (input.export_eligible !== true && input.export_eligible !== false) {
      errors.push('export_eligible flag required for niryatak');
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Validate a status transition. */
function canTransition(from, to) {
  if (!VALID_STATUSES.includes(from) || !VALID_STATUSES.includes(to)) return false;
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ════════════════════════════════════════════════════════════
// PRODUCT FACTORY
// ════════════════════════════════════════════════════════════

let _idSeq = 0;
function _defaultId() { _idSeq++; return 'prod_' + Date.now().toString(36) + '_' + _idSeq.toString(36); }

/**
 * Create a new product. Returns { ok, product } or { ok: false, errors }.
 * The product starts in 'draft' status. Seller must call submitForReview
 * to move it to pending_review.
 *
 * @param {object} input            — title, description, vertical, price_paise, stock, photos, hsn, export_eligible, craft
 * @param {object} seller           — { id, archetype, profile, ... }
 * @param {object} [opts]
 * @param {function} [opts.idGen]   — id generator (testability)
 * @param {function} [opts.now]     — ms timestamp (testability)
 */
function createProduct(input, seller, opts = {}) {
  if (!seller || !seller.id || !seller.archetype) {
    return { ok: false, errors: ['seller required (must have id + archetype)'] };
  }
  const validation = validateProductInput(input, seller.archetype);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const now = (opts.now || Date.now)();
  const id = (opts.idGen || _defaultId)();

  // HSN auto-suggest if not provided (for Karigar/Sansthan it's optional)
  let hsn = input.hsn || null;
  let hsn_info = null;
  if (input.craft) {
    const suggested = suggestHsn(input.craft);
    if (suggested) {
      hsn = hsn || suggested.hsn;
      hsn_info = suggested;
    }
  }
  if (hsn && !hsn_info) {
    // Try to find rate from registry by the provided HSN
    const match = Object.values(HSN_BY_CRAFT).find(v => v.hsn === hsn);
    if (match) hsn_info = match;
  }

  const product = Object.freeze({
    id,
    seller_id: seller.id,
    seller_archetype: seller.archetype,
    seller_of_record: seller.archetype !== 'karigar',  // MoR is the only no-SoR case
    title: input.title.trim(),
    description: (input.description || '').trim(),
    vertical: input.vertical,
    craft: input.craft || null,
    hsn,
    hsn_info: hsn_info ? Object.freeze(hsn_info) : null,
    price_paise: input.price_paise,
    stock: input.stock != null ? input.stock : null,
    photos: Object.freeze([...(input.photos || [])]),
    export_eligible: input.export_eligible === true,
    status: 'draft',
    created_at: now,
    updated_at: now,
    history: Object.freeze([
      Object.freeze({ at: now, from: null, to: 'draft', note: 'Product created' }),
    ]),
    // Voice-note flag — if the seller used voice transcription
    created_via: input.created_via || 'form',
  });

  return { ok: true, product };
}

/**
 * Apply a field-level edit to an existing product. Returns a NEW product
 * (immutable). Only allowed for draft and rejected statuses — active/sold_out
 * products can't be edited (the seller must archive and re-list).
 */
function editProduct(current, edits, seller, opts = {}) {
  if (!current) return { ok: false, errors: ['product not found'] };
  if (current.status !== 'draft' && current.status !== 'rejected') {
    return { ok: false, errors: [`cannot edit a product in status "${current.status}" — archive and re-list instead`] };
  }
  if (current.seller_id !== seller.id) {
    return { ok: false, errors: ['this product belongs to a different seller'] };
  }
  // Merge edits onto current input shape
  const merged = {
    title: edits.title != null ? edits.title : current.title,
    description: edits.description != null ? edits.description : current.description,
    vertical: edits.vertical != null ? edits.vertical : current.vertical,
    craft: edits.craft != null ? edits.craft : current.craft,
    hsn: edits.hsn != null ? edits.hsn : current.hsn,
    price_paise: edits.price_paise != null ? edits.price_paise : current.price_paise,
    stock: edits.stock != null ? edits.stock : current.stock,
    photos: edits.photos != null ? edits.photos : [...current.photos],
    export_eligible: edits.export_eligible != null ? edits.export_eligible : current.export_eligible,
    created_via: current.created_via,
  };
  const validation = validateProductInput(merged, seller.archetype);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  const now = (opts.now || Date.now)();
  // Preserve history; status stays unchanged (still draft or rejected)
  const updated = Object.freeze({
    ...current,
    title: merged.title.trim(),
    description: (merged.description || '').trim(),
    vertical: merged.vertical,
    craft: merged.craft,
    hsn: merged.hsn,
    price_paise: merged.price_paise,
    stock: merged.stock,
    photos: Object.freeze([...merged.photos]),
    export_eligible: merged.export_eligible === true,
    updated_at: now,
    history: Object.freeze([
      ...current.history,
      Object.freeze({ at: now, from: current.status, to: current.status, note: 'Edited' }),
    ]),
  });
  return { ok: true, product: updated };
}

/**
 * Transition a product to a new status. Enforces VALID_TRANSITIONS. Used by:
 *  - seller: draft → pending_review (submit), pending_review → draft (recall)
 *  - founder: pending_review → active (approve), pending_review → rejected
 *  - seller: active ↔ sold_out, active → archived
 */
function transitionProduct(current, newStatus, opts = {}) {
  if (!current) return { ok: false, errors: ['product not found'] };
  if (!canTransition(current.status, newStatus)) {
    return {
      ok: false,
      errors: [`Invalid transition: ${current.status} → ${newStatus}. Allowed from ${current.status}: ${(VALID_TRANSITIONS[current.status] || []).join(', ') || '(terminal)'}`],
    };
  }
  const now = (opts.now || Date.now)();
  const updated = Object.freeze({
    ...current,
    status: newStatus,
    updated_at: now,
    history: Object.freeze([
      ...current.history,
      Object.freeze({ at: now, from: current.status, to: newStatus, note: opts.note || '' }),
    ]),
  });
  return { ok: true, product: updated };
}

/**
 * Filter products for the public catalog. Only `active` products with
 * stock > 0 (if stock is tracked) should be browsable by buyers.
 */
function publicCatalog(allProducts, opts = {}) {
  const list = [...allProducts.values()];
  return list.filter(p => {
    if (p.status !== 'active') return false;
    if (p.stock !== null && p.stock <= 0) return false;
    if (opts.vertical && p.vertical !== opts.vertical) return false;
    if (opts.exportOnly && !p.export_eligible) return false;
    return true;
  });
}

/** Sum the catalog GMV potential (sum of price × stock). For founder ops. */
function catalogValuePaise(allProducts) {
  let sum = 0;
  for (const p of allProducts.values()) {
    if (p.status === 'active' && p.stock != null) sum += p.price_paise * p.stock;
    else if (p.status === 'active') sum += p.price_paise;
  }
  return sum;
}

module.exports = {
  VALID_STATUSES,
  VALID_TRANSITIONS,
  VALID_VERTICALS,
  HSN_BY_CRAFT,
  MIN_PRICE_PAISE,
  MAX_PRICE_PAISE,
  MAX_PHOTOS,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  suggestHsn,
  validateProductInput,
  canTransition,
  createProduct,
  editProduct,
  transitionProduct,
  publicCatalog,
  catalogValuePaise,
};
