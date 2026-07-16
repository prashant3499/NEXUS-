'use strict';
/**
 * complianceEngine — a single facade over NEXUS's compliance logic, which is implemented
 * (and tested) across several modules. The architecture diagram calls for one "compliance
 * engine"; this gives an engineer one place to reach it, while the real work stays in the
 * proven modules. No behavior change — pure delegation.
 */
const contentPolicy = require('./contentPolicy');
const sellerConsent = require('./sellerConsent');
const dataRights = require('./dataRights');

/** Can this listing be published? (prohibited-item screening + HITL hold) */
function screenListing(listing) { return contentPolicy.screenListing(listing); }

/** Notice-and-takedown (intermediary safe harbor). */
function fileNotice(input) { return contentPolicy.fileNotice(input); }
function actOnNotice(notice, action, by) { return contentPolicy.actOnNotice(notice, action, by); }

/** DPDP data-principal rights. */
function dataRequest(type, subjectId, records, patch) { return dataRights.processRequest(type, subjectId, records, patch); }

/** Consent status for a seller (canSell gate lives in sellerConsent). */
function consentTypes() { return sellerConsent.CONSENT_TYPES; }

/** One-call posture summary for diligence / the cockpit. */
function posture() {
  return {
    prohibited_categories: contentPolicy.prohibitedCatalog().length,
    takedown_windows: { acknowledge_hours: contentPolicy.ACK_WINDOW_HOURS, resolve_days: contentPolicy.RESOLVE_WINDOW_DAYS },
    dpdp_rights: dataRights.REQUEST_TYPES,
    consent_required_to_sell: sellerConsent.REQUIRED_TO_SELL,
    invariants: ['never_in_loss', 'consent_before_sale', 'child_safety', 'no_fabrication', 'honest_stage'],
    note: 'Facade over contentPolicy, sellerConsent, dataRights, productionGuard — enforced at boundaries.',
  };
}

module.exports = { screenListing, fileNotice, actOnNotice, dataRequest, consentTypes, posture };
