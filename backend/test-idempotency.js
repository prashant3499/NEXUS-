const assert=require("assert");const idem=require("./src/idempotency");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
idem.reset();
t("first call proceeds",()=>assert.equal(idem.first("pay:o1"),true));
t("duplicate blocked",()=>{assert.equal(idem.first("pay:o1"),false);});
t("different key proceeds",()=>assert.equal(idem.first("pay:o2"),true));
t("guard runs fn once",()=>{idem.reset();let n=0;const r1=idem.guard("payout:o9",()=>{n++;return 500;});const r2=idem.guard("payout:o9",()=>{n++;return 500;});assert.equal(n,1);assert.equal(r1.duplicate,false);assert.equal(r1.result,500);assert.equal(r2.duplicate,true);});
t("missing key throws",()=>assert.throws(()=>idem.first("")));
t("keyFor composes op+id",()=>assert.equal(idem.keyFor("charge","o5"),"charge:o5"));
t("TTL expiry re-allows",()=>{idem.reset();idem.first("k",1);const wait=Date.now()+3;while(Date.now()<wait){}assert.equal(idem.first("k",1),true);});
console.log(pass+" passed, "+fail+" failed");
