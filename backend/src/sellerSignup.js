'use strict';

/**
 * sellerSignup.js
 *
 * Self-serve seller onboarding. Replaces the founder-only manual flow.
 * A new artisan/exporter visits the site, fills a 4-step wizard, and
 * lands in their own seller portal with a real persisted record.
 *
 * The five archetypes map to different KYC requirements:
 *   - Karigar   (MoR)      → phone + Aadhaar (no GST, no IEC needed)
 *   - Vyapari   (SaaS)     → phone + Aadhaar + PAN + GSTIN
 *   - Niryatak  (SaaS+EXIM)→ phone + PAN + GSTIN + IEC + AD code
 *   - Sansthan  (umbrella) → phone + cooperative registration certificate
 *   - Pravasi   (agent)    → phone + Aadhaar + tour operator license
 *
 * This module is pure (no I/O). The caller owns persistence + OTP delivery.
 * In dev mode, OTPs are stored in-memory; in production, the caller wires
 * a real SMS provider via the optional `smsProvider` injected on the
 * SignupService constructor.
 */

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const ARCHETYPES = Object.freeze({
  karigar:  { id: 'karigar',  legal: 'mor',      label: 'Karigar (artisan, no GST)',          tier: 'karigar',  price: 499 },
  vyapari:  { id: 'vyapari',  legal: 'saas',     label: 'Vyapari (small registered seller)',  tier: 'vyapari',  price: 2499 },
  niryatak: { id: 'niryatak', legal: 'saas',     label: 'Niryatak (registered exporter)',     tier: 'niryatak', price: 7999 },
  sansthan: { id: 'sansthan', legal: 'umbrella', label: 'Sansthan (cooperative umbrella)',    tier: 'sansthan', price: null },
  pravasi:  { id: 'pravasi',  legal: 'agent',    label: 'Pravasi (tourism operator)',          tier: 'pravasi',  price: 1999 },
});

/** Document requirements per archetype. The wizard surfaces these and
 *  enforces presence (not validity — validity is done by docVerification). */
const KYC_REQUIREMENTS = Object.freeze({
  karigar:  ['aadhaar'],
  vyapari:  ['aadhaar', 'pan', 'gstin'],
  niryatak: ['aadhaar', 'pan', 'gstin', 'iec', 'ad_code'],
  sansthan: ['cooperative_registration_cert'],
  pravasi:  ['aadhaar', 'tour_operator_license'],
});

// Indian phone numbers: 10 digits starting with 6/7/8/9, optional +91 prefix
const PHONE_RX = /^(\+91|91)?[6-9]\d{9}$/;

const OTP_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const OTP_MAX_ATTEMPTS = 3;          // per OTP
const OTP_RATE_LIMIT_MS = 30 * 1000; // 30s between OTP requests per phone

// ════════════════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════════════════

function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/\s|-/g, '');
  if (!PHONE_RX.test(cleaned)) return null;
  // Strip +91 / 91 prefix, return canonical 10-digit
  return cleaned.replace(/^(\+91|91)/, '');
}

function validateArchetype(archetype) {
  if (!archetype || typeof archetype !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, archetype);
}

/** Check that all KYC documents required for the archetype are present
 *  in `docs` and have a non-empty value. Returns { ok, missing }. */
function validateKycPresence(archetype, docs) {
  if (!validateArchetype(archetype)) return { ok: false, missing: [], error: 'invalid archetype' };
  const required = KYC_REQUIREMENTS[archetype];
  const missing = required.filter(k => !docs || !docs[k] || String(docs[k]).trim() === '');
  return { ok: missing.length === 0, missing };
}

/** Validate the profile fields collected in step 3 of the wizard. */
function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return { ok: false, error: 'profile required' };
  const errors = [];
  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length < 2) {
    errors.push('name must be at least 2 chars');
  }
  if (!profile.language || typeof profile.language !== 'string') {
    errors.push('language required');
  }
  if (!profile.state || typeof profile.state !== 'string' || profile.state.trim().length < 2) {
    errors.push('state required');
  }
  // Optional: pin_code (6 digits)
  if (profile.pin_code != null && !/^\d{6}$/.test(String(profile.pin_code))) {
    errors.push('pin_code must be 6 digits if provided');
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ════════════════════════════════════════════════════════════
// SIGNUP SERVICE
// ════════════════════════════════════════════════════════════

class SignupService {
  /**
   * @param {object} opts
   * @param {function} [opts.now] — returns ms; injected for testability
   * @param {object} [opts.smsProvider] — has .send(phone, message); defaults to no-op
   * @param {function} [opts.idGen] — returns a unique seller id; defaults to internal
   * @param {object} [opts.docVerifier] — has .aadhaar/.pan/.gstin; if present, used
   *   to verify docs at completion (otherwise marked unverified)
   */
  constructor(opts = {}) {
    this.now = opts.now || (() => Date.now());
    this.smsProvider = opts.smsProvider || null;
    this.idGen = opts.idGen || (() => 'seller_' + Math.random().toString(36).slice(2, 12));
    this.docVerifier = opts.docVerifier || null;

    // In-memory state. The owning server may snapshot/restore these.
    this._otps = new Map();          // phone → { otp, expiresAt, attempts }
    this._lastSent = new Map();      // phone → at (for rate limiting)
    this._sellers = new Map();       // sellerId → seller record
    this._phoneToSeller = new Map(); // phone → sellerId
  }

  // ──────────────────────────────────────────────────────────
  // STEP 1 — Phone OTP
  // ──────────────────────────────────────────────────────────

  /** Request an OTP for the given phone number. Returns:
   *    { ok: true, expires_in_seconds }    on success
   *    { ok: false, error }                on rejection
   *  The OTP itself is dispatched via the smsProvider; in dev mode it is
   *  echoed in the response under `dev_otp` so the wizard can pre-fill. */
  requestOtp(rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) return { ok: false, error: 'Invalid phone number — must be 10 digits starting with 6/7/8/9' };
    // Rate-limit
    const lastSent = this._lastSent.get(phone);
    if (lastSent && this.now() - lastSent < OTP_RATE_LIMIT_MS) {
      const wait_s = Math.ceil((OTP_RATE_LIMIT_MS - (this.now() - lastSent)) / 1000);
      return { ok: false, error: `Wait ${wait_s}s before requesting another OTP`, retry_after_s: wait_s };
    }
    // Generate 6-digit OTP. Math.random is fine for non-cryptographic test scope;
    // real deployment must use crypto.randomInt(100000, 999999).
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = this.now() + OTP_TTL_MS;
    this._otps.set(phone, { otp, expiresAt, attempts: 0 });
    this._lastSent.set(phone, this.now());
    // Dispatch (no-op if no provider)
    if (this.smsProvider) {
      try {
        this.smsProvider.send(phone, `NEXUS: ${otp} is your verification code. Valid for 5 minutes.`);
      } catch (_) { /* swallow — the OTP is still stored */ }
    }
    const response = { ok: true, expires_in_seconds: Math.floor(OTP_TTL_MS / 1000) };
    if (!this.smsProvider) response.dev_otp = otp;  // for development only
    return response;
  }

  /** Verify the OTP. On success, marks the phone verified and returns
   *  { ok, phone, verification_token } — the token is required for the
   *  rest of the wizard so steps cannot be replayed cross-phone. */
  verifyOtp(rawPhone, submitted) {
    const phone = normalizePhone(rawPhone);
    if (!phone) return { ok: false, error: 'Invalid phone' };
    const record = this._otps.get(phone);
    if (!record) return { ok: false, error: 'No OTP outstanding — request one first' };
    if (this.now() > record.expiresAt) {
      this._otps.delete(phone);
      return { ok: false, error: 'OTP expired — request a new one' };
    }
    record.attempts++;
    if (record.attempts > OTP_MAX_ATTEMPTS) {
      this._otps.delete(phone);
      return { ok: false, error: 'Too many attempts — request a new OTP' };
    }
    if (String(submitted).trim() !== record.otp) {
      const remaining = OTP_MAX_ATTEMPTS - record.attempts;
      return { ok: false, error: `Wrong OTP. ${remaining} attempts remaining.` };
    }
    // Success: consume the OTP, issue a verification token
    this._otps.delete(phone);
    const token = 'vtok_' + Math.random().toString(36).slice(2, 14);
    this._verifiedPhones = this._verifiedPhones || new Map();
    this._verifiedPhones.set(token, { phone, at: this.now() });
    return { ok: true, phone, verification_token: token };
  }

  // ──────────────────────────────────────────────────────────
  // STEP 4 — Complete signup
  // ──────────────────────────────────────────────────────────

  /** Final signup call. Inputs:
   *    verification_token  — from verifyOtp
   *    archetype           — karigar|vyapari|niryatak|sansthan|pravasi
   *    profile             — { name, language, state, pin_code?, locality? }
   *    docs                — { aadhaar?, pan?, gstin?, iec?, ad_code?, ... }
   *  Returns { ok, seller } or { ok: false, error, ...details }. */
  completeSignup(input) {
    const { verification_token, archetype, profile, docs } = input || {};
    // 1. Resolve verified phone from token
    if (!verification_token || !this._verifiedPhones || !this._verifiedPhones.has(verification_token)) {
      return { ok: false, error: 'Invalid or expired verification token — re-verify phone' };
    }
    const { phone } = this._verifiedPhones.get(verification_token);

    // 2. Don't allow signup if phone already maps to a seller
    if (this._phoneToSeller.has(phone)) {
      return {
        ok: false,
        error: 'A seller is already registered with this phone',
        existing_seller_id: this._phoneToSeller.get(phone),
      };
    }

    // 3. Validate archetype
    if (!validateArchetype(archetype)) {
      return { ok: false, error: `Invalid archetype "${archetype}". Must be one of: ${Object.keys(ARCHETYPES).join(', ')}` };
    }

    // 4. Validate profile
    const profCheck = validateProfile(profile);
    if (!profCheck.ok) return { ok: false, error: 'Invalid profile', details: profCheck.errors || profCheck.error };

    // 5. Validate KYC docs presence
    const kycCheck = validateKycPresence(archetype, docs || {});
    if (!kycCheck.ok) {
      return {
        ok: false,
        error: `Missing required documents for ${archetype}`,
        required: KYC_REQUIREMENTS[archetype],
        missing: kycCheck.missing,
      };
    }

    // 6. Optionally verify docs via injected docVerifier
    const docResults = {};
    if (this.docVerifier) {
      for (const key of KYC_REQUIREMENTS[archetype]) {
        const fn = this.docVerifier[key];
        if (typeof fn === 'function') {
          try {
            const r = fn(docs[key]);
            docResults[key] = r && r.ok ? 'verified' : 'rejected';
          } catch (_) { docResults[key] = 'error'; }
        } else {
          docResults[key] = 'unverified';
        }
      }
    } else {
      // No verifier — mark all unverified for later async verification
      for (const key of KYC_REQUIREMENTS[archetype]) {
        docResults[key] = 'unverified';
      }
    }

    // 7. Create the seller record. PII (Aadhaar/PAN/etc.) is stored as-is
    // here — in production you'd encrypt at rest and mask on read.
    const id = this.idGen();
    const seller = Object.freeze({
      id,
      phone,
      archetype,
      legal_model: ARCHETYPES[archetype].legal,
      tier: ARCHETYPES[archetype].tier,
      profile: Object.freeze({
        name: profile.name.trim(),
        language: profile.language,
        state: profile.state.trim(),
        pin_code: profile.pin_code || null,
        locality: profile.locality || null,
      }),
      docs: Object.freeze({ ...docs }),
      doc_verification: Object.freeze(docResults),
      kyc_complete: Object.values(docResults).every(v => v === 'verified'),
      created_at: this.now(),
      onboarding_method: 'self_serve',
      status: 'pending_review',  // founder reviews before active
    });

    // 8. Persist
    this._sellers.set(id, seller);
    this._phoneToSeller.set(phone, id);
    // Consume the verification token (one-use)
    this._verifiedPhones.delete(verification_token);

    return { ok: true, seller };
  }

  // ──────────────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────────────

  getSeller(id) { return this._sellers.get(id) || null; }
  listSellers() { return [...this._sellers.values()]; }
  getSellerByPhone(rawPhone) {
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;
    const id = this._phoneToSeller.get(phone);
    return id ? this._sellers.get(id) : null;
  }

  /** For tests + debugging — returns a deep snapshot of internal state. */
  _debugSnapshot() {
    return {
      sellers: [...this._sellers.values()],
      pending_otps: this._otps.size,
      verified_tokens_outstanding: this._verifiedPhones ? this._verifiedPhones.size : 0,
    };
  }
}

module.exports = {
  ARCHETYPES,
  KYC_REQUIREMENTS,
  PHONE_RX,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_MS,
  normalizePhone,
  validateArchetype,
  validateKycPresence,
  validateProfile,
  SignupService,
};
