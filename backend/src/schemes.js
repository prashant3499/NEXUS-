/**
 * NEXUS — Government Scheme Navigator.
 *
 * Indian artisans often qualify for government schemes (PMKVY, Mudra,
 * Stand-Up India, MSME registrations, handicraft schemes, etc.) — but
 * they rarely know which ones, what they cover, or how to apply. We
 * already collect the data points needed for eligibility matching
 * (Aadhaar, region, craft type, tier, registration status). This
 * module turns that data into a ranked list of applicable schemes
 * with application hints.
 *
 * What this module does:
 *   - Maintains a registry of central + state schemes with their
 *     eligibility criteria (age, gender, caste, region, sector,
 *     existing registration requirements)
 *   - Given an artisan profile, returns the schemes they qualify for,
 *     ranked by likely value (loan amount, training stipend, market
 *     access)
 *   - Generates a structured application checklist for each scheme
 *
 * What this module does NOT do:
 *   - Submit applications (each scheme has its own portal; we provide
 *     the link and the document checklist)
 *   - Track real-time scheme availability or budget exhaustion (these
 *     change quarter-to-quarter; we surface the canonical scheme,
 *     the founder checks status)
 *   - Replace a CA or facilitator (some schemes need professional
 *     guidance for the application)
 *
 * The scheme data here is sourced from public government portals as of
 * early 2026. The founder should review each scheme's current status
 * before recommending to an artisan.
 *
 * Pure logic. Code-only. Same pattern as the other domain modules.
 */

'use strict';

// ════════════════════════════════════════════════════════════
// CRITERION TYPES — eligibility predicates
// ════════════════════════════════════════════════════════════

const CRITERION = {
  AGE_MIN:           'age_min',          // value: minimum age
  AGE_MAX:           'age_max',          // value: maximum age
  GENDER:            'gender',           // value: 'female' | 'any'
  CATEGORY:          'category',         // value: 'sc'|'st'|'obc'|'general'|'any'
  HAS_AADHAAR:       'has_aadhaar',
  HAS_BANK_ACCOUNT:  'has_bank_account',
  HAS_GST:           'has_gst',          // requires=true OR requires=false (no GST)
  IS_MSME_REGISTERED:'is_msme_registered',
  IS_ARTISAN_CARD:   'is_artisan_card',  // has Pehchan / craftsman ID card
  CRAFT_CATEGORY:    'craft_category',   // value: list of accepted categories
  STATE:             'state',            // value: list of accepted states
  MIN_BUSINESS_AGE:  'min_business_age_months',
  ANNUAL_TURNOVER_MAX: 'annual_turnover_max_paise',
  IS_FIRST_BUSINESS: 'is_first_business',
};

// ════════════════════════════════════════════════════════════
// SCHEME REGISTRY
// Each scheme entry: { id, name, ministry, category, summary, benefit,
//                      typical_amount_paise, criteria, application_url,
//                      documents_required, application_steps, urgency,
//                      partner_required }
// ════════════════════════════════════════════════════════════

const SCHEMES = {
  pmkvy: {
    id: 'pmkvy',
    name: 'Pradhan Mantri Kaushal Vikas Yojana',
    ministry: 'Ministry of Skill Development & Entrepreneurship',
    category: 'training',
    summary: 'Skill training + certification + ₹8,000 reward on certification. Includes RPL (Recognition of Prior Learning) for traditional artisans.',
    benefit: 'Free training + certificate + cash reward',
    typical_amount_paise: 800000,
    criteria: [
      { type: CRITERION.AGE_MIN, value: 15 },
      { type: CRITERION.AGE_MAX, value: 45 },
      { type: CRITERION.HAS_AADHAAR, value: true },
    ],
    boost_for: ['craft_category:handicraft', 'craft_category:handloom', 'gender:female'],
    application_url: 'https://www.pmkvyofficial.org',
    documents_required: ['Aadhaar', 'Bank passbook', 'Education certificate (if any)', 'Photograph'],
    application_steps: [
      'Visit nearest PMKVY training centre (search by PIN code on the portal)',
      'Choose the relevant Job Role under Handicrafts/Handloom Sector Skill Council',
      'Enrol — provide Aadhaar + bank details',
      'Attend training (typically 200-600 hours depending on job role)',
      'Take assessment; on passing, receive certificate + ₹8,000 cash reward to bank',
    ],
    urgency: 'rolling enrolment',
    partner_required: false,
  },

  mudra_shishu: {
    id: 'mudra_shishu',
    name: 'PM MUDRA Yojana — Shishu',
    ministry: 'Ministry of Finance / MUDRA',
    category: 'loan',
    summary: 'Collateral-free business loan up to ₹50,000 for micro-enterprises. No formal credit history required.',
    benefit: 'Up to ₹50,000 loan, no collateral',
    typical_amount_paise: 5000000,
    criteria: [
      { type: CRITERION.AGE_MIN, value: 18 },
      { type: CRITERION.HAS_AADHAAR, value: true },
      { type: CRITERION.HAS_BANK_ACCOUNT, value: true },
    ],
    boost_for: ['has_msme:true', 'is_first_business:true'],
    application_url: 'https://www.mudra.org.in',
    documents_required: ['Aadhaar', 'PAN', 'Bank statement (6 months)', 'Business proof', 'Photograph'],
    application_steps: [
      'Approach any bank (SBI, PNB, BoB, HDFC, ICICI all eligible)',
      'Fill the MUDRA application form',
      'Submit documents + business plan (1 page)',
      'Receive sanction within 7-10 working days',
      'Loan amount disbursed to business account',
    ],
    urgency: 'rolling',
    partner_required: false,
  },

  mudra_kishor: {
    id: 'mudra_kishor',
    name: 'PM MUDRA Yojana — Kishor',
    ministry: 'Ministry of Finance / MUDRA',
    category: 'loan',
    summary: 'Collateral-free loan ₹50,000 to ₹5,00,000 for growing micro-enterprises.',
    benefit: '₹50K-5L loan, no collateral',
    typical_amount_paise: 50000000,
    criteria: [
      { type: CRITERION.AGE_MIN, value: 18 },
      { type: CRITERION.HAS_AADHAAR, value: true },
      { type: CRITERION.HAS_BANK_ACCOUNT, value: true },
      { type: CRITERION.MIN_BUSINESS_AGE, value: 6 },
    ],
    boost_for: ['has_msme:true', 'annual_turnover_min:100000'],
    application_url: 'https://www.mudra.org.in',
    documents_required: ['Aadhaar', 'PAN', 'GST cert (if applicable)', 'Bank statement (1 year)', 'Business proof', 'Existing loan history'],
    application_steps: [
      'Approach your existing bank if you have a business account; otherwise nearest PSU bank',
      'Apply through Udyamimitra portal or direct bank branch',
      'Submit financials + repayment plan',
      'Bank assesses and sanctions within 15 working days',
    ],
    urgency: 'rolling',
    partner_required: false,
  },

  standup_india: {
    id: 'standup_india',
    name: 'Stand-Up India',
    ministry: 'Department of Financial Services',
    category: 'loan',
    summary: 'Bank loan ₹10 lakh to ₹1 crore for SC/ST/Women entrepreneurs setting up greenfield enterprises.',
    benefit: '₹10L-1Cr loan, lower interest rate',
    typical_amount_paise: 100000000,
    criteria: [
      { type: CRITERION.AGE_MIN, value: 18 },
      { type: CRITERION.IS_FIRST_BUSINESS, value: true },
      { type: CRITERION.HAS_AADHAAR, value: true },
    ],
    boost_for: ['category:sc', 'category:st', 'gender:female'],
    eligibility_note: 'Applicant must be SC/ST or female. Enterprise must be greenfield (first-time setup) in manufacturing, services or trading.',
    application_url: 'https://www.standupmitra.in',
    documents_required: ['Aadhaar', 'PAN', 'Caste certificate (for SC/ST)', 'Project report', 'Bank statement', 'Educational qualification proof'],
    application_steps: [
      'Register on Stand-Up Mitra portal',
      'Get hand-holding support from designated agency (free)',
      'Prepare detailed project report (DPR)',
      'Apply to scheduled commercial bank',
      'Bank disburses up to 75% of project cost via Stand-Up India + 10% margin from promoter',
    ],
    urgency: 'rolling',
    partner_required: true,
    partner_note: 'A handholding agency assists with the application — this is free and recommended.',
  },

  pm_vishwakarma: {
    id: 'pm_vishwakarma',
    name: 'PM Vishwakarma Yojana',
    ministry: 'Ministry of MSME',
    category: 'comprehensive',
    summary: 'Comprehensive scheme for traditional craftsmen — toolkit incentive ₹15,000, training, loans up to ₹3 lakh at 5% interest, marketing support.',
    benefit: 'Toolkit ₹15K + training + ₹3L loan @ 5%',
    typical_amount_paise: 30000000,
    criteria: [
      { type: CRITERION.AGE_MIN, value: 18 },
      { type: CRITERION.HAS_AADHAAR, value: true },
      { type: CRITERION.CRAFT_CATEGORY, value: ['handicraft', 'handloom', 'gems_jewellery', 'pottery', 'metalwork', 'woodwork', 'leather', 'tailoring'] },
    ],
    boost_for: ['is_first_business:true', 'gender:female'],
    eligibility_note: 'Covers 18 traditional trades including blacksmith, goldsmith, potter, sculptor, cobbler, mason, weaver, tailor, basket-weaver, fisherman, and more.',
    application_url: 'https://pmvishwakarma.gov.in',
    documents_required: ['Aadhaar', 'Bank passbook', 'Mobile number linked to Aadhaar', 'Caste certificate (if applicable)'],
    application_steps: [
      'Register at any Common Service Centre (CSC) — they assist with application',
      'Three-step verification: Gram Panchayat → ULB → State',
      'Receive PM Vishwakarma certificate + ID card',
      'Claim toolkit incentive (₹15,000)',
      'Enrol for skill training (5-day basic, optional 15-day advanced)',
      'Apply for credit support: ₹1 lakh first tranche, ₹2 lakh second tranche after timely repayment',
    ],
    urgency: 'rolling',
    partner_required: false,
  },

  udyam_msme: {
    id: 'udyam_msme',
    name: 'Udyam Registration (MSME)',
    ministry: 'Ministry of MSME',
    category: 'registration',
    summary: 'Free online registration for micro/small/medium enterprises. Unlocks priority sector lending, GeM marketplace access, government tender preferences, and most other scheme eligibility.',
    benefit: 'Foundation for most other schemes; free; permanent',
    typical_amount_paise: 0,    // free registration; gateway to other benefits
    criteria: [
      { type: CRITERION.HAS_AADHAAR, value: true },
      { type: CRITERION.HAS_BANK_ACCOUNT, value: true },
    ],
    boost_for: ['*'],   // applies broadly
    application_url: 'https://udyamregistration.gov.in',
    documents_required: ['Aadhaar', 'PAN', 'Bank IFSC + account number'],
    application_steps: [
      'Visit udyamregistration.gov.in',
      'Choose "For New Entrepreneurs who are not Registered yet as MSME"',
      'Enter Aadhaar — OTP verification',
      'Enter PAN — auto-verified',
      'Fill basic enterprise info (name, type, NIC code, employee count, investment)',
      'Submit — Udyam certificate generated instantly',
    ],
    urgency: 'register before applying for other schemes',
    partner_required: false,
  },

  ambedkar_hastshilp: {
    id: 'ambedkar_hastshilp',
    name: 'Ambedkar Hastshilp Vikas Yojana',
    ministry: 'Office of DC (Handicrafts)',
    category: 'cluster_development',
    summary: 'Cluster-based development for handicraft artisans. Includes design intervention, marketing support, infrastructure, and training. Group/cooperative scheme.',
    benefit: 'Cluster grants up to ₹2.5 crore',
    typical_amount_paise: 2500000000,
    criteria: [
      { type: CRITERION.CRAFT_CATEGORY, value: ['handicraft'] },
    ],
    boost_for: ['has_cooperative:true', 'has_artisan_card:true'],
    eligibility_note: 'Group scheme — applies to clusters of 50+ artisans, cooperatives, or producer companies.',
    application_url: 'https://handicrafts.nic.in',
    documents_required: ['Cooperative registration certificate', 'Cluster mapping document', 'Detailed Project Report (DPR)', 'List of beneficiary artisans with Pehchan IDs'],
    application_steps: [
      'Form a registered cluster organisation (cooperative / producer company / SHG federation)',
      'Empanel a Field Implementing Agency (FIA) — typically an NGO',
      'Prepare DPR with FIA assistance',
      'Submit to the regional DC (Handicrafts) office',
      'Approval cycle: 3-6 months',
    ],
    urgency: 'apply ahead of cluster project window',
    partner_required: true,
    partner_note: 'Requires partnership with a Field Implementing Agency (NGO). The DC (Handicrafts) office maintains a list of empanelled FIAs.',
  },

  geographical_indication: {
    id: 'geographical_indication',
    name: 'GI Tag Registration',
    ministry: 'Department for Promotion of Industry & Internal Trade (DPIIT)',
    category: 'ip_protection',
    summary: 'Geographical Indication registration for region-specific products (Banarasi silk, Mysore silk, Kanchipuram saree, Madhubani painting, etc.). Protects the name; only registered producers can use it.',
    benefit: 'Legal protection of regional craft identity',
    typical_amount_paise: 0,  // registration cost is low; value is reputational/market access
    criteria: [],   // open to producer associations
    boost_for: ['is_cooperative:true'],
    eligibility_note: 'Applied for by associations, cooperatives, or government bodies — not individuals.',
    application_url: 'https://ipindia.gov.in/gi.htm',
    documents_required: ['Constitution of applicant body', 'Geographical map of production area', 'Historical evidence', 'Quality/production manual', 'Inspection methodology'],
    application_steps: [
      'Form a producer association / cooperative if not already',
      'Engage a GI agent or IP lawyer (recommended)',
      'Prepare GI application with manual and evidence',
      'Submit to GI Registry, Chennai',
      'Examination + advertisement + opposition window: 18-24 months',
      'On grant: register as Authorised User to use the GI tag',
    ],
    urgency: 'multi-year process',
    partner_required: true,
    partner_note: 'GI applications need a producer association or registered body — individual artisans cannot apply alone. A GI agent costs ₹50K-2L but materially improves grant chances.',
  },

  nirmaan: {
    id: 'nirmaan',
    name: 'Marketing Support & Services Scheme',
    ministry: 'Office of DC (Handicrafts)',
    category: 'marketing',
    summary: 'Subsidy for participation in domestic and international trade fairs, exhibitions. Up to 75% of stall + travel cost reimbursed.',
    benefit: 'Up to 75% reimbursement for trade fair participation',
    typical_amount_paise: 7500000,
    criteria: [
      { type: CRITERION.IS_ARTISAN_CARD, value: true },
    ],
    boost_for: ['is_cooperative:true', 'has_gi_tag:true'],
    application_url: 'https://handicrafts.nic.in',
    documents_required: ['Pehchan / Artisan ID card', 'Bank details', 'Trade fair invitation/registration', 'Bills for stall/travel (post facto)'],
    application_steps: [
      'Identify eligible trade fair from the DC (Handicrafts) annual calendar',
      'Apply through regional DC (Handicrafts) office in advance',
      'Participate; collect bills',
      'Submit reimbursement claim with proof of participation',
      'Reimbursement disbursed in 30-60 days',
    ],
    urgency: 'apply before the fair, not after',
    partner_required: false,
  },
};

// ════════════════════════════════════════════════════════════
// ELIGIBILITY EVALUATION
// Given a profile, check each scheme's criteria; if ALL criteria pass,
// the scheme is eligible. Boosters give it priority in ranking.
// ════════════════════════════════════════════════════════════

/**
 * Evaluate whether a single criterion is satisfied by the profile.
 * Returns { ok, reason }.
 */
function evaluateCriterion(criterion, profile) {
  const v = (profile && profile[criterionField(criterion.type)]);
  switch (criterion.type) {
    case CRITERION.AGE_MIN:
      if (profile.age === undefined) return { ok: false, reason: 'age not provided' };
      return profile.age >= criterion.value
        ? { ok: true }
        : { ok: false, reason: `age ${profile.age} < min ${criterion.value}` };

    case CRITERION.AGE_MAX:
      if (profile.age === undefined) return { ok: false, reason: 'age not provided' };
      return profile.age <= criterion.value
        ? { ok: true }
        : { ok: false, reason: `age ${profile.age} > max ${criterion.value}` };

    case CRITERION.GENDER:
      if (criterion.value === 'any') return { ok: true };
      if (!profile.gender) return { ok: false, reason: 'gender not provided' };
      return profile.gender === criterion.value
        ? { ok: true }
        : { ok: false, reason: `gender ${profile.gender} != ${criterion.value}` };

    case CRITERION.CATEGORY:
      if (criterion.value === 'any') return { ok: true };
      if (!profile.category) return { ok: false, reason: 'category not provided' };
      return profile.category === criterion.value
        ? { ok: true }
        : { ok: false, reason: `category ${profile.category} != ${criterion.value}` };

    case CRITERION.HAS_AADHAAR:
      return Boolean(profile.has_aadhaar) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `aadhaar required: ${criterion.value}` };

    case CRITERION.HAS_BANK_ACCOUNT:
      return Boolean(profile.has_bank_account) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `bank account required: ${criterion.value}` };

    case CRITERION.HAS_GST:
      return Boolean(profile.has_gst) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `GST status: required ${criterion.value}, have ${profile.has_gst}` };

    case CRITERION.IS_MSME_REGISTERED:
      return Boolean(profile.is_msme_registered) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `MSME registration required: ${criterion.value}` };

    case CRITERION.IS_ARTISAN_CARD:
      return Boolean(profile.is_artisan_card) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `Pehchan/artisan card required: ${criterion.value}` };

    case CRITERION.CRAFT_CATEGORY:
      if (!profile.craft_category) return { ok: false, reason: 'craft category not specified' };
      return criterion.value.includes(profile.craft_category)
        ? { ok: true }
        : { ok: false, reason: `craft "${profile.craft_category}" not in eligible list` };

    case CRITERION.STATE:
      if (!profile.state) return { ok: false, reason: 'state not specified' };
      return criterion.value.includes(profile.state)
        ? { ok: true }
        : { ok: false, reason: `state ${profile.state} not in eligible list` };

    case CRITERION.MIN_BUSINESS_AGE:
      if (profile.business_age_months === undefined) return { ok: false, reason: 'business age not provided' };
      return profile.business_age_months >= criterion.value
        ? { ok: true }
        : { ok: false, reason: `business ${profile.business_age_months}mo < min ${criterion.value}mo` };

    case CRITERION.ANNUAL_TURNOVER_MAX:
      if (profile.annual_turnover_paise === undefined) return { ok: true };  // permissive
      return profile.annual_turnover_paise <= criterion.value
        ? { ok: true }
        : { ok: false, reason: `turnover above ${criterion.value/100} cap` };

    case CRITERION.IS_FIRST_BUSINESS:
      return Boolean(profile.is_first_business) === Boolean(criterion.value)
        ? { ok: true }
        : { ok: false, reason: `first-business required: ${criterion.value}` };

    default:
      return { ok: false, reason: `unknown criterion type: ${criterion.type}` };
  }
}

function criterionField(type) {
  // For most criterion types, the profile field name matches
  const map = { age_min: 'age', age_max: 'age', min_business_age_months: 'business_age_months',
                annual_turnover_max_paise: 'annual_turnover_paise' };
  return map[type] || type;
}

/**
 * Evaluate whether a profile qualifies for a scheme.
 * Returns { eligible, failedCriteria, boostHits, score }.
 */
function evaluateScheme(scheme, profile) {
  const failedCriteria = [];
  for (const c of scheme.criteria || []) {
    const r = evaluateCriterion(c, profile);
    if (!r.ok) failedCriteria.push({ criterion: c.type, reason: r.reason });
  }
  const eligible = failedCriteria.length === 0;

  // Boosters add priority points if matched
  const boostHits = [];
  for (const boost of scheme.boost_for || []) {
    if (boost === '*') { boostHits.push(boost); continue; }
    const [key, value] = boost.split(':');
    if (profile[key] !== undefined) {
      const profVal = String(profile[key]).toLowerCase();
      if (profVal === value.toLowerCase()) boostHits.push(boost);
    }
  }

  // Score (used for ranking): typical_amount + 10K per boost hit
  // Schemes that boost broadly (*) get a small floor
  let score = scheme.typical_amount_paise || 0;
  score += boostHits.length * 1000000;
  if (boostHits.includes('*')) score += 500000;  // foundational schemes

  return { eligible, failedCriteria, boostHits, score };
}

/**
 * Given a profile, return all eligible schemes ranked by score (highest first).
 * Each entry includes the scheme + the eligibility eval.
 */
function findEligibleSchemes(profile) {
  const results = [];
  for (const scheme of Object.values(SCHEMES)) {
    const eval_ = evaluateScheme(scheme, profile);
    if (eval_.eligible) {
      results.push({ scheme, ...eval_ });
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Given a profile, return ALL schemes (eligible + ineligible) with eval
 * results — useful for showing the founder "here's what they don't yet
 * qualify for, and what they'd need to do."
 */
function evaluateAllSchemes(profile) {
  const results = [];
  for (const scheme of Object.values(SCHEMES)) {
    const eval_ = evaluateScheme(scheme, profile);
    results.push({ scheme, ...eval_ });
  }
  // Sort: eligible first (by score desc), then ineligible by score desc
  return results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.score - a.score;
  });
}

/**
 * Build a printable application checklist for a scheme. Used in the
 * founder console to print/share with the artisan.
 */
function applicationChecklist(schemeId) {
  const scheme = SCHEMES[schemeId];
  if (!scheme) throw new Error(`Unknown scheme: ${schemeId}`);
  return {
    scheme: { id: scheme.id, name: scheme.name, ministry: scheme.ministry },
    benefit: scheme.benefit,
    application_url: scheme.application_url,
    documents_required: scheme.documents_required || [],
    application_steps: scheme.application_steps || [],
    partner_required: scheme.partner_required || false,
    partner_note: scheme.partner_note || null,
    urgency: scheme.urgency || 'rolling',
  };
}

module.exports = {
  CRITERION, SCHEMES,
  evaluateCriterion, evaluateScheme,
  findEligibleSchemes, evaluateAllSchemes,
  applicationChecklist,
};
