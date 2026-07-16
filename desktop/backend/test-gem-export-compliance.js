'use strict';

const GEC = require('./src/gemExportCompliance');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('MATERIAL NORMALISATION — aliases, partial match, pass-through');
{
  a(GEC.normalizeMaterial('ivory') === 'ivory',                'Direct key matches');
  a(GEC.normalizeMaterial('Elephant Ivory') === 'ivory',       'Alias case-insensitive');
  a(GEC.normalizeMaterial('Tortoise Shell') === 'sea_turtle',  'Tortoise shell alias');
  a(GEC.normalizeMaterial('munga') === 'red_coral',            'Hindi alias munga maps to red coral');
  a(GEC.normalizeMaterial('Oud') === 'agarwood',                'Oud → agarwood');
  a(GEC.normalizeMaterial('rosewood beads') === 'rosewood',     'Partial match against keys');
  a(GEC.normalizeMaterial('shankha') === null,                  'Sacred conch (not CITES) passes through');
  a(GEC.normalizeMaterial('sheesham') === null,                 'Sheesham (rosewood substitute, not CITES) passes through');
  a(GEC.normalizeMaterial('gold') === null,                     'Common materials pass through');
  a(GEC.normalizeMaterial('') === null,                         'Empty string returns null');
  a(GEC.normalizeMaterial(null) === null,                       'Null input returns null');
}

// ────────────────────────────────────────────────────────────
sec('CITES — clean products pass');
{
  const r = GEC.checkCITES({ materials: ['gold', 'silver', '925 silver'] });
  a(r.passes === true,                          'No listed materials → passes');
  a(r.listed_materials.length === 0,             'No listed materials found');
  a(r.blockers.length === 0,                     'No blockers');
}

sec('CITES — Appendix I (ivory) is BLOCKED outright');
{
  const r = GEC.checkCITES({ materials: ['gold', 'ivory inlay'] });
  a(r.passes === false,                         'Ivory blocks the listing');
  a(r.listed_materials.length === 1,             'One listed material found');
  a(r.blockers[0].rule === 'CITES_APPENDIX_I',   'Blocker rule is APPENDIX_I');
  a(/prohibited/i.test(r.blockers[0].reason),    'Reason mentions prohibited');
}

sec('CITES — Appendix II requires permit');
{
  // Red coral without permit → blocked
  const r1 = GEC.checkCITES({ materials: ['red coral beads'] });
  a(r1.passes === false,                                'Red coral without permit blocked');
  a(r1.blockers[0].rule === 'CITES_PERMIT_MISSING',     'Blocker rule is PERMIT_MISSING');

  // Same product with permit → passes
  const r2 = GEC.checkCITES({ materials: ['red coral beads'], cites_permit: 'CITES-IN-2026001' });
  a(r2.passes === true,                                  'Red coral with valid-format permit passes');
  a(r2.warnings.length === 0,                            'No format warning for valid permit');

  // Bad format → passes with warning
  const r3 = GEC.checkCITES({ materials: ['red coral beads'], cites_permit: 'XYZ123' });
  a(r3.passes === true,                                  'Bad-format permit still passes (warning, not blocker)');
  a(r3.warnings.length === 1,                            'Bad-format triggers warning');
  a(r3.warnings[0].rule === 'CITES_PERMIT_FORMAT',       'Warning is PERMIT_FORMAT');
}

sec('CITES — rosewood (post-2017 listing)');
{
  const r = GEC.checkCITES({ materials: ['Dalbergia rosewood handle'] });
  a(r.passes === false,                                  'Rosewood without permit blocked');
  a(r.listed_materials[0].appendix === 'II',             'Rosewood is Appendix II');
}

sec('CITES — multiple listed materials surface all');
{
  const r = GEC.checkCITES({ materials: ['ivory', 'red coral', 'gold'] });
  a(r.passes === false,                                  'Multiple listed → blocked');
  a(r.listed_materials.length === 2,                     'Two listed found (ivory + coral)');
  a(r.blockers.length === 2,                             'Two blockers (one per material)');
}

// ────────────────────────────────────────────────────────────
sec('KIMBERLEY — non-diamond products do not need KPCS');
{
  const r = GEC.checkKimberley({ hs_code: '7113.19', is_rough_diamond: false });
  a(r.passes === true,                       'Non-rough-diamond passes');
  a(r.applies === false,                     'KP does not apply');
}

sec('KIMBERLEY — rough diamond without cert is BLOCKED');
{
  const r = GEC.checkKimberley({ hs_code: '7102.31' });
  a(r.passes === false,                                    'Rough diamond without cert blocked');
  a(r.applies === true,                                    'KP applies');
  a(r.blockers[0].rule === 'KIMBERLEY_CERT_MISSING',       'Blocker rule is CERT_MISSING');
  a(/Mumbai/.test(r.blockers[0].reason),                   'Reason points to Mumbai Designated Office');
}

sec('KIMBERLEY — explicit is_rough_diamond flag also triggers');
{
  const r = GEC.checkKimberley({ hs_code: '9999.99', is_rough_diamond: true });
  a(r.passes === false,                                    'Explicit flag triggers KP check');
}

sec('KIMBERLEY — valid cert format passes');
{
  const r = GEC.checkKimberley({
    hs_code: '7102.31',
    kimberley_cert: 'KP-IN-20260101-0042',
  });
  a(r.passes === true,                                     'Valid KP cert passes');
  a(r.warnings.length === 0,                               'No warnings');
}

sec('KIMBERLEY — bad cert format passes with warning');
{
  const r = GEC.checkKimberley({
    hs_code: '7102.31',
    kimberley_cert: 'KP-12345',
  });
  a(r.passes === true,                                     'Bad-format cert: not a blocker');
  a(r.warnings.length === 1,                               'Bad-format triggers warning');
}

// ────────────────────────────────────────────────────────────
sec('BIS HALLMARK — valid gold');
{
  const r = GEC.validateBISHallmark({
    metal: 'gold', caratage_or_fineness: '22K',
    huid: 'AZ12B3', jeweller_code: 'JR-12345', ahc_code: 'AHC-007',
  });
  a(r.valid === true,                            'Valid gold hallmark passes');
  a(r.huid === 'AZ12B3',                          'HUID normalised to uppercase');
  a(r.errors.length === 0,                        'No errors');
}

sec('BIS HALLMARK — invalid caratage');
{
  const r = GEC.validateBISHallmark({
    metal: 'gold', caratage_or_fineness: '21K', huid: 'AZ12B3',
  });
  a(r.valid === false,                            '21K is not a valid caratage');
  a(r.errors.some(e => e.field === 'caratage'),   'Error names caratage field');
}

sec('BIS HALLMARK — silver fineness');
{
  const ok  = GEC.validateBISHallmark({ metal: 'silver', caratage_or_fineness: '925', huid: 'SI9251' });
  a(ok.valid === true,                            '925 silver passes');

  const bad = GEC.validateBISHallmark({ metal: 'silver', caratage_or_fineness: '950', huid: 'SI9501' });
  a(bad.valid === false,                          '950 silver (not in approved list) fails');
}

sec('BIS HALLMARK — HUID format');
{
  const r1 = GEC.validateBISHallmark({ metal: 'gold', caratage_or_fineness: '22K', huid: 'ABC12' });
  a(r1.valid === false,                           '5-char HUID rejected (must be 6)');
  a(r1.errors.some(e => e.field === 'huid'),       'Error names huid field');

  const r2 = GEC.validateBISHallmark({ metal: 'gold', caratage_or_fineness: '22K', huid: 'ABC1234' });
  a(r2.valid === false,                            '7-char HUID rejected');

  const r3 = GEC.validateBISHallmark({ metal: 'gold', caratage_or_fineness: '22K', huid: 'abc12b' });
  a(r3.valid === true,                             'Lowercase HUID accepted (normalised)');

  const r4 = GEC.validateBISHallmark({ metal: 'gold', caratage_or_fineness: '22K', huid: 'AB-12C' });
  a(r4.valid === false,                            'HUID with hyphen rejected');
}

sec('BIS HALLMARK — missing optional fields give warnings');
{
  const r = GEC.validateBISHallmark({
    metal: 'gold', caratage_or_fineness: '22K', huid: 'AZ12B3',
  });
  a(r.valid === true,                              'Missing optional fields still valid');
  a(r.warnings.length === 2,                        'Two warnings (jeweller_code + ahc_code)');
}

// ────────────────────────────────────────────────────────────
sec('GEM CERTIFICATE — GIA format');
{
  const ok  = GEC.validateGemCertificate({ lab: 'GIA', report_number: '2185000123' });
  a(ok.valid === true,                              '10-digit GIA report passes');
  a(ok.verify_url.includes('gia.edu'),              'verify_url returned for valid cert');
  a(ok.audit_hash.startsWith('h'),                   'Audit hash produced');

  const bad = GEC.validateGemCertificate({ lab: 'GIA', report_number: '12345' });
  a(bad.valid === false,                            'Short number fails GIA format');
}

sec('GEM CERTIFICATE — IGI format');
{
  const a1 = GEC.validateGemCertificate({ lab: 'IGI', report_number: '4851392127' });
  a(a1.valid === true,                              '10-digit IGI passes');

  const a2 = GEC.validateGemCertificate({ lab: 'IGI', report_number: 'LG1234567' });
  a(a2.valid === true,                              'LG-prefix IGI (lab grown) passes');
}

sec('GEM CERTIFICATE — unknown lab rejected');
{
  const r = GEC.validateGemCertificate({ lab: 'XYZ', report_number: '12345' });
  a(r.valid === false,                              'Unknown lab rejected');
  a(r.errors.some(e => /Unknown lab/i.test(e.reason)), 'Error names unknown lab');
}

sec('GEM CERTIFICATE — missing fields');
{
  const noLab = GEC.validateGemCertificate({ report_number: '12345' });
  a(noLab.valid === false,                          'Missing lab rejected');

  const noNum = GEC.validateGemCertificate({ lab: 'GIA' });
  a(noNum.valid === false,                          'Missing report_number rejected');
}

// ────────────────────────────────────────────────────────────
sec('PRE-FLIGHT — clean gold jewellery export passes');
{
  const product = {
    materials: ['gold'],
    hs_code: '7113.19',
    bis_hallmark: { metal: 'gold', caratage_or_fineness: '22K', huid: 'AZ12B3' },
    gem_certificate: { lab: 'GIA', report_number: '2185000123' },
  };
  const r = GEC.preflightExport(product);
  a(r.allowed === true,                              'Clean export passes preflight');
  a(r.blockers.length === 0,                         'No blockers');
  a(r.checks.cites.passes === true,                  'CITES check passes');
  a(r.checks.kimberley.applies === false,             'Kimberley does not apply (not rough diamond)');
  a(r.checks.bis.valid === true,                      'BIS valid');
  a(r.checks.gem_cert.valid === true,                 'Gem cert valid');
}

sec('PRE-FLIGHT — ivory inlay is BLOCKED even with all other docs perfect');
{
  const product = {
    materials: ['gold', 'ivory inlay'],
    hs_code: '7113.19',
    bis_hallmark: { metal: 'gold', caratage_or_fineness: '22K', huid: 'AZ12B3' },
  };
  const r = GEC.preflightExport(product);
  a(r.allowed === false,                              'Ivory blocks the export');
  a(r.blockers.some(b => b.rule === 'CITES_APPENDIX_I'), 'Blocker is CITES_APPENDIX_I');
}

sec('PRE-FLIGHT — rough diamond without KP cert is BLOCKED');
{
  const product = {
    materials: ['diamond'],
    hs_code: '7102.31',
    is_rough_diamond: true,
  };
  const r = GEC.preflightExport(product);
  a(r.allowed === false,                              'Rough diamond without KP blocked');
  a(r.blockers.some(b => b.rule === 'KIMBERLEY_CERT_MISSING'), 'Blocker is KIMBERLEY_CERT_MISSING');
}

sec('PRE-FLIGHT — multiple blockers all surfaced');
{
  const product = {
    materials: ['ivory', 'red coral'],     // 1 Appendix I + 1 Appendix II without permit
    hs_code: '7102.31',                     // and rough diamond HS
  };
  const r = GEC.preflightExport(product);
  a(r.allowed === false,                              'Multiple violations blocked');
  a(r.blockers.length >= 3,                            '≥3 blockers (ivory + coral + KP)');
  // verify the blocker types
  const rules = new Set(r.blockers.map(b => b.rule));
  a(rules.has('CITES_APPENDIX_I'),                     'Ivory rule present');
  a(rules.has('CITES_PERMIT_MISSING'),                 'Coral permit-missing rule present');
  a(rules.has('KIMBERLEY_CERT_MISSING'),               'Kimberley rule present');
}

sec('PRE-FLIGHT — invalid BIS hallmark is a warning, not a blocker (export context)');
{
  const product = {
    materials: ['gold'],
    bis_hallmark: { metal: 'gold', caratage_or_fineness: '21K', huid: 'BAD' },  // both invalid
  };
  const r = GEC.preflightExport(product);
  a(r.allowed === true,                                'Bad BIS does not block export (foreign market)');
  a(r.warnings.length > 0,                              'Warnings recorded');
  a(r.warnings.some(w => w.rule === 'BIS_HALLMARK_INVALID'), 'BIS warnings tagged');
}

// ────────────────────────────────────────────────────────────
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
