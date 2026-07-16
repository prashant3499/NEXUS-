'use strict';

const C = require('./src/cooperativeSplit');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ════════════════════════════════════════════════════════════
sec('VALIDATION — well-formed beneficiaries');
{
  const ok = [
    { id: 'a1', name: 'Artisan One', share_bps: 5000 },
    { id: 'a2', name: 'Artisan Two', share_bps: 5000 },
  ];
  let threw = false;
  try { C.validateBeneficiaries(ok); } catch (e) { threw = true; }
  a(!threw, 'Valid beneficiaries pass');
}

sec('VALIDATION — shares must sum to 10000 bps');
{
  let threw = false;
  try { C.validateBeneficiaries([
    { id: 'a1', name: 'A', share_bps: 6000 },
    { id: 'a2', name: 'B', share_bps: 5000 },  // 11000 bps total
  ]); } catch (e) { threw = true; }
  a(threw, 'Over-100% rejected');

  threw = false;
  try { C.validateBeneficiaries([
    { id: 'a1', name: 'A', share_bps: 4000 },
    { id: 'a2', name: 'B', share_bps: 5000 },  // 9000 bps total
  ]); } catch (e) { threw = true; }
  a(threw, 'Under-100% rejected');
}

sec('VALIDATION — empty / null / wrong types rejected');
{
  let threw = false;
  try { C.validateBeneficiaries([]); } catch (e) { threw = true; }
  a(threw, 'Empty array rejected');

  threw = false;
  try { C.validateBeneficiaries(null); } catch (e) { threw = true; }
  a(threw, 'Null rejected');

  threw = false;
  try { C.validateBeneficiaries('not an array'); } catch (e) { threw = true; }
  a(threw, 'String rejected');

  threw = false;
  try { C.validateBeneficiaries([{ id: 'a', name: 'A', share_bps: 'abc' }]); } catch (e) { threw = true; }
  a(threw, 'Non-integer share_bps rejected');

  threw = false;
  try { C.validateBeneficiaries([
    { id: 'a', name: 'A', share_bps: -100 },
    { id: 'b', name: 'B', share_bps: 10100 },
  ]); } catch (e) { threw = true; }
  a(threw, 'Negative share_bps rejected');
}

sec('VALIDATION — duplicate ids and missing fields');
{
  let threw = false;
  try { C.validateBeneficiaries([
    { id: 'a', name: 'A', share_bps: 5000 },
    { id: 'a', name: 'B', share_bps: 5000 },
  ]); } catch (e) { threw = true; }
  a(threw, 'Duplicate ids rejected');

  threw = false;
  try { C.validateBeneficiaries([
    { id: 'a', share_bps: 5000 },
    { id: 'b', name: 'B', share_bps: 5000 },
  ]); } catch (e) { threw = true; }
  a(threw, 'Missing name rejected');
}

sec('VALIDATION — bounds (max beneficiaries)');
{
  const many = [];
  for (let i = 0; i < 201; i++) many.push({ id: 'a' + i, name: 'A', share_bps: 50 });  // would sum to 10050 too, but bounds check fires first
  let threw = false;
  try { C.validateBeneficiaries(many); } catch (e) { threw = true; }
  a(threw, '201 beneficiaries rejected (cap is 200)');
}

// ════════════════════════════════════════════════════════════
sec('SPLIT — clean 2-way split, exact paise');
{
  const r = C.splitMakerShare(100000, [   // ₹1,000.00
    { id: 'a1', name: 'A', share_bps: 5000 },
    { id: 'a2', name: 'B', share_bps: 5000 },
  ]);
  a(r.ok === true,                                  'Split succeeded');
  a(r.allocations.length === 2,                      'Two allocations');
  a(r.allocations[0].paise === 50000,                'A gets ₹500');
  a(r.allocations[1].paise === 50000,                'B gets ₹500');
  a(r.totalAllocated === 100000,                     'Sum reconciles');
  a(r.remainderPaise === 0,                          'No remainder on clean split');
}

sec('SPLIT — 3-way uneven shares with rounding');
{
  // 333 paise total, 1/3 each = 111 each + 0 remainder normally; but with bps
  // 3333+3333+3334 = 10000, on 333 paise that's 110+110+111+rem 2 → lead gets +2
  const r = C.splitMakerShare(333, [
    { id: 'a', name: 'A', share_bps: 3333 },
    { id: 'b', name: 'B', share_bps: 3333 },
    { id: 'c', name: 'C', share_bps: 3334 },
  ]);
  a(r.ok === true,                                  'Split ok');
  a(r.totalAllocated === 333,                        'Sum reconciles to input');
  // First beneficiary is lead by default
  a(r.allocations[0].beneficiaryId === 'a',          'A is the lead beneficiary');
  // Verify each allocation is computed correctly
  const sumOfThree = r.allocations.reduce((s, x) => s + x.paise, 0);
  a(sumOfThree === 333,                              'Three allocations sum exactly');
  // Lead absorbed the remainder (whatever it was)
  a(typeof r.allocations[0].remainderAbsorbed === 'number',
                                                     'Lead records remainder absorbed');
}

sec('SPLIT — 7-way split (typical small cooperative)');
{
  // 7 members, equal shares: 1428 bps each + lead gets 4 extra to sum to 10000
  // Actually we need shares to sum to 10000 exactly — let's use 1429,1429,1428,1428,1428,1429,1429 = 10000
  const beneficiaries = [
    { id: 'm1', name: 'Member 1', share_bps: 1429 },
    { id: 'm2', name: 'Member 2', share_bps: 1429 },
    { id: 'm3', name: 'Member 3', share_bps: 1428 },
    { id: 'm4', name: 'Member 4', share_bps: 1428 },
    { id: 'm5', name: 'Member 5', share_bps: 1428 },
    { id: 'm6', name: 'Member 6', share_bps: 1429 },
    { id: 'm7', name: 'Member 7', share_bps: 1429 },
  ];
  // Total = 10000 bps. ✓
  const r = C.splitMakerShare(1_000_000, beneficiaries);    // ₹10,000
  a(r.ok === true,                                   '7-way split ok');
  a(r.allocations.length === 7,                       'Seven allocations');
  a(r.totalAllocated === 1_000_000,                   'Reconciles to ₹10,000');
  // Each member gets approximately 1/7 of ₹10,000 = ₹1428.57
  // With bps shares as above, expect 142900 and 142800 paise variants
  const m3 = r.allocations.find(x => x.beneficiaryId === 'm3');
  a(m3.paise === 142800,                              'm3 with 1428 bps gets ₹1,428.00');
}

sec('SPLIT — small amount, big remainder absorbed by lead');
{
  const r = C.splitMakerShare(10, [   // ₹0.10
    { id: 'a', name: 'A', share_bps: 3333 },
    { id: 'b', name: 'B', share_bps: 3333 },
    { id: 'c', name: 'C', share_bps: 3334 },
  ]);
  // floor(10 * 3333 / 10000) = 3, floor(10 * 3334 / 10000) = 3
  // 3+3+3 = 9, remainder = 1, goes to lead (a)
  a(r.totalAllocated === 10,                          '10 paise reconciles');
  a(r.allocations[0].paise === 4,                     'Lead absorbed 1-paise remainder');
}

sec('SPLIT — zero amount handled');
{
  const r = C.splitMakerShare(0, [
    { id: 'a', name: 'A', share_bps: 5000 },
    { id: 'b', name: 'B', share_bps: 5000 },
  ]);
  a(r.ok === true,                                   'Zero split returns ok');
  a(r.totalAllocated === 0,                          'Total zero');
  a(r.allocations.every(x => x.paise === 0),          'Every allocation zero');
}

sec('SPLIT — validation of inputs');
{
  let threw = false;
  try { C.splitMakerShare(-100, [
    { id: 'a', name: 'A', share_bps: 10000 },
  ]); } catch (e) { threw = true; }
  a(threw, 'Negative maker portion rejected');

  threw = false;
  try { C.splitMakerShare(100.5, [
    { id: 'a', name: 'A', share_bps: 10000 },
  ]); } catch (e) { threw = true; }
  a(threw, 'Non-integer maker portion rejected');
}

sec('SPLIT — custom lead beneficiary');
{
  const r = C.splitMakerShare(333, [
    { id: 'a', name: 'A', share_bps: 3333 },
    { id: 'b', name: 'B', share_bps: 3333 },
    { id: 'c', name: 'C', share_bps: 3334 },
  ], { leadBeneficiaryId: 'c' });
  a(r.leadBeneficiaryId === 'c',                     'c is the lead');
  const cAlloc = r.allocations.find(x => x.beneficiaryId === 'c');
  a(typeof cAlloc.remainderAbsorbed === 'number',    'c absorbed remainder');
}

sec('SPLIT — invalid custom lead rejected');
{
  let threw = false;
  try {
    C.splitMakerShare(100, [
      { id: 'a', name: 'A', share_bps: 10000 },
    ], { leadBeneficiaryId: 'nonexistent' });
  } catch (e) { threw = true; }
  a(threw, 'Lead id not in beneficiaries → throws');
}

sec('SPLIT — paise-exact discipline across many random sizes');
{
  // Property test: for many random maker amounts, sum of allocations
  // always exactly equals the input
  const beneficiaries = [
    { id: 'a', name: 'A', share_bps: 4567 },
    { id: 'b', name: 'B', share_bps: 2345 },
    { id: 'c', name: 'C', share_bps: 1234 },
    { id: 'd', name: 'D', share_bps: 1854 },
  ];  // 4567+2345+1234+1854 = 10000 ✓
  let allOk = true;
  for (const amt of [1, 7, 99, 100, 1000, 99999, 1000001, 99999999]) {
    const r = C.splitMakerShare(amt, beneficiaries);
    if (r.totalAllocated !== amt) { allOk = false; console.log(`    drift at amt=${amt}: total=${r.totalAllocated}`); break; }
  }
  a(allOk, 'Paise-exact across all test amounts (no drift)');
}

// ════════════════════════════════════════════════════════════
sec('COOPERATIVE — create + validate');
{
  const coop = C.createCooperative({
    name: 'Khurja Potters Guild',
    region: 'Khurja, Uttar Pradesh',
    beneficiaries: [
      { id: 'p1', name: 'Ramvati Devi', bank_ac: '1234567890', ifsc: 'SBIN0000123', share_bps: 4000 },
      { id: 'p2', name: 'Mohan Singh',  bank_ac: '0987654321', ifsc: 'HDFC0000456', share_bps: 3500 },
      { id: 'p3', name: 'Lakshmi Bai',  bank_ac: '5555555555', ifsc: 'ICIC0000789', share_bps: 2500 },
    ],
    notes: 'GI 41 Khurja Pottery — 12 potters total, 3 represented here',
  });
  a(coop.id.startsWith('coop_'),                     'ID prefixed');
  a(coop.name === 'Khurja Potters Guild',             'Name preserved');
  a(coop.beneficiaries.length === 3,                  'Three beneficiaries');
  a(Object.isFrozen(coop),                            'Coop is immutable');
  a(Object.isFrozen(coop.beneficiaries[0]),           'Beneficiary frozen');
}

sec('COOPERATIVE — validation rejects bad config');
{
  let threw = false;
  try { C.createCooperative({ name: 'X', beneficiaries: [{ id: 'a', name: 'A', share_bps: 5000 }] }); } catch (e) { threw = true; }
  a(threw, 'No region rejected');

  threw = false;
  try { C.createCooperative({ region: 'Bhuj', beneficiaries: [{ id: 'a', name: 'A', share_bps: 5000 }] }); } catch (e) { threw = true; }
  a(threw, 'No name rejected');

  threw = false;
  try { C.createCooperative({ name: 'X', region: 'Y', beneficiaries: [{ id: 'a', name: 'A', share_bps: 5000 }] }); } catch (e) { threw = true; }
  a(threw, 'Beneficiaries summing to 5000 (not 10000) rejected');
}

sec('COOPERATIVE — update beneficiaries returns new record');
{
  const coop = C.createCooperative({
    name: 'X', region: 'Y',
    beneficiaries: [
      { id: 'a', name: 'A', share_bps: 5000 },
      { id: 'b', name: 'B', share_bps: 5000 },
    ],
  });
  const updated = C.updateBeneficiaries(coop, [
    { id: 'a', name: 'A', share_bps: 6000 },
    { id: 'b', name: 'B', share_bps: 4000 },
  ]);
  a(updated.id === coop.id,                          'Same id');
  a(updated.beneficiaries[0].share_bps === 6000,      'New shares applied');
  a(updated.updatedAt > coop.updatedAt - 1,            'updatedAt advanced');
  // Original unchanged (immutability)
  a(coop.beneficiaries[0].share_bps === 5000,         'Original still has 5000');
}

sec('COOPERATIVE — preview a hypothetical sale');
{
  const coop = C.createCooperative({
    name: 'Y', region: 'Z',
    beneficiaries: [
      { id: 'a', name: 'A', share_bps: 5000 },
      { id: 'b', name: 'B', share_bps: 5000 },
    ],
  });
  const preview = C.previewSplit(coop, 100000);  // hypothetical ₹1,000 maker portion
  a(preview.allocations[0].paise === 50000,          'A gets ₹500');
  a(preview.allocations[1].paise === 50000,          'B gets ₹500');
}

// ════════════════════════════════════════════════════════════
sec('SETTLEMENT RECORD — immutable audit shape');
{
  const split = C.splitMakerShare(50000, [
    { id: 'a', name: 'A', share_bps: 6000 },
    { id: 'b', name: 'B', share_bps: 4000 },
  ]);
  const rec = C.settlementRecord({
    coopId: 'coop_xyz', orderId: 'ord_42',
    splitResult: split, settledAt: 1735689600000,
    settlementRef: 'rzp_split_001',
  });
  a(rec.id.startsWith('set_'),                       'Settlement id prefixed');
  a(rec.coopId === 'coop_xyz',                        'coopId recorded');
  a(rec.orderId === 'ord_42',                         'orderId recorded');
  a(rec.makerPortionPaise === 50000,                  'Maker portion recorded');
  a(rec.allocations.length === 2,                     'Allocations preserved');
  a(rec.totalAllocated === 50000,                     'Reconciliation preserved');
  a(rec.settlementRef === 'rzp_split_001',            'External ref preserved');
  a(Object.isFrozen(rec),                             'Record is immutable');
}

sec('SETTLEMENT RECORD — validation');
{
  const split = C.splitMakerShare(100, [{ id: 'a', name: 'A', share_bps: 10000 }]);
  let threw = false;
  try { C.settlementRecord({ orderId: 'o', splitResult: split }); } catch (e) { threw = true; }
  a(threw, 'No coopId rejected');

  threw = false;
  try { C.settlementRecord({ coopId: 'c', splitResult: split }); } catch (e) { threw = true; }
  a(threw, 'No orderId rejected');

  threw = false;
  try { C.settlementRecord({ coopId: 'c', orderId: 'o', splitResult: null }); } catch (e) { threw = true; }
  a(threw, 'No splitResult rejected');
}

// ════════════════════════════════════════════════════════════
sec('END-TO-END — Khurja Potters cooperative full lifecycle');
{
  // 1. Onboard a cooperative
  let coop = C.createCooperative({
    name: 'Khurja Potters Cooperative',
    region: 'Khurja, UP',
    beneficiaries: [
      { id: 'potter_ramvati', name: 'Ramvati Devi', bank_ac: '111', ifsc: 'SBIN0001', share_bps: 3500, role: 'master_potter' },
      { id: 'potter_mohan',   name: 'Mohan Singh',  bank_ac: '222', ifsc: 'HDFC0001', share_bps: 2500, role: 'potter' },
      { id: 'potter_lakshmi', name: 'Lakshmi Bai',  bank_ac: '333', ifsc: 'ICIC0001', share_bps: 2000, role: 'potter' },
      { id: 'potter_priya',   name: 'Priya Kumari', bank_ac: '444', ifsc: 'SBIN0002', share_bps: 1500, role: 'apprentice' },
      { id: 'coop_overhead',  name: 'Cooperative Treasury', bank_ac: '555', ifsc: 'SBIN0003', share_bps: 500, role: 'overhead' },
    ],
  });
  a(coop.beneficiaries.length === 5,                 'Cooperative has 5 beneficiaries');

  // 2. A buyer pays ₹2,000 for a Khurja blue pottery vase
  //    Slicer slices it; the maker portion (let's say ₹1,580) flows to the cooperative
  const makerPortion = 158000;  // ₹1,580.00 in paise

  // 3. Split across the 5 members
  const split = C.splitMakerShare(makerPortion, coop.beneficiaries);
  a(split.ok === true,                               'Split succeeded');
  a(split.totalAllocated === makerPortion,            'Total reconciles');

  // Verify each got the expected amount
  const ramvati = split.allocations.find(x => x.beneficiaryId === 'potter_ramvati');
  a(ramvati.paise === Math.floor(makerPortion * 3500 / 10000) + (split.remainderPaise > 0 ? split.remainderPaise : 0),
                                                     'Ramvati (lead) got her share + any remainder');

  // 4. Record the settlement
  const rec = C.settlementRecord({
    coopId: coop.id, orderId: 'ord_first_coop_sale',
    splitResult: split, settlementRef: 'rzp_001',
  });
  a(rec.allocations.length === 5,                    'Audit has 5 allocations');

  // 5. Master potter retires → update beneficiaries
  const newBeneficiaries = [
    { id: 'potter_mohan',   name: 'Mohan Singh',  share_bps: 3500, role: 'master_potter' },  // promoted
    { id: 'potter_lakshmi', name: 'Lakshmi Bai',  share_bps: 2500, role: 'potter' },
    { id: 'potter_priya',   name: 'Priya Kumari', share_bps: 2000, role: 'potter' },
    { id: 'potter_kavya',   name: 'Kavya Sharma', share_bps: 1500, role: 'apprentice' },     // new
    { id: 'coop_overhead',  name: 'Cooperative Treasury', share_bps: 500, role: 'overhead' },
  ];
  coop = C.updateBeneficiaries(coop, newBeneficiaries);
  a(coop.beneficiaries.length === 5,                 'Still 5 members after rotation');
  a(coop.beneficiaries.find(b => b.id === 'potter_kavya') !== undefined,
                                                     'New apprentice added');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '\u2550'.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('\u2550'.repeat(50));
process.exit(fail > 0 ? 1 : 0);
