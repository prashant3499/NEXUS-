const assert=require("assert");const n=require("./src/notifications");
let pass=0,fail=0;function t(nm,f){try{const r=f();if(r&&r.then)return r.then(()=>pass++).catch(e=>{fail++;console.log("FAIL",nm,e.message);});pass++;}catch(e){fail++;console.log("FAIL",nm,e.message);}}
(async()=>{
delete process.env.MSG_API_KEY; delete process.env.EMAIL_API_KEY;
t("renders EN template with vars",()=>{const r=n.render("order_placed",{oid:"NX-1",maker:"Asha"});assert.ok(r.ok);assert.ok(/NX-1/.test(r.body)&&/Asha/.test(r.body));});
t("renders HI template",()=>{const r=n.render("payout_sent",{oid:"NX-1",amount:"4050",maker:"Asha"},"hi");assert.ok(/4050/.test(r.body));assert.ok(/[\u0900-\u097F]/.test(r.body));});
t("unknown template guarded",()=>assert.ok(!n.render("nope").ok));
await t("send queues in mock (no key)",async()=>{const r=await n.send("order_shipped","+919812345678",{oid:"NX-2"});assert.equal(r.status,"queued");assert.ok(r.body);assert.equal(r.channel,"sms");});
await t("otp queues + returns dev_code in mock",async()=>{const r=await n.sendOtp("+919812345678");assert.ok(r.ok);assert.equal(r.status,"queued");assert.ok(/^[0-9]{6}$/.test(r.dev_code));});
await t("otp does NOT leak code when provider live",async()=>{process.env.MSG_API_KEY="live";global.fetch=async()=>({ok:true});const r=await n.sendOtp("+919812345678");assert.equal(r.status,"sent");assert.ok(!("dev_code"in r));delete process.env.MSG_API_KEY;});
t("status reports channels + config",()=>{const s=n.status();assert.equal(s.channels.length,3);assert.ok("messaging"in s.configured);assert.ok(s.templates>=5);});
t("templates list",()=>assert.ok(n.templates().length>=5));
await t("send never throws on bad input",async()=>{const r=await n.send("otp",null,null);assert.ok(r.id||r.ok===false);});
setTimeout(()=>console.log(pass+" passed, "+fail+" failed"),40);
})();
