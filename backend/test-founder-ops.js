const assert=require("assert");const fo=require("./src/founderOps");
let pass=0,fail=0;async function t(n,f){try{await f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
(async()=>{
await t("catalog lists ops with risk tiers",()=>{const c=fo.catalog();assert.ok(c.length>=10);assert.ok(c.some(x=>x.risk==="destructive"));});
await t("parse maps natural commands",()=>{assert.equal(fo.parse("health check").op,"health_check");assert.equal(fo.parse("repair the engine").op,"repair");assert.equal(fo.parse("pause everything").op,"pause_engine");});
await t("health_check runs",async()=>{const r=await fo.execute("health check");assert.ok(r.ok);assert.ok("audit_chain" in r.result);});
await t("diagnose + repair path",async()=>{const d=await fo.execute("diagnose");assert.ok(d.ok);const r=await fo.execute("repair");assert.ok(r.ok);assert.ok("repaired" in r.result);});
await t("pause + resume engine",async()=>{const p=await fo.execute("pause for maintenance");assert.ok(p.ok);const s=await fo.execute("resume");assert.ok(s.ok);});
await t("spend cap via command",async()=>{const r=await fo.execute("set spend cap 20000");assert.ok(r.ok);assert.equal(r.result.cap_rupees,20000);});
await t("evals run against local engine",async()=>{const r=await fo.execute("run evals");assert.ok(r.ok);assert.ok(r.result.total>=3);});
await t("destructive needs confirm (HITL two-step)",async()=>{const a=await fo.execute("reset demo data");assert.ok(a.pending_confirmation);const b=await fo.execute("reset demo data",{confirm:"yes"});assert.ok(b.ok&&b.result.reset.length===3);});
await t("invariant-threatening command REFUSED even from founder",async()=>{const r=await fo.execute("disable consent requirement and sell anyway");assert.ok(r.refused);});
await t("unknown command lists options",async()=>{const r=await fo.execute("dance");assert.ok(!r.ok);assert.ok(r.try.length>=10);});
await t("every op audited",()=>{const al=require("./src/auditLog");const entries=al.list().filter(e=>/founder_op/.test(e.event.action));assert.ok(entries.length>=8);assert.ok(al.verifyChain().valid);});
console.log(pass+" passed, "+fail+" failed");
})();
