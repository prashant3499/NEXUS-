'use strict';

/**
 * test-minor-guardian.js — the child-safety legal core.
 *   - Adult → standard
 *   - Minor + verified guardian → Guardian-MoR (guardian contracts + paid)
 *   - Minor without a valid guardian → BLOCKED
 *   - Unknown age → fails safe (needs_age), never assumed adult
 *   - Guardian validation is strict
 */

const M = require('./src/minorGuardian');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const NOW = new Date('2026-06-01').getTime();
const goodGuardian = { name: 'Sita Devi', age: 40, idVerified: true, relationship: 'mother', consent: true, payoutAccount: 'acct_123' };

sec('Age computation');
{
  a(M.ageFromDob('2000-01-01', NOW) === 26, 'Computes age from DOB');
  a(M.ageFromDob('2010-12-31', NOW) === 15, 'Handles not-yet-had-birthday this year');
  a(M.ageFromDob('garbage') === null, 'Unparseable DOB → null');
  a(M.ageFromDob(null) === null, 'Missing DOB → null');
}

sec('Adult onboards normally');
{
  const r = M.assessParticipant({ age: 25 }, NOW);
  a(r.status === M.STATUS.ADULT, 'Adult → ADULT status');
  a(r.allowed === true, 'Adult allowed');
  a(M.mayTransact(r) === true, 'Adult may transact');
  const byDob = M.assessParticipant({ dob: '1990-05-05' }, NOW);
  a(byDob.status === M.STATUS.ADULT, 'Adult by DOB → ADULT');
}

sec('Minor WITHOUT guardian is blocked (fail safe)');
{
  const r = M.assessParticipant({ age: 15 }, NOW);
  a(r.status === M.STATUS.BLOCKED_MINOR, 'Minor without guardian → BLOCKED');
  a(r.allowed === false, 'Blocked minor not allowed');
  a(M.mayTransact(r) === false, 'Blocked minor may NOT transact');
  a(r.reasons.some(x => /guardian/i.test(x)), 'Explains a guardian is required');
}

sec('Minor WITH verified guardian → Guardian-MoR');
{
  const r = M.assessParticipant({ age: 15, guardian: goodGuardian }, NOW);
  a(r.status === M.STATUS.GUARDIAN_MOR, 'Minor + verified guardian → GUARDIAN_MOR');
  a(r.allowed === true, 'Allowed under guardian');
  a(M.mayTransact(r) === true, 'May transact under guardian');
  a(r.arrangement.payout_to === 'guardian', 'Money routes to the guardian, never the minor');
  a(r.arrangement.contracting_party === 'guardian', 'Guardian is the contracting party');
  a(r.arrangement.minor_age === 15, 'Records the minor age');
}

sec('Guardian validation is strict');
{
  const unverified = M.assessParticipant({ age: 16, guardian: { ...goodGuardian, idVerified: false } }, NOW);
  a(unverified.status === M.STATUS.BLOCKED_MINOR, 'Unverified guardian ID → blocked');
  const minorGuardian = M.assessParticipant({ age: 16, guardian: { ...goodGuardian, age: 16 } }, NOW);
  a(minorGuardian.status === M.STATUS.BLOCKED_MINOR, 'A guardian who is themselves a minor → blocked');
  const noConsent = M.assessParticipant({ age: 16, guardian: { ...goodGuardian, consent: false } }, NOW);
  a(noConsent.status === M.STATUS.BLOCKED_MINOR, 'Guardian without explicit consent → blocked');
  const noPayout = M.assessParticipant({ age: 16, guardian: { ...goodGuardian, payoutAccount: null } }, NOW);
  a(noPayout.status === M.STATUS.BLOCKED_MINOR, 'No guardian payout account → blocked (money can\u2019t reach the minor)');
}

sec('Unknown age fails safe — never assumed adult');
{
  const r = M.assessParticipant({}, NOW);
  a(r.status === M.STATUS.NEEDS_AGE, 'No age/DOB → NEEDS_AGE');
  a(r.allowed === false, 'Cannot proceed without a declared age');
  a(M.mayTransact(r) === false, 'Unknown age may NOT transact');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
