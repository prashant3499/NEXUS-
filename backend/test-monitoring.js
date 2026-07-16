const assert=require("assert");const mon=require("./src/monitoring");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
mon.reset();
t("capture records error",()=>{const e=mon.capture(new Error("boom"),{path:"/x"});assert.equal(e.message,"boom");assert.ok(e.stack);assert.equal(e.context.path,"/x");});
t("capture never throws on junk",()=>{assert.doesNotThrow(()=>mon.capture(null));assert.doesNotThrow(()=>mon.capture("str"));});
t("status reports counts + rate",()=>{mon.reset();mon.recordRequest(200);mon.recordRequest(200);mon.capture(new Error("e"));const s=mon.status();assert.equal(s.requests,2);assert.ok(s.errors>=1);assert.ok("error_rate"in s);assert.ok("uptime_seconds"in s);});
t("recent_errors capped + present",()=>{mon.reset();for(let i=0;i<5;i++)mon.capture(new Error("e"+i));assert.ok(mon.status().recent_errors.length===5);});
t("healthy flag",()=>{mon.reset();mon.recordRequest(200);assert.equal(mon.status().healthy,true);});
t("install idempotent",()=>{assert.doesNotThrow(()=>{mon.install();mon.install();});});
console.log(pass+" passed, "+fail+" failed");
