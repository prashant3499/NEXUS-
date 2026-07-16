/**
 * NEXUS — Grievance & policy module.
 *
 * The regulatory backbone every Indian e-commerce platform must have:
 *   • Consumer Protection (E-Commerce) Rules 2020: grievance officer,
 *     48-hour acknowledgment, 30-day resolution.
 *   • IT Rules 2021: grievance officer + nodal officer, 24-hour ack,
 *     15-day resolution.
 *   • DPDP 2023: data principal rights workflow.
 *
 * We implement to the strictest of the three (24h ack, 15d resolve) so
 * we're compliant with all of them simultaneously.
 *
 * This module is pure. It handles the data, the SLA math, and the
 * policy-content rendering. The UI and the actual delivery of
 * notifications are wired separately.
 */

'use strict';

const HOUR = 3600 * 1000;
const DAY  = 24 * HOUR;
const ACK_SLA_HOURS = 24;
const RESOLVE_SLA_DAYS = 15;

const STATUS = {
  OPEN:           'open',
  ACKNOWLEDGED:   'acknowledged',
  IN_PROGRESS:    'in_progress',
  RESOLVED:       'resolved',
  ESCALATED:      'escalated',
  CLOSED:         'closed',
};

const TYPE = {
  PRODUCT_ISSUE:   'product_issue',
  DELIVERY:        'delivery',
  PAYMENT:         'payment',
  DATA_REQUEST:    'data_request',     // DPDP — access/correction/erasure
  TAKEDOWN:        'takedown',          // IT Rules — content takedown
  SELLER_CONDUCT:  'seller_conduct',
  PLATFORM:        'platform',
  OTHER:           'other',
};

const SEVERITY = { LOW: 'low', MED: 'med', HIGH: 'high', CRITICAL: 'critical' };

// ────────────────────────────────────────────────────────────
// FILING — create a grievance with both SLA clocks set
// ────────────────────────────────────────────────────────────

function fileGrievance({
  complainantName, complainantContact, complainantRole = 'buyer',
  type = TYPE.OTHER, severity = SEVERITY.MED, description,
  relatedOrderId = null, relatedSellerId = null,
  now = Date.now(),
} = {}) {
  if (!complainantName || !complainantContact) throw new Error('complainant required');
  if (!description || description.length < 10) throw new Error('description must be at least 10 chars');

  const id = 'griev_' + (now.toString(36)) + '_' + Math.random().toString(36).slice(2, 7);

  return Object.freeze({
    id,
    complainant: { name: complainantName, contact: complainantContact, role: complainantRole },
    type, severity, description,
    related: { orderId: relatedOrderId, sellerId: relatedSellerId },
    status: STATUS.OPEN,
    createdAt: now,
    slaAckBy: now + ACK_SLA_HOURS * HOUR,
    slaResolveBy: now + RESOLVE_SLA_DAYS * DAY,
    history: Object.freeze([{ at: now, by: 'system', action: 'filed', note: 'Grievance filed' }]),
    acknowledgedAt: null,
    resolvedAt: null,
    resolution: null,
  });
}

// ────────────────────────────────────────────────────────────
// STATE TRANSITIONS — return NEW grievance objects (immutable)
// ────────────────────────────────────────────────────────────

function acknowledge(grievance, byOfficer, note, now = Date.now()) {
  if (grievance.status !== STATUS.OPEN) throw new Error(`Cannot acknowledge from ${grievance.status}`);
  return Object.freeze({
    ...grievance,
    status: STATUS.ACKNOWLEDGED,
    acknowledgedAt: now,
    history: Object.freeze([...grievance.history, { at: now, by: byOfficer, action: 'acknowledged', note: note || 'Acknowledged within SLA' }]),
  });
}

function progress(grievance, byOfficer, note, now = Date.now()) {
  if (![STATUS.ACKNOWLEDGED, STATUS.IN_PROGRESS].includes(grievance.status)) {
    throw new Error(`Cannot mark in_progress from ${grievance.status}`);
  }
  return Object.freeze({
    ...grievance,
    status: STATUS.IN_PROGRESS,
    history: Object.freeze([...grievance.history, { at: now, by: byOfficer, action: 'progress', note }]),
  });
}

function resolve(grievance, byOfficer, resolution, now = Date.now()) {
  if ([STATUS.RESOLVED, STATUS.CLOSED].includes(grievance.status)) {
    throw new Error(`Already ${grievance.status}`);
  }
  if (!resolution || resolution.length < 10) throw new Error('Resolution must be substantive (≥10 chars)');
  return Object.freeze({
    ...grievance,
    status: STATUS.RESOLVED,
    resolvedAt: now,
    resolution,
    history: Object.freeze([...grievance.history, { at: now, by: byOfficer, action: 'resolved', note: resolution }]),
  });
}

function escalate(grievance, byOfficer, reason, now = Date.now()) {
  return Object.freeze({
    ...grievance,
    status: STATUS.ESCALATED,
    history: Object.freeze([...grievance.history, { at: now, by: byOfficer, action: 'escalated', note: reason }]),
  });
}

// ────────────────────────────────────────────────────────────
// SLA EVALUATION — pure, time-anchored
// ────────────────────────────────────────────────────────────

function slaStatus(grievance, now = Date.now()) {
  const ackBreached = (grievance.status === STATUS.OPEN) && (now > grievance.slaAckBy);
  const resolveBreached = ![STATUS.RESOLVED, STATUS.CLOSED].includes(grievance.status) && (now > grievance.slaResolveBy);
  const ackHoursLeft = Math.max(0, Math.round((grievance.slaAckBy - now) / HOUR));
  const resolveDaysLeft = Math.max(0, Math.round((grievance.slaResolveBy - now) / DAY));
  return {
    ackBreached,
    resolveBreached,
    ackHoursLeft,
    resolveDaysLeft,
    needsEscalation: ackBreached || resolveBreached,
  };
}

/** Across a list, return the ones needing attention, ranked. */
function slaBreaches(grievances, now = Date.now()) {
  const breached = [];
  for (const g of grievances) {
    const s = slaStatus(g, now);
    if (s.needsEscalation) breached.push({ grievance: g, sla: s });
  }
  // Critical first, then most-overdue
  breached.sort((a, b) => {
    const sa = severityRank(a.grievance.severity), sb = severityRank(b.grievance.severity);
    if (sa !== sb) return sb - sa;
    return b.grievance.createdAt - a.grievance.createdAt; // newer first within same severity
  });
  return breached;
}

function severityRank(s) { return ({ low: 1, med: 2, high: 3, critical: 4 })[s] || 0; }

// ────────────────────────────────────────────────────────────
// POLICY CONTENT — structured, with merge fields
// ────────────────────────────────────────────────────────────

const POLICY_FIELDS_REQUIRED = [
  'PLATFORM_LEGAL_NAME', 'PLATFORM_ADDRESS', 'PLATFORM_EMAIL',
  'GRIEVANCE_OFFICER_NAME', 'GRIEVANCE_OFFICER_EMAIL', 'GRIEVANCE_OFFICER_PHONE',
  'NODAL_OFFICER_NAME', 'NODAL_OFFICER_EMAIL',
  'DPO_NAME', 'DPO_EMAIL',
  'LAST_UPDATED',
];

const POLICY_TEMPLATES = {
  privacy: `# Privacy Policy

**{PLATFORM_LEGAL_NAME}** ("the Platform") is committed to protecting your personal data in accordance with the Digital Personal Data Protection Act, 2023 (DPDP).

## 1. Data we collect
- Account data (name, contact, identification documents you upload)
- Transaction data (orders, settlements, communications)
- Technical data (device, IP, usage logs) for security and product improvement

## 2. Purposes
We process data for: providing the service, regulatory compliance (GST, FEMA, customs), fraud prevention, and (with your consent) marketing communications.

## 3. Your rights
You may request access, correction, or erasure of your data, and withdraw consent at any time, by contacting our Data Protection Officer.

## 4. Data Protection Officer
- **{DPO_NAME}**
- {DPO_EMAIL}

## 5. Grievances
Data-related grievances follow the platform grievance process; see the Grievance Redressal policy.

_Last updated: {LAST_UPDATED}_`,

  terms: `# Terms of Service

By using **{PLATFORM_LEGAL_NAME}** ("the Platform") you agree to these Terms.

## 1. The Platform's role
Depending on the seller's status, the Platform acts as: (a) Merchant of Record, (b) SaaS provider to a registered seller, (c) Agent/Intermediary for tourism services, (d) Cooperative umbrella, or (e) Guardian-MoR (minor with guardian). The applicable model is shown on each transaction.

## 2. Buyer obligations
- Provide accurate contact and shipping details
- Pay through approved methods
- Use products lawfully

## 3. Seller obligations
- Provide accurate product information
- Honour orders accepted
- Comply with applicable laws for the model assigned

## 4. Limitation of liability
The Platform's liability is limited as set out in the Consumer Protection (E-Commerce) Rules 2020 and applicable law.

_Last updated: {LAST_UPDATED}_`,

  returns: `# Returns & Refunds Policy

## 1. Right to return
Buyers may return non-perishable, non-customized products within **7 days** of delivery, subject to the product being in original condition.

## 2. Non-returnable items
- Customised or made-to-order products
- Perishable goods (food, naturals)
- Hygiene-sensitive items
- Tourism bookings (governed by the operator's cancellation policy)

## 3. Refund timing
Approved refunds are processed within **7 working days** of return receipt. Refunds reach your account via the original payment method.

## 4. Disputes
Disputes follow the Grievance Redressal process.

_Last updated: {LAST_UPDATED}_`,

  grievance: `# Grievance Redressal

Per the Consumer Protection (E-Commerce) Rules 2020 and the IT Rules 2021, **{PLATFORM_LEGAL_NAME}** appoints the following officers:

## Grievance Officer
- **{GRIEVANCE_OFFICER_NAME}**
- {GRIEVANCE_OFFICER_EMAIL}
- {GRIEVANCE_OFFICER_PHONE}
- Address: {PLATFORM_ADDRESS}

## Nodal Officer (IT Rules 2021)
- **{NODAL_OFFICER_NAME}**
- {NODAL_OFFICER_EMAIL}

## Service Levels
- Acknowledgment of complaint: **within 24 hours** of receipt
- Resolution: **within 15 days** of acknowledgment

## How to file a grievance
You may file via the in-app grievance form, by email to the Grievance Officer, or in writing to the address above. Please include your name, contact, the related order ID (if any), and a description of the issue.

_Last updated: {LAST_UPDATED}_`,
};

/**
 * Render a policy by filling merge fields from config. Returns
 * { rendered, missing } — `missing` lists any required fields that
 * weren't supplied, so we can flag incomplete policies.
 */
function renderPolicy(name, config = {}) {
  const template = POLICY_TEMPLATES[name];
  if (!template) throw new Error(`Unknown policy: ${name}`);
  const missing = [];
  const rendered = template.replace(/\{([A-Z_]+)\}/g, (_, key) => {
    const v = config[key];
    if (v === undefined || v === null || v === '') {
      missing.push(key);
      return `[${key} NOT CONFIGURED]`;
    }
    return String(v);
  });
  return { rendered, missing };
}

/** Are policies publishable? They are not if required fields are missing. */
function policyReadiness(config = {}) {
  const allMissing = new Set();
  for (const name of Object.keys(POLICY_TEMPLATES)) {
    const { missing } = renderPolicy(name, config);
    missing.forEach(m => allMissing.add(m));
  }
  return {
    ready: allMissing.size === 0,
    missing: [...allMissing].sort(),
  };
}

// ────────────────────────────────────────────────────────────
// COOKIE CONSENT — a tiny state machine
// ────────────────────────────────────────────────────────────

const CONSENT_PURPOSES = ['essential', 'functional', 'analytics', 'marketing'];

function defaultConsent() {
  return { essential: true, functional: false, analytics: false, marketing: false, capturedAt: null };
}

function setConsent(current, choices, now = Date.now()) {
  const next = { ...current };
  for (const p of CONSENT_PURPOSES) {
    if (p === 'essential') { next[p] = true; continue; } // can't refuse essential
    if (p in choices) next[p] = Boolean(choices[p]);
  }
  next.capturedAt = now;
  return Object.freeze(next);
}

function withdrawConsent(current, now = Date.now()) {
  return Object.freeze({ essential: true, functional: false, analytics: false, marketing: false, capturedAt: now });
}

module.exports = {
  STATUS, TYPE, SEVERITY,
  ACK_SLA_HOURS, RESOLVE_SLA_DAYS,
  fileGrievance, acknowledge, progress, resolve, escalate,
  slaStatus, slaBreaches,
  POLICY_TEMPLATES, POLICY_FIELDS_REQUIRED,
  renderPolicy, policyReadiness,
  CONSENT_PURPOSES, defaultConsent, setConsent, withdrawConsent,
};
