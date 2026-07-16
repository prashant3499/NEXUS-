'use strict';
/**
 * statusSelector — names the "status-aware" decision the architecture calls for. NEXUS treats
 * a seller's legal status (unregistered artisan → GST-registered → exporter → institution) as
 * the variable that changes the compliance + money treatment. This is a thin, tested facade
 * over slicer/domain — no behavior change, just the clean seam the architecture diagram implies.
 */
const STATUSES = ['unregistered', 'gst_registered', 'exporter', 'institution'];

// What each status changes (documented, enforced downstream by slicer/compliance).
const PROFILE = {
  unregistered:   { mor_required: true,  tcs_applies: true,  gst_passthrough: false, export_ready: false, note: 'NEXUS is Merchant of Record; carries GST/TCS.' },
  gst_registered: { mor_required: false, tcs_applies: true,  gst_passthrough: true,  export_ready: false, note: 'Seller has GSTIN; MoR optional, TCS still applies on marketplace.' },
  exporter:       { mor_required: false, tcs_applies: true,  gst_passthrough: true,  export_ready: true,  note: 'IEC holder; export docs + ICD routing available.' },
  institution:    { mor_required: false, tcs_applies: false, gst_passthrough: true,  export_ready: true,  note: 'B2B/government entity; contract terms.' },
};

function normalize(status) { return STATUSES.indexOf(String(status || '').toLowerCase()) >= 0 ? String(status).toLowerCase() : 'unregistered'; }
function profile(status) { const s = normalize(status); return Object.assign({ status: s }, PROFILE[s]); }

/** The status-aware money treatment: delegates the actual math to the tested slicer. */
function treat(status, orderTotalRupees, opts) {
  const p = profile(status);
  const slices = require('./slicer').sliceTransaction(orderTotalRupees, opts || {});
  return { status: p.status, mor_required: p.mor_required, tcs_applies: p.tcs_applies, export_ready: p.export_ready, slices: slices.slices, integrity: slices.integrity, note: p.note };
}

module.exports = { STATUSES, PROFILE, normalize, profile, treat };
