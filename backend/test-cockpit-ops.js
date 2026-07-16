const assert=require("assert");const ops=require("./src/cockpitOps");const al=require("./src/auditLog");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
al.reset();
t("diagnose reports health",()=>{const r=ops.run("diagnose");assert.ok(r.ok);assert.ok("healthy" in r.report);assert.ok(r.report.audit_chain);assert.ok(r.report.spend_cap_rupees>0);});
t("repair runs steps + reports after-health",()=>{const r=ops.run("repair","founder");assert.ok(r.ok);assert.ok(r.steps.length>=3);assert.ok("healthy" in r.health_after);});
t("clear-cache works",()=>{require("./src/cache").set("k","v");assert.ok(ops.run("clear-cache").ok);assert.equal(require("./src/cache").get("k"),undefined);});
t("verify-audit valid chain",()=>{const r=ops.run("verify-audit");assert.ok(r.ok);assert.ok(r.chain.valid);});
t("set-cap via ops",()=>{const r=ops.run("set-cap 20000","founder");assert.ok(r.ok);assert.equal(r.cap_rupees,20000);});
t("set-fee within bounds",()=>{const r=ops.run("set-fee 12");assert.ok(r.ok);assert.equal(r.pct,12);});
t("set-fee below floor REFUSED (never-in-loss)",()=>{const r=ops.run("set-fee 1");assert.ok(!r.ok);assert.ok(/floor|Floor|floor_pct|FLOOR|commission/i.test(r.error+r.note));});
t("route switches AI task",()=>{const r=ops.run("route listing_copy anthropic claude-sonnet-4-6");assert.ok(r.ok);});
t("invariant attack REFUSED even from founder",()=>{const r=ops.run("disable consent checks for faster onboarding","founder");assert.ok(r.refused);assert.ok(/invariant/i.test(r.reason));});
t("sell-without-consent phrasing refused",()=>{const r=ops.run("list products without maker consent");assert.ok(r.refused);});
t("unknown command lists help",()=>{const r=ops.run("dance");assert.ok(!r.ok);assert.ok(r.commands.length>=6);});
t("everything audited",()=>{const entries=al.list();assert.ok(entries.some(e=>e.event.action==="cockpit_refused"));assert.ok(entries.some(e=>e.event.action==="cockpit_ops"));assert.ok(al.verifyChain().valid);});
console.log(pass+" passed, "+fail+" failed");
