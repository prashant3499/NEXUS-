'use strict';

/**
 * complianceRegistry.js
 *
 * "What certificates, permissions, legal and financial registrations are needed
 * to run the platform?" This is the founder's legal/financial readiness map —
 * the same idea as the integrations registry, but for the law instead of APIs.
 *
 * Each item: what it is, who issues it, why the platform needs it, whether it
 * BLOCKS launch, and its current status (founder marks these as obtained). It
 * is grounded in how an Indian marketplace + Merchant-of-Record + services
 * platform is actually regulated.
 *
 * IMPORTANT: this is an organized checklist to take to a CA + lawyer, NOT legal
 * advice. The platform flags what's needed; a professional confirms specifics
 * for the founder's entity and state.
 *
 * Pure + dependency-free.
 */

const AREA = Object.freeze({
  ENTITY: 'entity', TAX: 'tax', PAYMENTS: 'payments', EXPORT: 'export',
  DATA: 'data', SECTOR: 'sector', CONSUMER: 'consumer', LABOUR: 'labour',
});

// The registry. `blocks_launch` = cannot legally operate without it.
const REQUIREMENTS = Object.freeze([
  {
    id: 'company_registration', area: AREA.ENTITY, name: 'Company / LLP registration',
    issuer: 'Ministry of Corporate Affairs (MCA)', blocks_launch: true,
    why: 'A registered entity (Pvt Ltd recommended) to contract, hold funds, and bear the Merchant-of-Record liability.',
    note: 'Pvt Ltd is usual for a fundable platform; sole prop/LLP possible for a pilot.',
  },
  {
    id: 'pan_tan', area: AREA.ENTITY, name: 'PAN + TAN of the entity',
    issuer: 'Income Tax Department', blocks_launch: true,
    why: 'PAN for the entity; TAN to deduct/deposit TDS on payouts.',
  },
  {
    id: 'gst_registration', area: AREA.TAX, name: 'GST registration',
    issuer: 'GST Network (gst.gov.in)', blocks_launch: true,
    why: 'Mandatory for an e-commerce operator. Enables tax invoices and the platform-as-MoR model.',
  },
  {
    id: 'tcs_registration', area: AREA.TAX, name: 'TCS registration (Sec 52 CGST)',
    issuer: 'GST Network', blocks_launch: true,
    why: 'An e-commerce operator must collect TCS on the net value of taxable supplies by sellers and remit it.',
    note: 'This is the heart of the MoR tax flow the slicer already computes.',
  },
  {
    id: 'payment_aggregator', area: AREA.PAYMENTS, name: 'Payment routing via a licensed PA/PG',
    issuer: 'RBI (via Razorpay/partner, who holds the PA licence)', blocks_launch: true,
    why: 'Holding/splitting customer money needs an RBI-authorised Payment Aggregator. Using Razorpay Route keeps the platform OFF the float — it never holds funds — which avoids needing its own PA licence.',
    note: 'Critical design choice: never hold customer funds, or you trigger PA licensing yourself.',
  },
  {
    id: 'iec', area: AREA.EXPORT, name: 'Import Export Code (IEC)',
    issuer: 'DGFT', blocks_launch: false,
    why: 'Required to export (the EXIM modality / overseas buyers). Not needed for domestic-only launch.',
  },
  {
    id: 'lut_gst_export', area: AREA.EXPORT, name: 'LUT for export without IGST',
    issuer: 'GST Network', blocks_launch: false,
    why: 'Lets exports go out without paying IGST upfront. Needed once exporting.',
  },
  {
    id: 'dpdp_compliance', area: AREA.DATA, name: 'DPDP Act 2023 compliance + privacy policy',
    issuer: 'Self-implemented (Digital Personal Data Protection Act)', blocks_launch: true,
    why: 'Collecting Aadhaar/phone/KYC means consent management, data-minimisation, breach process, and a published privacy policy. The consent gates are built; the policy + process must be real.',
  },
  {
    id: 'it_act_intermediary', area: AREA.DATA, name: 'IT Act intermediary diligence + grievance officer',
    issuer: 'Self-implemented (IT Act + 2021 Rules)', blocks_launch: true,
    why: 'As an intermediary hosting seller content, the platform needs terms, takedown process, and a named Grievance Officer.',
    note: 'The grievance log + officer field already exist in the platform.',
  },
  {
    id: 'consumer_protection_ecom', area: AREA.CONSUMER, name: 'Consumer Protection (E-Commerce) Rules 2020',
    issuer: 'Self-implemented', blocks_launch: true,
    why: 'Mandatory seller disclosures, clear returns/refunds, country of origin, and a grievance redress timeline.',
  },
  {
    id: 'insurance_intermediary', area: AREA.SECTOR, name: 'Insurance intermediary registration (IF selling cover)',
    issuer: 'IRDAI', blocks_launch: false,
    why: 'Only needed to distribute insurance. The platform avoids this by FACILITATING through a licensed partner and taking a referral fee — it is never the insurer or the seller of record.',
    note: 'Stay a facilitator and this stays optional; become a seller of policies and it becomes required.',
  },
  {
    id: 'gi_authorised_user', area: AREA.SECTOR, name: 'GI authorised-user verification (for GI claims)',
    issuer: 'GI Registry, DPIIT', blocks_launch: false,
    why: 'To LABEL a product as GI-tagged, the seller must be a registered authorised user. The platform must verify this, not issue it.',
  },
  {
    id: 'tourism_operator_reg', area: AREA.SECTOR, name: 'Tourism: operator-bound licences + insurance',
    issuer: 'Ministry of Tourism / state; carried by the operator', blocks_launch: false,
    why: 'For the tourism vertical, the HOST/operator carries the licence + liability insurance. The platform is the agent and verifies it — it does not hold operator licences.',
  },
  {
    id: 'child_labour_safeguard', area: AREA.LABOUR, name: 'Child-labour & artisan-welfare safeguards',
    issuer: 'Self-implemented (Child Labour Act, etc.)', blocks_launch: true,
    why: 'Craft supply chains carry child-labour risk. The child-safety gates are built; a supplier code of conduct + checks should back them.',
  },
]);

/**
 * status — the readiness map. `obtained` is a set/array of requirement ids the
 * founder has marked done.
 */
function status(obtained = []) {
  const got = new Set(obtained);
  const items = REQUIREMENTS.map((r) => ({ ...r, obtained: got.has(r.id) }));
  const blockers = items.filter((r) => r.blocks_launch && !r.obtained);
  const blockingTotal = items.filter((r) => r.blocks_launch).length;
  return {
    requirements: items,
    summary: {
      total: items.length,
      obtained: items.filter((r) => r.obtained).length,
      blocking_total: blockingTotal,
      blocking_obtained: blockingTotal - blockers.length,
      still_blocking_launch: blockers.map((r) => ({ id: r.id, name: r.name, issuer: r.issuer })),
      launch_legal: blockers.length === 0,
      headline: blockers.length === 0
        ? 'All launch-blocking legal/financial requirements are in place.'
        : `${blockers.length} legal/financial requirement(s) still block launch.`,
      disclaimer: 'This is an organized checklist for a CA + lawyer, not legal advice. Confirm specifics for your entity and state.',
    },
  };
}

/** byArea — group requirements for a readable founder view. */
function byArea(obtained = []) {
  const s = status(obtained);
  const groups = {};
  for (const r of s.requirements) { (groups[r.area] = groups[r.area] || []).push(r); }
  return groups;
}

module.exports = { AREA, REQUIREMENTS, status, byArea };
