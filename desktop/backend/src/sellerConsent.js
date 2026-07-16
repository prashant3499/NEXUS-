'use strict';

/**
 * sellerConsent.js
 *
 * The legal foundation for selling. A sourced lead is only a PROSPECT — the
 * platform cannot list or sell anyone's products until that seller has
 * explicitly consented and authorized it. This is doubly true for the
 * Merchant-of-Record model, where the platform sells AS the merchant on the
 * artisan's behalf: that requires their written authorization, not just a
 * sign-up.
 *
 * This module captures, records, and enforces the consents required before a
 * product can go live, and supports withdrawal (a DPDP / data-principal right)
 * — withdrawing selling authorization takes the seller's listings down.
 *
 * Consents captured at onboarding:
 *   - terms                   accepted the Terms of Service (versioned)
 *   - selling_authorization   authorizes the platform to sell their products
 *                             (MoR: platform is merchant of record; SaaS: tooling)
 *   - content_license         license to display their listings/images/text
 *   - data_processing         DPDP consent to process personal/business data
 *   - payout_authorization    authorizes split-settlement to their bank
 *
 * REQUIRED_TO_SELL is the subset that MUST be granted before any product of
 * theirs can be active. Without it, listings stay blocked — by design.
 */

const CONSENT_TYPES = Object.freeze({
  TERMS: 'terms',
  SELLING_AUTHORIZATION: 'selling_authorization',
  CONTENT_LICENSE: 'content_license',
  DATA_PROCESSING: 'data_processing',
  PAYOUT_AUTHORIZATION: 'payout_authorization',
});

// Human-readable purpose for each consent (shown at the point of capture).
const CONSENT_PURPOSE = Object.freeze({
  terms: 'You accept the platform Terms of Service.',
  selling_authorization: 'You authorize the platform to list and sell your products. For Merchant-of-Record sellers, the platform sells as the merchant on your behalf and files the applicable tax.',
  content_license: 'You grant the platform a non-exclusive license to display your product listings, images, and descriptions to buyers.',
  data_processing: 'You consent to processing of your personal and business data for running your account, payments, and compliance (DPDP Act, 2023).',
  payout_authorization: 'You authorize settlement of your sales proceeds directly to your registered bank account.',
});

// The consents WITHOUT which the platform may not sell a seller's products.
const REQUIRED_TO_SELL = Object.freeze([
  CONSENT_TYPES.TERMS,
  CONSENT_TYPES.SELLING_AUTHORIZATION,
  CONSENT_TYPES.CONTENT_LICENSE,
  CONSENT_TYPES.DATA_PROCESSING,
  CONSENT_TYPES.PAYOUT_AUTHORIZATION,
]);

const TERMS_VERSION = '2026-06-01';   // bump when terms change → re-consent

/** A fresh, empty consent record for a new seller. */
function emptyConsent() {
  const consents = {};
  for (const t of Object.values(CONSENT_TYPES)) {
    consents[t] = { granted: false, at: null, version: null, method: null, withdrawn_at: null };
  }
  return { consents, terms_version: TERMS_VERSION };
}

/**
 * Grant a consent. `meta` records HOW it was captured (e.g. 'signup_checkbox',
 * 'signed_authorization', 'ivr_otp') — important for auditability.
 */
function grantConsent(record, type, meta = {}) {
  if (!Object.values(CONSENT_TYPES).includes(type)) throw new Error('unknown consent type: ' + type);
  const rec = record && record.consents ? record : emptyConsent();
  rec.consents[type] = {
    granted: true,
    at: meta.at || Date.now(),
    version: type === CONSENT_TYPES.TERMS ? (meta.version || TERMS_VERSION) : (meta.version || null),
    method: meta.method || 'explicit',
    withdrawn_at: null,
  };
  return rec;
}

/** Grant several consents at once (the onboarding handshake). */
function grantMany(record, types, meta = {}) {
  let rec = record && record.consents ? record : emptyConsent();
  for (const t of types) rec = grantConsent(rec, t, meta);
  return rec;
}

/**
 * Withdraw a consent (a data-principal right). Withdrawing any REQUIRED_TO_SELL
 * consent means the platform must stop selling that seller's products.
 */
function withdrawConsent(record, type, meta = {}) {
  const rec = record && record.consents ? record : emptyConsent();
  if (rec.consents[type]) {
    rec.consents[type].granted = false;
    rec.consents[type].withdrawn_at = meta.at || Date.now();
  }
  return rec;
}

/**
 * canSell — may the platform list/sell this seller's products?
 * @returns { ok, missing[] } — ok only when every REQUIRED_TO_SELL consent is granted.
 */
function canSell(record) {
  if (!record || !record.consents) return { ok: false, missing: [...REQUIRED_TO_SELL] };
  const missing = REQUIRED_TO_SELL.filter((t) => !(record.consents[t] && record.consents[t].granted));
  // Stale terms version → must re-accept
  const termsOk = record.consents[CONSENT_TYPES.TERMS] && record.consents[CONSENT_TYPES.TERMS].granted
    && record.consents[CONSENT_TYPES.TERMS].version === TERMS_VERSION;
  if (!termsOk && !missing.includes(CONSENT_TYPES.TERMS)) missing.push(CONSENT_TYPES.TERMS + '_outdated');
  return { ok: missing.length === 0, missing };
}

/** Full status view for the seller's account screen / audits. */
function consentStatus(record) {
  const rec = record && record.consents ? record : emptyConsent();
  const sell = canSell(rec);
  return {
    can_sell: sell.ok,
    missing: sell.missing,
    terms_version: rec.terms_version || TERMS_VERSION,
    current_terms_version: TERMS_VERSION,
    consents: Object.fromEntries(Object.entries(rec.consents).map(([k, v]) => [k, {
      granted: v.granted, at: v.at, withdrawn_at: v.withdrawn_at, purpose: CONSENT_PURPOSE[k],
    }])),
  };
}

module.exports = {
  CONSENT_TYPES,
  CONSENT_PURPOSE,
  REQUIRED_TO_SELL,
  TERMS_VERSION,
  emptyConsent,
  grantConsent,
  grantMany,
  withdrawConsent,
  canSell,
  consentStatus,
};
