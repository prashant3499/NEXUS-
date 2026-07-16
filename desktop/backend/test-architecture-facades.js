const assert=require("assert");
const ss=require("./src/statusSelector"), psm=require("./src/paymentStateMachine"), ce=require("./src/complianceEngine");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
// statusSelector
t("4 statuses",()=>assert.equal(ss.STATUSES.length,4));
t("unregistered => MoR + TCS",()=>{const p=ss.profile("unregistered");assert.ok(p.mor_required);assert.ok(p.tcs_applies);});
t("institution => no TCS, export ready",()=>{const p=ss.profile("institution");assert.ok(!p.tcs_applies);assert.ok(p.export_ready);});
t("unknown status normalizes safe",()=>assert.equal(ss.profile("alien").status,"unregistered"));
t("treat delegates to slicer (integrity holds)",()=>{const r=ss.treat("gst_registered",5000);assert.ok(r.integrity);assert.ok(r.slices.seller_payout>0);});
// paymentStateMachine
t("payment starts pending",()=>assert.equal(psm.create("o1",500000).status,"pending"));
t("legal payment path",()=>{let p=psm.create("o1",500000);for(const s of ["authorized","captured","settled"]){const r=psm.transition(p,s);assert.ok(r.ok,s);p=r.payment;}assert.equal(p.history.length,3);});
t("illegal payment transition refused",()=>{const p=psm.create("o1",5);assert.ok(!psm.transition(p,"settled").ok);});
t("failed is terminal",()=>{let p=psm.create("o1",5);p=psm.transition(p,"failed").payment;assert.ok(!psm.transition(p,"authorized").ok);});
t("refund allowed from captured/settled",()=>{let p=psm.create("o1",5);p=psm.transition(p,"authorized").payment;p=psm.transition(p,"captured").payment;assert.ok(psm.transition(p,"refunded").ok);});
// complianceEngine facade
t("screenListing flags ivory",()=>{assert.ok(!ce.screenListing({title:"ivory idol"}).allowed);});
t("screenListing permits clean",()=>{assert.ok(ce.screenListing({title:"blue pottery"}).allowed);});
t("notice + takedown via facade",()=>{let n=ce.fileNotice({listingId:"p1"});n=ce.actOnNotice(n,"takedown","officer");assert.equal(n.status,"content_removed");});
t("dpdp request via facade",()=>{const r=ce.dataRequest("erasure","u1",[{subjectId:"u1",type:"profile",name:"A"}]);assert.ok(r.erased_personal_records>=1);});
t("posture summary complete",()=>{const p=ce.posture();assert.ok(p.prohibited_categories>=6);assert.equal(p.invariants.length,5);assert.ok(p.dpdp_rights.length>=3);});
console.log(pass+" passed, "+fail+" failed");
