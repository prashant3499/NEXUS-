'use strict';
const { ControlPlane } = require('./src/control');
let p=0,f=0;const a=(c,m)=>{if(c){p++;console.log('  \u2713 '+m)}else{f++;console.log('  \u2717 FAIL: '+m)}};
const sec=(s)=>console.log('\n\u2501\u2501\u2501 '+s+' \u2501\u2501\u2501\n');

sec('REAL GATE — actions actually HOLD');
let cp=new ControlPlane();
a(cp.gate({agent:'Commerce',summary:'list product',amountPaise:5000}).held===false,'Small routine action proceeds (not held)');
const g=cp.gate({agent:'Finance',summary:'payout ₹3L',amountPaise:300000_00});
a(g.held===true,'₹3L finance action is HELD');
a(cp.pending.length===1,'Held action sits in the pending queue');
a(g.item.reasons[0].includes('2L'),'Reason cites the ₹2L gate');

sec('COMPLIANCE always held');
a(cp.gate({agent:'Compliance',summary:'GST filing'}).held===true,'Every compliance/gov submission is held');

sec('FOUNDER DECIDES — approve/reject with trail');
const dec1=cp.decide(g.item.id,'approved','founder','GJEPC-verified buyer');
a(dec1.status==='awaiting_second','₹3L needs a 2nd approver (two-person on high value)');
const dec=cp.decide(g.item.id,'approved','CA','verified');
a(dec.status==='approved','Founder + CA approve the held item');
a(cp.decisions.length===1,'Decision recorded to trail');
a(cp.pending.find(i=>i.id===g.item.id)===undefined,'Approved item leaves the pending queue');

sec('TWO-PERSON SIGN-OFF for high value');
const big=cp.gate({agent:'Finance',summary:'payout ₹6L',amountPaise:600000_00,recommendation:'approve'});
a(big.item.needs_two_person===true,'₹6L flagged for two-person sign-off');
const first=cp.decide(big.item.id,'approved','founder','ok');
a(first.status==='awaiting_second','One approver is not enough');
const second=cp.decide(big.item.id,'approved','CA','verified');
a(second.status==='approved','Second distinct approver completes it');
a(second.record.decided_by.length===2,'Both approvers recorded');

sec('KILL SWITCH — founder pauses an agent');
cp.pauseAgent('Marketing');
a(cp.gate({agent:'Marketing',summary:'launch ad',amountPaise:1000}).held===true,'Paused agent: even small action is held');
cp.resumeAgent('Marketing');
a(cp.gate({agent:'Marketing',summary:'launch ad',amountPaise:1000}).held===false,'Resumed agent: action flows again');

sec('FORCE-REVIEW a category');
cp.setForceReview('gems',true);
a(cp.gate({agent:'Commerce',summary:'list gem',category:'gems',amountPaise:100}).held===true,'Force-reviewed category is held');
a(cp.gate({agent:'Commerce',summary:'list pot',category:'handicraft',amountPaise:100}).held===false,'Other categories unaffected');

sec('EDITABLE THRESHOLDS (no-code)');
cp.setThreshold('finance_mandatory_paise',500000_00);
a(cp.gate({agent:'Finance',summary:'₹3L',amountPaise:300000_00}).held===false,'After raising gate to ₹5L, ₹3L now flows');
a(cp.gate({agent:'Finance',summary:'₹6L',amountPaise:600000_00}).held===true,'₹6L still held at new gate');

sec('OVERRIDE LEARNING + tamper-proof trail');
let cp2=new ControlPlane();
const o=cp2.gate({agent:'Finance',summary:'x',amountPaise:300000_00,recommendation:'approve'});
cp2.decide(o.item.id,'rejected','founder','too risky');
a(cp2.overrideRate()===1,'Founder rejecting an AI-approve counts as an override');
a(cp2.verifyTrail().valid===true,'Decision trail verifies (hash chain intact)');
// tamper
cp2.decisions[0]={...cp2.decisions[0],decision:'approved'};
a(cp2.verifyTrail().valid===false,'Tampering with a decision is DETECTED');

console.log('\n'+'\u2550'.repeat(50));
console.log('  RESULTS: '+p+' passed, '+f+' failed');
console.log('\u2550'.repeat(50));
process.exit(f>0?1:0);
