/**
 * NEXUS — Gem & Jewellery Export Compliance.
 *
 * Pre-flight checks that BLOCK an export listing or sale if the
 * product can't lawfully cross a border. Four checks:
 *
 *   1) CITES — Convention on International Trade in Endangered Species.
 *      Materials from listed species (ivory, certain corals, certain
 *      tortoise shell, rosewood, sandalwood, etc.) require a CITES
 *      permit. If the product contains a listed material and lacks
 *      a permit, the listing is BLOCKED.
 *
 *   2) Kimberley Process Certification Scheme (KPCS) — rough diamonds
 *      crossing borders need a Kimberley certificate to prove they
 *      aren't conflict diamonds. India is a participant. Without a
 *      valid certificate on a rough-diamond export, BLOCKED.
 *
 *   3) BIS hallmark validation — Indian gold/silver jewellery is now
 *      mandatorily hallmarked. We validate the format of the hallmark
 *      6-digit HUID (Hallmark Unique ID) and the four-component
 *      structure (BIS logo + caratage + jeweller code + AHC code).
 *
 *   4) Gem certificate validation — for diamonds, coloured stones, and
 *      pearls. Major labs: GIA, IGI, SGL, GJEPC. We validate the format
 *      of the report number against each lab's known scheme.
 *
 * The module returns a structured decision: { allowed, blockers,
 * warnings, certificates_validated }. Compliance agent escalates when
 * blockers exist; founder insights surfaces unresolved blockers.
 *
 * What this module does NOT do:
 *   - Call CITES/KPCS authority APIs (they don't expose public APIs)
 *   - Confirm a certificate is real by querying the issuing lab
 *     (most labs offer verification pages but no API; we validate
 *     format and store the number+hash for later manual audit)
 *   - File any government documents
 *
 * Pure logic. Code-only. No external dependencies.
 */

'use strict';

// ════════════════════════════════════════════════════════════
// CITES — listed materials we recognise. v1 list; production
// would sync against the CITES Appendices via a periodic job.
// ════════════════════════════════════════════════════════════

const CITES_LISTED_MATERIALS = {
  // Appendix I — strictest, commercial trade generally prohibited
  'ivory':           { appendix: 'I',  species: 'Elephas maximus / Loxodonta africana', note: 'Elephant ivory — generally prohibited' },
  'rhino_horn':      { appendix: 'I',  species: 'Rhinocerotidae spp.',                  note: 'Rhino horn — prohibited' },
  'tiger_parts':     { appendix: 'I',  species: 'Panthera tigris',                      note: 'Tiger bone, claw, skin — prohibited' },
  'sea_turtle':      { appendix: 'I',  species: 'Cheloniidae spp.',                     note: 'Tortoise-shell — prohibited' },
  // Appendix II — controlled, requires permit
  'red_coral':       { appendix: 'II', species: 'Corallium rubrum',                     note: 'Red coral — CITES permit required' },
  'pink_coral':      { appendix: 'II', species: 'Corallium spp.',                       note: 'Pink/precious coral — CITES permit required' },
  'rosewood':        { appendix: 'II', species: 'Dalbergia spp.',                       note: 'All rosewood species — CITES permit required (2017)' },
  'red_sanders':     { appendix: 'II', species: 'Pterocarpus santalinus',               note: 'Red sandalwood — CITES permit + India export ban' },
  'agarwood':        { appendix: 'II', species: 'Aquilaria spp.',                       note: 'Oud — CITES permit required' },
  'crocodile_skin':  { appendix: 'II', species: 'Crocodylia spp.',                      note: 'Crocodile/alligator skin — CITES permit required' },
  'python_skin':     { appendix: 'II', species: 'Pythonidae spp.',                      note: 'Python skin — CITES permit required' },
  'queen_conch':     { appendix: 'II', species: 'Strombus gigas',                       note: 'Queen conch shell — CITES permit required' },
};

// Material aliases — common synonyms an artisan/seller might type
const MATERIAL_ALIASES = {
  'elephant ivory':   'ivory',
  'rhino':            'rhino_horn',
  'tortoise shell':   'sea_turtle',
  'tortoiseshell':    'sea_turtle',
  'lal chandan':      'red_sanders',
  'raktachandan':     'red_sanders',
  'sheesham':         null,                  // common rosewood substitute — NOT CITES; pass through
  'oud':              'agarwood',
  'oudh':             'agarwood',
  'precious coral':   'red_coral',
  'munga':            'red_coral',
  'praval':           'red_coral',
  'shankha':          null,                  // sacred conch — Turbinella pyrum, NOT CITES
};

/**
 * Normalise a free-text material name to a CITES-listed material key,
 * or null if not listed.
 */
function normalizeMaterial(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const k = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  // Direct key match
  if (CITES_LISTED_MATERIALS[k.replace(/\s+/g, '_')]) return k.replace(/\s+/g, '_');
  // Alias match
  if (MATERIAL_ALIASES.hasOwnProperty(k)) return MATERIAL_ALIASES[k];
  // Partial match against keys
  for (const key of Object.keys(CITES_LISTED_MATERIALS)) {
    if (k.includes(key.replace(/_/g, ' '))) return key;
  }
  return null;
}

/**
 * Check whether a product's declared materials trigger any CITES rules.
 * @param {object} product - { materials: ['red coral', 'gold', ...], cites_permit?: 'CITES-IN-XXXX' }
 * @returns {object} { passes, listed_materials, requires_permit, has_permit, blockers, warnings }
 */
function checkCITES(product = {}) {
  const materials = Array.isArray(product.materials) ? product.materials : [];
  const listed = [];
  const blockers = [];
  const warnings = [];

  for (const m of materials) {
    const key = normalizeMaterial(m);
    if (key && CITES_LISTED_MATERIALS[key]) {
      const info = CITES_LISTED_MATERIALS[key];
      listed.push({ raw: m, key, ...info });
      if (info.appendix === 'I') {
        blockers.push({
          rule: 'CITES_APPENDIX_I',
          material: m,
          reason: `${info.note}. Appendix I trade is generally prohibited; this listing cannot be exported.`,
        });
      } else if (info.appendix === 'II') {
        // Appendix II — needs permit
        if (!product.cites_permit || typeof product.cites_permit !== 'string' || product.cites_permit.trim() === '') {
          blockers.push({
            rule: 'CITES_PERMIT_MISSING',
            material: m,
            reason: `${info.note}. A valid CITES export permit number must be provided.`,
          });
        } else {
          // Format check for Indian CITES permits (general pattern, not authoritative)
          if (!/^CITES-[A-Z]{2}-\d{4,}/i.test(product.cites_permit.trim())) {
            warnings.push({
              rule: 'CITES_PERMIT_FORMAT',
              permit: product.cites_permit,
              reason: 'Permit number format unrecognised. Expected pattern: CITES-CC-XXXX (CC = ISO country code).',
            });
          }
        }
      }
    }
  }

  return {
    passes: blockers.length === 0,
    listed_materials: listed,
    requires_permit: listed.some(l => l.appendix === 'II'),
    has_permit: Boolean(product.cites_permit),
    blockers,
    warnings,
  };
}

// ════════════════════════════════════════════════════════════
// KIMBERLEY PROCESS — for rough diamond exports/imports.
// India is a KPCS participant. Indian KP certificates are issued
// by the Designated Office (Mumbai), format: KP-IN-YYYYMMDD-NNNNN
// (or older variants). We validate format and presence.
// ════════════════════════════════════════════════════════════

const KIMBERLEY_REQUIRED_HS_CODES = [
  '7102.10', // Unsorted diamonds
  '7102.21', // Industrial rough diamonds — unworked or simply sawn
  '7102.31', // Non-industrial rough diamonds — unworked or simply sawn
];

const KP_PERMIT_REGEX = /^KP-IN-\d{8}-\d{4,}$|^IN\d{10,}$/i;

/**
 * @param {object} product - { hs_code, is_rough_diamond, kimberley_cert? }
 */
function checkKimberley(product = {}) {
  const hs = (product.hs_code || '').slice(0, 7);  // first 7 chars (7102.21)
  const isRough = product.is_rough_diamond === true
                  || KIMBERLEY_REQUIRED_HS_CODES.some(code => hs.startsWith(code));

  const blockers = [];
  const warnings = [];

  if (!isRough) {
    return { passes: true, applies: false, blockers, warnings };
  }

  if (!product.kimberley_cert || typeof product.kimberley_cert !== 'string' || product.kimberley_cert.trim() === '') {
    blockers.push({
      rule: 'KIMBERLEY_CERT_MISSING',
      reason: 'Rough diamond export requires a Kimberley Process Certificate. Apply at GJEPC Designated Office, Mumbai before listing.',
    });
  } else if (!KP_PERMIT_REGEX.test(product.kimberley_cert.trim())) {
    warnings.push({
      rule: 'KIMBERLEY_CERT_FORMAT',
      cert: product.kimberley_cert,
      reason: 'KP certificate format unrecognised. Expected: KP-IN-YYYYMMDD-NNNN or INXXXXXXXXXX.',
    });
  }

  return {
    passes: blockers.length === 0,
    applies: true,
    blockers,
    warnings,
  };
}

// ════════════════════════════════════════════════════════════
// BIS HALLMARK validation — mandatory for gold/silver jewellery
// in India since 2021. Format: 4 marks on the piece + a 6-digit
// HUID (Hallmark Unique Identification) since July 2021.
// ════════════════════════════════════════════════════════════

const BIS_VALID_CARATAGE = ['14K', '18K', '20K', '22K', '23K', '24K'];
const BIS_SILVER_FINENESS = ['800', '835', '900', '925', '970', '990'];

// HUID is exactly 6 alphanumeric characters (A-Z and 0-9), assigned
// by BIS at the Assaying & Hallmarking Centre.
const BIS_HUID_REGEX = /^[A-Z0-9]{6}$/;

/**
 * Validate a BIS hallmark declaration.
 * @param {object} input - { metal: 'gold'|'silver', caratage_or_fineness, huid, jeweller_code?, ahc_code? }
 */
function validateBISHallmark(input = {}) {
  const errors = [];
  const warnings = [];

  const metal = (input.metal || '').toLowerCase();
  if (!['gold', 'silver'].includes(metal)) {
    errors.push({ field: 'metal', reason: 'metal must be "gold" or "silver"' });
  }

  // Caratage / fineness check
  const cf = (input.caratage_or_fineness || '').toString().toUpperCase().trim();
  if (metal === 'gold' && !BIS_VALID_CARATAGE.includes(cf)) {
    errors.push({ field: 'caratage', value: cf, reason: `gold caratage must be one of ${BIS_VALID_CARATAGE.join(', ')}` });
  }
  if (metal === 'silver' && !BIS_SILVER_FINENESS.includes(cf)) {
    errors.push({ field: 'fineness', value: cf, reason: `silver fineness must be one of ${BIS_SILVER_FINENESS.join(', ')}` });
  }

  // HUID format
  if (!input.huid || typeof input.huid !== 'string') {
    errors.push({ field: 'huid', reason: 'HUID is required (6 alphanumeric characters assigned by BIS AHC)' });
  } else if (!BIS_HUID_REGEX.test(input.huid.trim().toUpperCase())) {
    errors.push({ field: 'huid', value: input.huid, reason: 'HUID must be exactly 6 alphanumeric characters (A-Z, 0-9)' });
  }

  // Jeweller code + AHC code — optional but warn if missing
  if (!input.jeweller_code) {
    warnings.push({ field: 'jeweller_code', reason: 'Jeweller registration code recommended for full traceability' });
  }
  if (!input.ahc_code) {
    warnings.push({ field: 'ahc_code', reason: 'Assaying & Hallmarking Centre code recommended' });
  }

  return {
    valid: errors.length === 0,
    metal, caratage_or_fineness: cf, huid: (input.huid || '').toUpperCase(),
    errors, warnings,
  };
}

// ════════════════════════════════════════════════════════════
// GEM CERTIFICATE validation — major labs (GIA, IGI, SGL, GJEPC,
// HRD, GSI). We validate the format of the report number against
// each lab's known scheme. Format-only; the lab's own verification
// page is the canonical authority.
// ════════════════════════════════════════════════════════════

const GEM_LAB_PATTERNS = {
  // GIA: 10-digit numeric (newer reports) or 1XXXXXXXXX format
  'GIA':   { regex: /^\d{10}$/,            example: '2185000123', verify_url: 'https://www.gia.edu/report-check' },
  // IGI: alphanumeric, varies — most common 10-digit numeric or LG-XXXXXXX (lab grown)
  'IGI':   { regex: /^(\d{10}|LG[A-Z]?\d{7,})$/i, example: '485139212', verify_url: 'https://www.igi.org/verify-your-report' },
  // SGL (Solitaire Gemmological Labs)
  'SGL':   { regex: /^[A-Z]{1,3}\d{6,8}$/i,    example: 'SGL12345678', verify_url: 'https://sgl.in/verify' },
  // GJEPC (Gem & Jewellery Export Promotion Council)
  'GJEPC': { regex: /^GJEPC-\d{4,}$/i,         example: 'GJEPC-12345', verify_url: 'https://gjepc.org' },
  // HRD Antwerp
  'HRD':   { regex: /^\d{8,10}$/,              example: '12345678', verify_url: 'https://www.hrdantwerp.com' },
  // GSI (Gemological Science International)
  'GSI':   { regex: /^[A-Z]{2,3}\d{7,9}$/i,    example: 'GSI1234567', verify_url: 'https://www.gsigemlab.com' },
};

/**
 * Validate a gem certificate's report number against the issuing lab's
 * known format. Returns { valid, lab, report_number, verify_url, errors }.
 */
function validateGemCertificate(input = {}) {
  const lab = (input.lab || '').toUpperCase().trim();
  const number = (input.report_number || '').trim();
  const errors = [];

  if (!lab) {
    errors.push({ field: 'lab', reason: 'lab is required' });
  } else if (!GEM_LAB_PATTERNS[lab]) {
    errors.push({ field: 'lab', value: lab, reason: `Unknown lab. Known: ${Object.keys(GEM_LAB_PATTERNS).join(', ')}` });
  }

  if (!number) {
    errors.push({ field: 'report_number', reason: 'report_number is required' });
  } else if (lab && GEM_LAB_PATTERNS[lab]) {
    if (!GEM_LAB_PATTERNS[lab].regex.test(number)) {
      errors.push({
        field: 'report_number',
        value: number,
        reason: `Report number format invalid for ${lab}. Example: ${GEM_LAB_PATTERNS[lab].example}`,
      });
    }
  }

  const result = {
    valid: errors.length === 0,
    lab, report_number: number,
    errors,
  };
  if (result.valid) {
    result.verify_url = GEM_LAB_PATTERNS[lab].verify_url;
    // Hash for later audit — production stores SHA-256 to detect tampering
    result.audit_hash = simpleHash(lab + '|' + number);
  }
  return result;
}

// Simple non-crypto hash for audit ref. Production uses crypto.createHash.
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return 'h' + Math.abs(h).toString(36);
}

// ════════════════════════════════════════════════════════════
// COMBINED PRE-FLIGHT — what the platform calls before allowing an
// export listing to go live. Returns a single decision.
// ════════════════════════════════════════════════════════════

/**
 * Pre-flight a gem/jewellery product for export readiness.
 * @param {object} product - the full product with optional
 *   { materials, hs_code, is_rough_diamond, cites_permit,
 *     kimberley_cert, bis_hallmark, gem_certificate }
 * @returns {object} { allowed, blockers, warnings, checks }
 */
function preflightExport(product = {}) {
  const blockers = [];
  const warnings = [];
  const checks = {};

  // CITES
  checks.cites = checkCITES(product);
  blockers.push(...checks.cites.blockers);
  warnings.push(...checks.cites.warnings);

  // Kimberley
  checks.kimberley = checkKimberley(product);
  blockers.push(...checks.kimberley.blockers);
  warnings.push(...checks.kimberley.warnings);

  // BIS hallmark (only if claimed)
  if (product.bis_hallmark) {
    checks.bis = validateBISHallmark(product.bis_hallmark);
    if (!checks.bis.valid) {
      // BIS errors are warnings on EXPORT (importing country accepts foreign hallmarks);
      // BIS errors are blockers on DOMESTIC sale (separate path).
      warnings.push(...checks.bis.errors.map(e => ({ rule: 'BIS_HALLMARK_INVALID', field: e.field, reason: e.reason })));
    }
  }

  // Gem certificate (only if claimed)
  if (product.gem_certificate) {
    checks.gem_cert = validateGemCertificate(product.gem_certificate);
    if (!checks.gem_cert.valid) {
      warnings.push(...checks.gem_cert.errors.map(e => ({ rule: 'GEM_CERT_INVALID', field: e.field, reason: e.reason })));
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    checks,
  };
}

module.exports = {
  CITES_LISTED_MATERIALS,
  KIMBERLEY_REQUIRED_HS_CODES,
  BIS_VALID_CARATAGE,
  BIS_SILVER_FINENESS,
  GEM_LAB_PATTERNS,
  normalizeMaterial,
  checkCITES,
  checkKimberley,
  validateBISHallmark,
  validateGemCertificate,
  preflightExport,
};
