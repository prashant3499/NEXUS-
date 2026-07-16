const assert=require("assert");const dr=require("./src/dataRights");const sz=require("./src/sanitize");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
const recs=[{id:"u1",subjectId:"u1",type:"profile",name:"A",phone:"9"},{subjectId:"u1",type:"order",amount:5,name:"A"},{subjectId:"u2",type:"profile",name:"B"}];
t("export returns only subject records",()=>assert.equal(dr.exportData("u1",recs).record_count,2));
t("erasure removes profile PII",()=>{const r=dr.eraseData("u1",recs);assert.equal(r.erased_personal_records,2);});
t("erasure retains anonymised order",()=>{const r=dr.eraseData("u1",recs);assert.equal(r.retained_anonymised,1);const o=r.records.find(x=>x.type==="order");assert.equal(o.name,"[erased]");});
t("erasure leaves others intact",()=>{const r=dr.eraseData("u1",recs);assert.ok(r.records.some(x=>x.subjectId==="u2"&&x.name==="B"));});
t("correction applies patch",()=>{const r=dr.correctData("u1",{cluster:"X"},recs);assert.equal(r.corrected,2);});
t("unknown type guarded",()=>assert.ok(dr.processRequest("bogus","u1",recs).error));
t("escapeHtml",()=>assert.equal(sz.escapeHtml("<b>&'"),"&lt;b&gt;&amp;&#39;"));
t("stripControl",()=>assert.equal(sz.sanitizeString("a\u0000b"),"ab"));
t("sanitizeString caps length",()=>assert.equal(sz.sanitizeString("abcdef",3),"abc"));
t("sanitizeNumber clamps",()=>{assert.equal(sz.sanitizeNumber(99,0,30,12),30);assert.equal(sz.sanitizeNumber("x",0,30,12),12);});
t("isEmail",()=>{assert.ok(sz.isEmail("a@b.co"));assert.ok(!sz.isEmail("nope"));});
t("isPhoneIN",()=>{assert.ok(sz.isPhoneIN("9812345678"));assert.ok(!sz.isPhoneIN("12345"));});
t("sanitizeObject whitelists",()=>{const o=sz.sanitizeObject({name:"  hi  ",price:"999",evil:"x"},{name:{type:"string",max:80},price:{type:"number",min:0,max:100}});assert.equal(o.name,"hi");assert.equal(o.price,100);assert.ok(!("evil"in o));});
console.log(pass+" passed, "+fail+" failed");
