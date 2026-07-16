const assert=require("assert");const cp=require("./src/contentPolicy");const dc=require("./src/dataCrypto");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
t("clean listing permitted",()=>{const r=cp.screenListing({title:"Blue pottery vase",material:"ceramic"});assert.ok(r.allowed);assert.equal(r.action,"permit");});
t("ivory flagged + held",()=>{const r=cp.screenListing({title:"Ivory carved figurine"});assert.ok(!r.allowed);assert.equal(r.action,"hold_for_review");assert.ok(r.flags.some(f=>f.category==="wildlife"));});
t("antique flagged",()=>{const r=cp.screenListing({title:"Ancient temple idol, 100 years old"});assert.ok(!r.allowed);});
t("replica flagged as counterfeit",()=>{const r=cp.screenListing({title:"First copy replica bag"});assert.ok(r.flags.some(f=>f.category==="counterfeit"));});
t("prohibited catalog has laws",()=>{const c=cp.prohibitedCatalog();assert.ok(c.length>=6);assert.ok(c.every(x=>x.law));});
t("notice sets statutory windows",()=>{const n=cp.fileNotice({listingId:"p1",type:"counterfeit"});assert.equal(n.status,"received");assert.ok(n.ackDueBy);assert.ok(n.resolveDueBy);});
t("takedown logs + preserves safe harbor",()=>{let n=cp.fileNotice({listingId:"p1"});n=cp.actOnNotice(n,"takedown","officer");assert.equal(n.status,"content_removed");assert.ok(n.safe_harbor);assert.ok(n.log.length>=2);});
t("invalid action guarded",()=>{const n=cp.fileNotice({});assert.ok(cp.actOnNotice(n,"bogus").error);});
t("encrypt/decrypt round-trips",()=>{const e=dc.encrypt("Asha Devi +919812345678");assert.notEqual(e.data,"Asha Devi");assert.equal(dc.decrypt(e),"Asha Devi +919812345678");});
t("tamper detected (GCM auth)",()=>{const e=dc.encrypt("secret");e.data=Buffer.from("tampered").toString("base64");assert.throws(()=>dc.decrypt(e));});
t("encryptRecord hides PII, keeps rest",()=>{const r=dc.encryptRecord({name:"A",phone:"9",cluster:"Khurja"});assert.equal(r.cluster,"Khurja");assert.ok(r.name.data&&r.name.iv);});
t("dev key reports insecure",()=>{assert.equal(typeof dc.isSecure(),"boolean");});
console.log(pass+" passed, "+fail+" failed");
