const assert=require("assert");const ra=require("./src/researchAgent");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
ra.reset();
t("topics list seeded",()=>{const ts=ra.topics();assert.ok(ts.length>=1);assert.ok(ts[0].title.length>5);});
t("research finds ICD facts",()=>{const r=ra.research("ICD Jaipur export");assert.ok(r.matched>=1);const all=JSON.stringify(r.results);assert.ok(/Thar Dry Port/.test(all));assert.ok(/Mundra 628/.test(all));});
t("nexus_use routing present",()=>{const r=ra.research("icd");assert.ok(/ICD Jaipur/.test(r.results[0].nexus_use));assert.ok(/Mundra/.test(r.results[0].nexus_use));});
t("no-match gives guidance",()=>{const r=ra.research("zzzqqq");assert.equal(r.matched,0);assert.ok(r.note);});
t("addFinding stores + sanitizes",()=>{const a=ra.addFinding({topic:"kota",finding:"<b>ICD Kota LCL weekly</b>",src:"visit"});assert.ok(a.ok);assert.ok(a.entry.finding.length>0);});
t("empty finding rejected",()=>assert.ok(!ra.addFinding({topic:"x"}).ok));
t("runtime findings surfaced in research",()=>{const r=ra.research("kota");assert.ok(r.runtime_findings.length>=1);});
console.log(pass+" passed, "+fail+" failed");
