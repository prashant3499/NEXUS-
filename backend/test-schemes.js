'use strict';

const S = require('./src/schemes');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ════════════════════════════════════════════════════════════
sec('REGISTRY — well-formed scheme entries');
{
  a('pmkvy' in S.SCHEMES,                          'PMKVY present');
  a('mudra_shishu' in S.SCHEMES,                   'MUDRA Shishu present');
  a('mudra_kishor' in S.SCHEMES,                   'MUDRA Kishor present');
  a('standup_india' in S.SCHEMES,                  'Stand-Up India present');
  a('pm_vishwakarma' in S.SCHEMES,                 'PM Vishwakarma present');
  a('udyam_msme' in S.SCHEMES,                     'Udyam (MSME) registration present');
  a('ambedkar_hastshilp' in S.SCHEMES,             'Ambedkar Hastshilp present');
  a('geographical_indication' in S.SCHEMES,         'GI registration present');
  a('nirmaan' in S.SCHEMES,                        'Marketing support scheme present');
  a(Object.keys(S.SCHEMES).length >= 9,            'At least 9 schemes registered');

  // Each scheme has the required fields
  for (const [k, sc] of Object.entries(S.SCHEMES)) {
    a(typeof sc.name === 'string' && sc.name.length > 0, `${k}: has name`);
    a(typeof sc.ministry === 'string',              `${k}: has ministry`);
    a(typeof sc.application_url === 'string',        `${k}: has application URL`);
    a(Array.isArray(sc.criteria),                    `${k}: criteria is array`);
    a(Array.isArray(sc.documents_required || []),    `${k}: documents_required is array`);
    a(Array.isArray(sc.application_steps || []),     `${k}: application_steps is array`);
  }
}

// ════════════════════════════════════════════════════════════
sec('CRITERION — age min/max');
{
  const cMin = { type: S.CRITERION.AGE_MIN, value: 18 };
  a(S.evaluateCriterion(cMin, { age: 25 }).ok === true,  'age 25 passes min 18');
  a(S.evaluateCriterion(cMin, { age: 17 }).ok === false, 'age 17 fails min 18');
  a(S.evaluateCriterion(cMin, {}).ok === false,           'missing age fails');

  const cMax = { type: S.CRITERION.AGE_MAX, value: 45 };
  a(S.evaluateCriterion(cMax, { age: 30 }).ok === true,  'age 30 passes max 45');
  a(S.evaluateCriterion(cMax, { age: 50 }).ok === false, 'age 50 fails max 45');
}

sec('CRITERION — gender, category, boolean flags');
{
  const cGender = { type: S.CRITERION.GENDER, value: 'female' };
  a(S.evaluateCriterion(cGender, { gender: 'female' }).ok === true,  'female passes');
  a(S.evaluateCriterion(cGender, { gender: 'male' }).ok === false,    'male fails female criterion');

  const cAny = { type: S.CRITERION.GENDER, value: 'any' };
  a(S.evaluateCriterion(cAny, { gender: 'male' }).ok === true,        'any gender passes');
  a(S.evaluateCriterion(cAny, {}).ok === true,                         'missing gender passes "any"');

  const cAadhaar = { type: S.CRITERION.HAS_AADHAAR, value: true };
  a(S.evaluateCriterion(cAadhaar, { has_aadhaar: true }).ok === true,  'has aadhaar passes');
  a(S.evaluateCriterion(cAadhaar, { has_aadhaar: false }).ok === false,'no aadhaar fails');

  const cFirst = { type: S.CRITERION.IS_FIRST_BUSINESS, value: true };
  a(S.evaluateCriterion(cFirst, { is_first_business: true }).ok === true,   'first-time business passes');
  a(S.evaluateCriterion(cFirst, { is_first_business: false }).ok === false, 'existing business fails');
}

sec('CRITERION — craft category list match');
{
  const c = { type: S.CRITERION.CRAFT_CATEGORY, value: ['handicraft', 'handloom', 'pottery'] };
  a(S.evaluateCriterion(c, { craft_category: 'pottery' }).ok === true,    'pottery in list passes');
  a(S.evaluateCriterion(c, { craft_category: 'handicraft' }).ok === true, 'handicraft in list passes');
  a(S.evaluateCriterion(c, { craft_category: 'jewellery' }).ok === false, 'jewellery not in list fails');
  a(S.evaluateCriterion(c, {}).ok === false,                              'missing craft fails');
}

sec('CRITERION — business age + turnover');
{
  const cAge = { type: S.CRITERION.MIN_BUSINESS_AGE, value: 6 };
  a(S.evaluateCriterion(cAge, { business_age_months: 12 }).ok === true,  '12mo passes min 6');
  a(S.evaluateCriterion(cAge, { business_age_months: 3 }).ok === false,  '3mo fails min 6');

  const cTurn = { type: S.CRITERION.ANNUAL_TURNOVER_MAX, value: 25000000 };  // ₹2.5L
  a(S.evaluateCriterion(cTurn, { annual_turnover_paise: 1000000 }).ok === true, '₹10K below ₹2.5L cap passes');
  a(S.evaluateCriterion(cTurn, { annual_turnover_paise: 30000000 }).ok === false, '₹3L above ₹2.5L cap fails');
  a(S.evaluateCriterion(cTurn, {}).ok === true,                                   'missing turnover passes (permissive)');
}

// ════════════════════════════════════════════════════════════
sec('SCHEME EVAL — undocumented Karigar (no GST, no IEC, has Aadhaar)');
{
  const profile = {
    age: 32, gender: 'female', category: 'obc',
    has_aadhaar: true, has_bank_account: true,
    has_gst: false, is_msme_registered: false,
    is_artisan_card: false, craft_category: 'pottery',
    state: 'UP', is_first_business: true,
  };
  // Should qualify for Vishwakarma, PMKVY, Mudra Shishu, Udyam, but not Mudra Kishor (no business history)
  const vish = S.evaluateScheme(S.SCHEMES.pm_vishwakarma, profile);
  a(vish.eligible === true,                       'PM Vishwakarma: eligible (pottery is on the list)');

  const pmkvy = S.evaluateScheme(S.SCHEMES.pmkvy, profile);
  a(pmkvy.eligible === true,                       'PMKVY: eligible (age 32 in 15-45)');

  const shishu = S.evaluateScheme(S.SCHEMES.mudra_shishu, profile);
  a(shishu.eligible === true,                       'MUDRA Shishu: eligible (no business age required)');

  const udyam = S.evaluateScheme(S.SCHEMES.udyam_msme, profile);
  a(udyam.eligible === true,                        'Udyam: eligible (just needs Aadhaar + bank)');

  const kishor = S.evaluateScheme(S.SCHEMES.mudra_kishor, profile);
  a(kishor.eligible === false,                      'MUDRA Kishor: NOT eligible (no business_age_months)');
}

sec('SCHEME EVAL — older artisan (50yo) excluded from PMKVY');
{
  const profile = {
    age: 50, gender: 'male',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'handicraft',
  };
  const pmkvy = S.evaluateScheme(S.SCHEMES.pmkvy, profile);
  a(pmkvy.eligible === false,                     'PMKVY: age 50 > max 45 → not eligible');
  a(pmkvy.failedCriteria.some(f => f.criterion === S.CRITERION.AGE_MAX), 'age_max in failed criteria');

  const vish = S.evaluateScheme(S.SCHEMES.pm_vishwakarma, profile);
  a(vish.eligible === true,                        'Vishwakarma: no max age → still eligible');
}

sec('SCHEME EVAL — female applicant gets boost on relevant schemes');
{
  const female = {
    age: 28, gender: 'female', category: 'sc',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'handicraft', is_first_business: true,
  };
  const standup = S.evaluateScheme(S.SCHEMES.standup_india, female);
  a(standup.eligible === true,                    'Stand-Up India: eligible');
  a(standup.boostHits.includes('gender:female'),   'Female boost matched');
  a(standup.boostHits.includes('category:sc'),     'SC boost matched');
  a(standup.boostHits.length >= 2,                  'Multiple boosts');
}

sec('SCHEME EVAL — score is higher with more boosts');
{
  const withBoosts = {
    age: 25, gender: 'female', category: 'st',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'handicraft', is_first_business: true,
  };
  const noBoosts = {
    age: 25, gender: 'male', category: 'general',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'handicraft', is_first_business: true,
  };
  const sBoosts = S.evaluateScheme(S.SCHEMES.standup_india, withBoosts).score;
  const sNoBoosts = S.evaluateScheme(S.SCHEMES.standup_india, noBoosts).score;
  a(sBoosts > sNoBoosts,                          'Boosted profile scores higher');
}

// ════════════════════════════════════════════════════════════
sec('FIND ELIGIBLE — returns ranked list');
{
  const profile = {
    age: 30, gender: 'female', category: 'general',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'pottery', is_first_business: true,
  };
  const ranked = S.findEligibleSchemes(profile);
  a(ranked.length >= 4,                           'At least 4 schemes eligible for this profile');
  a(ranked.every(r => r.eligible === true),        'All returned are eligible');
  // Higher score first
  for (let i = 1; i < ranked.length; i++) {
    a(ranked[i-1].score >= ranked[i].score,        `Rank ${i-1} >= rank ${i} score`);
  }
}

sec('FIND ELIGIBLE — empty profile produces nearly no matches');
{
  const empty = S.findEligibleSchemes({});
  // Most schemes need at least aadhaar+bank, so this should be very small
  a(empty.length <= 2,                            'Empty profile matches almost nothing');
}

sec('EVALUATE ALL — eligible before ineligible');
{
  const profile = {
    age: 70,   // too old for PMKVY
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'pottery',
  };
  const all = S.evaluateAllSchemes(profile);
  a(all.length === Object.keys(S.SCHEMES).length, 'All schemes returned');
  // Eligible ones come first
  let seenIneligible = false, ordered = true;
  for (const r of all) {
    if (!r.eligible) seenIneligible = true;
    if (seenIneligible && r.eligible) { ordered = false; break; }
  }
  a(ordered,                                       'Eligible schemes come first');
}

// ════════════════════════════════════════════════════════════
sec('APPLICATION CHECKLIST — generates full procedure');
{
  const checklist = S.applicationChecklist('pm_vishwakarma');
  a(checklist.scheme.id === 'pm_vishwakarma',      'Scheme id preserved');
  a(checklist.scheme.name.includes('Vishwakarma'), 'Name preserved');
  a(typeof checklist.application_url === 'string', 'URL provided');
  a(Array.isArray(checklist.documents_required),   'Documents list');
  a(checklist.documents_required.includes('Aadhaar'), 'Aadhaar in document list');
  a(Array.isArray(checklist.application_steps),    'Steps list');
  a(checklist.application_steps.length >= 3,        'Multiple steps');
}

sec('APPLICATION CHECKLIST — partner_required for Stand-Up + GI');
{
  const su = S.applicationChecklist('standup_india');
  a(su.partner_required === true,                  'Stand-Up requires partner');
  a(typeof su.partner_note === 'string',           'Partner note provided');

  const gi = S.applicationChecklist('geographical_indication');
  a(gi.partner_required === true,                  'GI requires partner (producer association)');
}

sec('APPLICATION CHECKLIST — unknown scheme throws');
{
  let threw = false;
  try { S.applicationChecklist('nonexistent_scheme'); } catch (e) { threw = true; }
  a(threw,                                         'Unknown scheme throws');
}

// ════════════════════════════════════════════════════════════
sec('END-TO-END — Karigar onboarding pitch');
{
  // Realistic Karigar tier prospect: undocumented woman artisan from UP
  const ramvati = {
    age: 38, gender: 'female', category: 'obc',
    has_aadhaar: true, has_bank_account: true,
    has_gst: false, is_msme_registered: false,
    is_artisan_card: false, craft_category: 'pottery',
    state: 'UP', is_first_business: true,
  };

  const eligible = S.findEligibleSchemes(ramvati);
  a(eligible.length >= 4,                          'Ramvati qualifies for 4+ schemes');

  // Top scheme should be high-value
  const top = eligible[0];
  a(top.scheme.typical_amount_paise > 0,           'Top scheme has substantial value');

  // Generate checklist for the top one
  const checklist = S.applicationChecklist(top.scheme.id);
  a(checklist.scheme.id === top.scheme.id,         'Checklist matches top scheme');
  a(checklist.documents_required.length > 0,       'Documents enumerated for application');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
