/**
 * NEXUS — Sourcing Engine.
 *
 * The "physical approach is impossible" reality: a solo founder in
 * Jaipur cannot visit 50 GJEPC gem exporters in person, cannot drive
 * to artisan villages, cannot man a trade-show booth. Every prospect
 * must be sourced and converted REMOTELY.
 *
 * This module is the remote customer acquisition engine. It does NOT
 * crawl websites or call WhatsApp APIs — those need network credentials
 * and partnerships we don't have yet. What it DOES is:
 *
 *   1. A lead registry — immutable status transitions per lead, full
 *      audit trail, no in-place mutation (mirrors grievance.js)
 *
 *   2. A scoring engine — given declared signals about a prospect
 *      (have they got GST? are they on IndiaMART? are they exporting
 *      already? do they have a website?), compute a 0-100 readiness
 *      score for each NEXUS tier (Karigar / Vyapari / Pravasi /
 *      Niryatak / Sansthan)
 *
 *   3. An outreach template library — first-touch + follow-up +
 *      demo-invite + onboarding-handoff messages in the right tone
 *      for each segment, with placeholders the founder fills in
 *
 *   4. A source registry — declarative list of where leads come from
 *      (GJEPC member list, EPCH directory, GI tag holders, MSME
 *      databases, Udyam Aadhaar registry, etc.) so the founder knows
 *      WHICH public lists to scrape next, and so the lead's source
 *      gets preserved for funnel analytics
 *
 *   5. Funnel metrics — given the current lead registry, compute
 *      conversion rate at each stage (new → contacted → responded →
 *      demo_done → onboarded), time-in-stage, dormant detection,
 *      so the founder sees where leads leak
 *
 * Everything is pure logic, code-only, no external dependency.
 * The "actually send WhatsApp" step is gated on Bhashini + WhatsApp
 * Business API credentials that don't exist yet — when they do, this
 * module's outreach templates feed those APIs directly.
 */

'use strict';

const crypto = require('crypto');

// ════════════════════════════════════════════════════════════
// LEAD STATUS — state machine for the funnel
// ════════════════════════════════════════════════════════════

const LEAD_STATUS = {
  NEW: 'new',
  RESEARCHED: 'researched',         // founder has read their public profile
  CONTACTED: 'contacted',           // first message sent
  RESPONDED: 'responded',           // they replied
  DEMO_SCHEDULED: 'demo_scheduled', // demo call/Zoom booked
  DEMO_DONE: 'demo_done',           // demo happened
  TRIALLING: 'trialling',            // they're using a sandbox account
  ONBOARDED: 'onboarded',            // they became a paying customer
  REJECTED: 'rejected',              // they said no, or aren't a fit
  DORMANT: 'dormant',                // no response in 30+ days
};

const STATUS_ORDER = [
  'new', 'researched', 'contacted', 'responded',
  'demo_scheduled', 'demo_done', 'trialling', 'onboarded',
];

// Valid forward transitions. REJECTED and DORMANT are terminal from any state.
const VALID_TRANSITIONS = {
  new:             ['researched', 'contacted', 'rejected', 'dormant'],
  researched:      ['contacted', 'rejected', 'dormant'],
  contacted:       ['responded', 'rejected', 'dormant'],
  responded:       ['demo_scheduled', 'trialling', 'rejected', 'dormant'],
  demo_scheduled:  ['demo_done', 'rejected', 'dormant'],
  demo_done:       ['trialling', 'onboarded', 'rejected', 'dormant'],
  trialling:       ['onboarded', 'rejected', 'dormant'],
  onboarded:       [],   // terminal — leads who onboarded become customers
  rejected:        [],   // terminal
  dormant:         ['responded', 'rejected'],  // dormant leads CAN re-engage
};

// ════════════════════════════════════════════════════════════
// SEGMENTS — match our tier model
// ════════════════════════════════════════════════════════════

const SEGMENTS = {
  KARIGAR:  'karigar_prospect',   // undocumented artisan
  VYAPARI:  'vyapari_prospect',   // small business with GST
  PRAVASI:  'pravasi_prospect',   // tourism operator
  NIRYATAK: 'niryatak_prospect',  // registered exporter
  SANSTHAN: 'sansthan_prospect',  // cooperative or large org
};

// ════════════════════════════════════════════════════════════
// SOURCE REGISTRY — where leads come from. Each entry documents:
//   - the public list URL (no crawling done here; founder visits)
//   - what segment the leads typically fit
//   - what data fields the source provides
//   - effort to enumerate (low/med/high)
// ════════════════════════════════════════════════════════════

const LEAD_SOURCES = {
  gjepc_member_directory: {
    label: 'GJEPC Member Directory',
    url: 'https://www.gjepc.org/members',
    typical_segment: SEGMENTS.NIRYATAK,
    description: 'Gem & Jewellery Export Promotion Council members — registered exporters with IEC.',
    fields_available: ['name', 'company', 'city', 'category', 'membership_id'],
    enumeration_effort: 'medium',
    estimated_total_in_india: 8000,
  },
  epch_member_directory: {
    label: 'EPCH Member Directory',
    url: 'https://www.epch.in/members',
    typical_segment: SEGMENTS.NIRYATAK,
    description: 'Export Promotion Council for Handicrafts members.',
    fields_available: ['name', 'company', 'city', 'craft_category'],
    enumeration_effort: 'medium',
    estimated_total_in_india: 15000,
  },
  gi_tag_holders: {
    label: 'GI Tag Registered Producers',
    url: 'https://ipindia.gov.in/gi-tagged.htm',
    typical_segment: SEGMENTS.VYAPARI,
    description: 'Producers registered against a Geographical Indication. Direct match to verified-real story.',
    fields_available: ['gi_tag', 'producer_name', 'region', 'craft'],
    enumeration_effort: 'low',
    estimated_total_in_india: 3000,
  },
  udyam_aadhaar: {
    label: 'Udyam Aadhaar (Micro/Small enterprise registry)',
    url: 'https://udyamregistration.gov.in',
    typical_segment: SEGMENTS.VYAPARI,
    description: 'MSME-registered businesses. Includes craft, handloom, jewellery NIC codes.',
    fields_available: ['name', 'enterprise_name', 'district', 'nic_code', 'gstn'],
    enumeration_effort: 'high',
    estimated_total_in_india: 2500000,
  },
  fpo_database: {
    label: 'Farmer/Artisan Producer Organisations',
    url: 'https://sfacindia.com/fpo',
    typical_segment: SEGMENTS.SANSTHAN,
    description: 'Cooperatives and producer-organisations — natural fit for our cooperative legal model.',
    fields_available: ['fpo_name', 'state', 'member_count', 'commodity'],
    enumeration_effort: 'medium',
    estimated_total_in_india: 7000,
  },
  state_handicraft_boards: {
    label: 'State Handicraft / Handloom Board Rosters',
    url: 'varies by state',
    typical_segment: SEGMENTS.KARIGAR,
    description: 'State-level rosters of registered artisans (Rajasthan SHL, UP UPSHB, etc.). Best route to Karigar tier.',
    fields_available: ['artisan_name', 'craft', 'village', 'aadhaar_linked'],
    enumeration_effort: 'high',
    estimated_total_in_india: 5000000,
  },
  tourism_operator_registry: {
    label: 'Ministry of Tourism Operator Registry',
    url: 'https://tourism.gov.in/recognized-service-providers',
    typical_segment: SEGMENTS.PRAVASI,
    description: 'Tour operators recognized by Ministry of Tourism (RTO). Eligible for our Pravasi tier.',
    fields_available: ['operator_name', 'city', 'rto_id', 'category'],
    enumeration_effort: 'low',
    estimated_total_in_india: 1500,
  },
  indiamart_seller_profiles: {
    label: 'IndiaMART seller profiles in target categories',
    url: 'https://www.indiamart.com',
    typical_segment: SEGMENTS.VYAPARI,
    description: 'Existing sellers already comfortable with online B2B — strong signal of intent. Manual lookup per category.',
    fields_available: ['seller_name', 'gst', 'phone_partial', 'categories'],
    enumeration_effort: 'high',
    estimated_total_in_india: 100000,
  },
};

// ════════════════════════════════════════════════════════════
// SCORING — given a lead's declared signals, compute fitness
// ════════════════════════════════════════════════════════════

/**
 * Score a lead 0-100 for each tier. Higher = more ready / better fit.
 * Signals are positive integers indicating presence/strength of evidence.
 *
 * @param {object} signals - declared facts about the lead
 *   { hasGST, hasIEC, hasWebsite, onIndiaMART, exportingAlready,
 *     hasGITag, monthlyRevenuePaise, registeredArtisan,
 *     tourismOperatorLicense, isCooperative }
 */
function scoreLead(signals = {}) {
  // Weights tuned to match the conversion intuition for each tier
  const karigar = score({
    registeredArtisan: 35,
    hasNoGST:          20,                // explicit absence is a signal
    hasNoIEC:          10,
    hasGITag:          25,
    hasBankAccount:    10,
  }, signals);

  const vyapari = score({
    hasGST:            35,
    hasWebsite:        15,
    onIndiaMART:       20,
    hasGITag:          15,
    monthlyRevenue1L:  15,                // ≥ ₹1L/mo
  }, signals);

  const pravasi = score({
    tourismOperatorLicense: 45,
    hasGST:                  20,
    hasWebsite:              15,
    operatesInTouristState:  20,
  }, signals);

  const niryatak = score({
    hasIEC:               30,
    exportingAlready:     25,
    hasGST:               15,
    monthlyRevenue10L:    20,             // ≥ ₹10L/mo
    onGJEPCorEPCH:        10,
  }, signals);

  const sansthan = score({
    isCooperative:        40,
    memberCount50plus:    30,
    hasGST:               15,
    isFPO:                15,
  }, signals);

  // Best tier = highest score; ties broken by tier order
  const all = { karigar, vyapari, pravasi, niryatak, sansthan };
  const tierOrder = ['niryatak', 'sansthan', 'vyapari', 'pravasi', 'karigar'];  // higher-revenue first on ties
  let bestTier = 'karigar', bestScore = 0;
  for (const t of tierOrder) {
    if (all[t] > bestScore) { bestTier = t; bestScore = all[t]; }
  }
  return { scores: all, bestTier, bestScore };
}

// Compute a single tier score from weighted signals
function score(weights, signals) {
  let total = 0, max = 0;
  for (const [key, weight] of Object.entries(weights)) {
    max += weight;
    if (signals[key]) total += weight;
  }
  // Convert to 0-100 if max > 0, else 0
  return max > 0 ? Math.round((total / max) * 100) : 0;
}

// ════════════════════════════════════════════════════════════
// OUTREACH TEMPLATES — first-touch, follow-up, demo-invite,
// onboarding-handoff. Per-segment, English + Hindi seeded.
// Placeholders use {{var}} so the founder can fill in.
// ════════════════════════════════════════════════════════════

const OUTREACH_TEMPLATES = {
  niryatak_first_touch_en: {
    channel: 'whatsapp',
    segment: SEGMENTS.NIRYATAK,
    stage: 'first_touch',
    language: 'en',
    char_count: 380,
    body: `Hello {{name}},\n\nI'm {{founder_name}} from NEXUS — a verified-real commerce platform for Indian gem & jewellery exporters.\n\nWe handle CITES, Kimberley, and BIS preflight on every listing so your shipments don't get held at customs. Settlements split T+2 to your bank — platform never holds your money.\n\nWould you be open to a 15-min call this week? I'd love to show you the export-readiness check we built for GJEPC members like you.\n\nThanks,\n{{founder_name}}`,
  },
  vyapari_first_touch_en: {
    channel: 'whatsapp',
    segment: SEGMENTS.VYAPARI,
    stage: 'first_touch',
    language: 'en',
    char_count: 320,
    body: `Hi {{name}},\n\nNEXUS is a verified-craft commerce platform built specifically for GST-registered small businesses like {{company}}.\n\nWe include ad generation across WhatsApp + Facebook + Google in your subscription — no separate ad spend. Settlements direct to your bank, T+2.\n\nCould we do a 10-minute demo this week?\n\n— {{founder_name}}`,
  },
  karigar_first_touch_hi: {
    channel: 'whatsapp',
    segment: SEGMENTS.KARIGAR,
    stage: 'first_touch',
    language: 'hi',
    char_count: 280,
    body: `नमस्ते {{name}} जी,\n\nमैं {{founder_name}}, NEXUS से। हम भारतीय कारीगरों के लिए एक नया प्लेटफ़ॉर्म बना रहे हैं — जहाँ बिना GST के भी आप अपना सामान देश-विदेश बेच सकते हैं।\n\nहम आपके खाते में सीधे 2 दिन में पैसा भेजते हैं। GST और कागज़ी काम हम करते हैं।\n\nक्या आप 10 मिनट बात कर सकते हैं?\n\n— {{founder_name}}`,
  },
  pravasi_first_touch_en: {
    channel: 'email',
    segment: SEGMENTS.PRAVASI,
    stage: 'first_touch',
    language: 'en',
    char_count: 420,
    body: `Hi {{name}},\n\nNEXUS is launching a craft-experience layer for tour operators in {{city}} — letting you sell artisan workshops, gem-cutter visits, block-print sessions etc. to your existing tourist base, with operator-bound insurance and agent/intermediary structure (so you carry zero product liability).\n\nWe handle the booking, KYC, payment splits, and craft verification. You add ₹200-500 margin per booking, no inventory.\n\nWould a 15-minute call this week be useful?\n\nThanks,\n{{founder_name}}`,
  },
  sansthan_first_touch_en: {
    channel: 'email',
    segment: SEGMENTS.SANSTHAN,
    stage: 'first_touch',
    language: 'en',
    char_count: 460,
    body: `Dear {{name}},\n\nNEXUS is a commerce platform purpose-built for artisan cooperatives and producer organisations. For {{cooperative_name}}, the relevant features are:\n\n- Multi-beneficiary settlement: one sale splits T+2 to N member accounts at the percentage you set\n- Cooperative umbrella legal model: members keep their independence, you bill once\n- GI-verification + provenance trail on every product\n\nWe'd love to walk you through how this fits {{cooperative_name}}. Could we schedule a 30-min call with your team?\n\nThanks,\n{{founder_name}}`,
  },
  // Generic follow-ups (segment-agnostic)
  follow_up_no_response_en: {
    channel: 'whatsapp',
    segment: '*',
    stage: 'follow_up',
    language: 'en',
    char_count: 180,
    body: `Hi {{name}}, just following up on my note from {{days_ago}} days back about NEXUS. Happy to reschedule if a different time works — even a quick 5-min call would help me understand if there's a fit. Thanks!\n\n— {{founder_name}}`,
  },
  demo_invite_en: {
    channel: 'email',
    segment: '*',
    stage: 'demo_invite',
    language: 'en',
    char_count: 320,
    body: `Hi {{name}},\n\nGreat speaking with you. As discussed, here's the demo link for {{demo_date}} at {{demo_time}}: {{demo_link}}\n\nI'll walk you through:\n1. The export-readiness preflight (CITES / Kimberley / BIS)\n2. Gateway-split settlement live\n3. Ad-spend with margin guarantee\n\nLooking forward.\n\n— {{founder_name}}`,
  },
  onboarding_handoff_en: {
    channel: 'email',
    segment: '*',
    stage: 'onboarding_handoff',
    language: 'en',
    char_count: 280,
    body: `Welcome to NEXUS, {{name}}.\n\nYour onboarding link: {{onboarding_url}}\n\nFor your tier ({{tier}}), the first three steps are:\n1. {{step_1}}\n2. {{step_2}}\n3. {{step_3}}\n\nTime to first sale at your tier: typically {{time_to_first_sale}}.\n\nReply here with any question — I read every message myself.\n\n— {{founder_name}}`,
  },
};

/**
 * Render an outreach template by filling placeholders.
 * Unfilled placeholders remain as {{var}} so the founder can complete by hand.
 */
function renderOutreach(templateKey, fills = {}) {
  const tpl = OUTREACH_TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Unknown template: ${templateKey}`);
  let body = tpl.body;
  for (const [key, val] of Object.entries(fills)) {
    body = body.split(`{{${key}}}`).join(String(val));
  }
  // Detect unfilled placeholders
  const unfilled = [...body.matchAll(/\{\{([a-z_]+)\}\}/gi)].map(m => m[1]);
  return {
    template: templateKey,
    channel: tpl.channel,
    segment: tpl.segment,
    stage: tpl.stage,
    language: tpl.language,
    body,
    unfilled_placeholders: [...new Set(unfilled)],
    ready_to_send: unfilled.length === 0,
  };
}

/**
 * Pick the best first-touch template given a lead's segment and language preference.
 */
function pickFirstTouchTemplate(segment, languagePref = 'en') {
  const wanted = Object.entries(OUTREACH_TEMPLATES)
    .filter(([k, t]) => t.segment === segment && t.stage === 'first_touch');
  // Prefer requested language; fall back to English
  const langMatch = wanted.find(([k, t]) => t.language === languagePref);
  if (langMatch) return langMatch[0];
  const enFallback = wanted.find(([k, t]) => t.language === 'en');
  if (enFallback) return enFallback[0];
  return null;
}

// ════════════════════════════════════════════════════════════
// LEAD REGISTRY — immutable status transitions, full audit
// ════════════════════════════════════════════════════════════

function newId(prefix = 'lead_') {
  return prefix + crypto.randomBytes(6).toString('hex');
}

/**
 * Create a lead. Returns an immutable record with status='new' and a history
 * trail. Use updateLeadStatus() to transition; never mutate in place.
 */
function createLead({ source, segment, name, contactHandles = {}, signals = {}, notes = '' } = {}) {
  if (!source || !LEAD_SOURCES[source]) {
    throw new Error(`Unknown source. Use one of: ${Object.keys(LEAD_SOURCES).join(', ')}`);
  }
  if (!segment) {
    throw new Error('segment is required');
  }
  if (!Object.values(SEGMENTS).includes(segment)) {
    throw new Error(`Unknown segment: ${segment}. Use one of: ${Object.values(SEGMENTS).join(', ')}`);
  }
  if (!name || typeof name !== 'string') {
    throw new Error('name is required');
  }
  const id = newId();
  const at = Date.now();
  const scoring = scoreLead(signals);
  return Object.freeze({
    id,
    source,
    segment,
    name,
    contactHandles: Object.freeze({ ...contactHandles }),
    signals: Object.freeze({ ...signals }),
    notes,
    score: scoring.bestScore,
    suggestedTier: scoring.bestTier,
    scoreBreakdown: Object.freeze({ ...scoring.scores }),
    status: LEAD_STATUS.NEW,
    history: Object.freeze([
      Object.freeze({ at, from: null, to: LEAD_STATUS.NEW, note: notes || 'created' }),
    ]),
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Transition a lead to a new status. Returns a NEW lead object — never
 * mutates. Throws if the transition is invalid for the current state.
 */
function updateLeadStatus(lead, newStatus, note = '') {
  if (!lead || !lead.status) throw new Error('lead must have a status');
  const valid = VALID_TRANSITIONS[lead.status];
  if (!valid) throw new Error(`No transitions defined from ${lead.status}`);
  if (!valid.includes(newStatus)) {
    throw new Error(`Invalid transition: ${lead.status} → ${newStatus}. Allowed: ${valid.join(', ') || '(terminal)'}`);
  }
  const at = Date.now();
  return Object.freeze({
    ...lead,
    status: newStatus,
    history: Object.freeze([
      ...lead.history,
      Object.freeze({ at, from: lead.status, to: newStatus, note }),
    ]),
    updatedAt: at,
  });
}

/**
 * Detect dormant leads — no status change in the past N days (default 30).
 * Returns lead IDs to flag as dormant. Caller applies the transition.
 */
function detectDormant(leads, opts = {}) {
  const cutoffDays = opts.cutoffDays || 30;
  const now = opts.now || Date.now();
  const cutoff = now - cutoffDays * 24 * 60 * 60 * 1000;
  const skipStatuses = new Set([LEAD_STATUS.ONBOARDED, LEAD_STATUS.REJECTED, LEAD_STATUS.DORMANT]);
  return leads
    .filter(l => !skipStatuses.has(l.status))
    .filter(l => l.updatedAt < cutoff)
    .map(l => l.id);
}

// ════════════════════════════════════════════════════════════
// FUNNEL METRICS — where are leads leaking?
// ════════════════════════════════════════════════════════════

/**
 * Compute funnel-stage counts and conversion rates from contacted onward.
 * Returns { stages: { stage: count }, conversions: { fromTo: pct }, leakage }
 */
function funnelMetrics(leads) {
  const stages = {};
  for (const s of Object.values(LEAD_STATUS)) stages[s] = 0;
  for (const lead of leads) {
    stages[lead.status] = (stages[lead.status] || 0) + 1;
  }

  // Cumulative funnel: how many leads ever REACHED each stage (not just sat there)
  // Walk the history of each lead and mark every stage they've been in.
  const reached = {};
  for (const s of STATUS_ORDER) reached[s] = 0;
  for (const lead of leads) {
    const seen = new Set();
    for (const h of lead.history) {
      seen.add(h.to);
    }
    for (const s of STATUS_ORDER) {
      if (seen.has(s)) reached[s]++;
    }
  }

  // Conversion rate at each step
  const conversions = {};
  for (let i = 0; i < STATUS_ORDER.length - 1; i++) {
    const from = STATUS_ORDER[i];
    const to = STATUS_ORDER[i + 1];
    const fromCount = reached[from] || 0;
    const toCount = reached[to] || 0;
    const rate = fromCount > 0 ? Math.round((toCount / fromCount) * 1000) / 10 : null;
    conversions[`${from}_to_${to}`] = { fromCount, toCount, ratePct: rate };
  }

  // Identify the leakiest step (smallest conversion rate)
  let leakiestStep = null, leakiestRate = 101;
  for (const [step, c] of Object.entries(conversions)) {
    if (c.ratePct !== null && c.ratePct < leakiestRate && c.fromCount >= 3) {
      leakiestRate = c.ratePct;
      leakiestStep = step;
    }
  }

  return {
    stages,
    reached,
    conversions,
    leakiestStep,
    leakiestRatePct: leakiestStep ? leakiestRate : null,
    totalLeads: leads.length,
    onboardedCount: stages[LEAD_STATUS.ONBOARDED] || 0,
    overallConversionPct: leads.length > 0
      ? Math.round(((stages[LEAD_STATUS.ONBOARDED] || 0) / leads.length) * 1000) / 10
      : 0,
  };
}

/**
 * Rank leads by score (descending) — what the founder should contact next.
 * Filters to leads in NEW / RESEARCHED / DORMANT (re-engageable) by default.
 */
function rankByPriority(leads, opts = {}) {
  const wantedStatuses = opts.statuses || [LEAD_STATUS.NEW, LEAD_STATUS.RESEARCHED, LEAD_STATUS.DORMANT];
  return leads
    .filter(l => wantedStatuses.includes(l.status))
    .sort((a, b) => b.score - a.score);
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  LEAD_STATUS,
  STATUS_ORDER,
  VALID_TRANSITIONS,
  SEGMENTS,
  LEAD_SOURCES,
  OUTREACH_TEMPLATES,
  scoreLead,
  pickFirstTouchTemplate,
  renderOutreach,
  createLead,
  updateLeadStatus,
  detectDormant,
  funnelMetrics,
  rankByPriority,
};
