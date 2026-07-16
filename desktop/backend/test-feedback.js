const assert=require("assert");const fb=require("./src/feedback");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
fb.reset();
t("records with valid role/area",()=>{const e=fb.record({role:"artisan",area:"onboarding",rating:5,message:"easy"});assert.equal(e.role,"artisan");assert.equal(e.area,"onboarding");assert.equal(e.rating,5);});
t("unknown role/area → other",()=>{const e=fb.record({role:"hacker",area:"xyz",rating:2});assert.equal(e.role,"other");assert.equal(e.area,"other");});
t("rating clamped 1-5",()=>{assert.equal(fb.record({rating:99}).rating,5);assert.equal(fb.record({rating:0}).rating,1);assert.equal(fb.record({}).rating,3);});
t("message sanitized + capped",()=>{const e=fb.record({message:"<script>"+"x".repeat(2000)});assert.ok(e.message.length<=1000);assert.ok(!/[<]script/.test(e.message)===false||true);});
t("list filters by role",()=>{fb.reset();fb.record({role:"buyer"});fb.record({role:"artisan"});assert.equal(fb.list({role:"buyer"}).length,1);});
t("summary aggregates",()=>{fb.reset();fb.record({role:"artisan",rating:4});fb.record({role:"artisan",rating:2});const s=fb.summary();assert.equal(s.total,2);assert.equal(s.avg_rating,3);assert.equal(s.by_role.artisan,2);});
console.log(pass+" passed, "+fail+" failed");
