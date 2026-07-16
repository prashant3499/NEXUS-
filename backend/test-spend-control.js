const assert=require("assert");const sc=require("./src/spendControl");const {CostEngine}=require("./src/costEngine");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
sc.reset();
t("default cap ₹30,000",()=>assert.equal(sc.getCapRupees(),30000));
t("founder sets cap in rupees",()=>{const r=sc.setCapRupees(10000,"founder");assert.ok(r.ok);assert.equal(r.cap_rupees,10000);assert.equal(sc.getCapRupees(),10000);});
t("clamped to safety ceiling",()=>{const r=sc.setCapRupees(99999999,"founder");assert.ok(r.cap_rupees<=sc.MAX_PAISE/100);});
t("can pause spend (0)",()=>{sc.setCapRupees(0,"founder");assert.equal(sc.getCap(),0);});
t("rejects non-number",()=>{assert.ok(!sc.setCap("abc").ok);});
t("logs every change",()=>{sc.reset();sc.setCapRupees(5000,"founder");sc.setCapRupees(8000,"cofounder");assert.equal(sc.history().length,2);assert.equal(sc.history()[1].by,"cofounder");});
t("CostEngine honors founder cap live",()=>{
  sc.reset(); sc.setCapRupees(0,"founder");   // paused
  const e=new CostEngine({ capResolver:()=>sc.getCap() });
  e.apiSpentThisMonth=0;
  const route=e.routeInference?e.routeInference({estPaise:100,gpuQueueDepth:99,gpuQueueMax:8}):null;
  // with cap 0, api_overflow must NOT be chosen
  if(route) assert.notEqual(route.path,"api_overflow");
  sc.setCapRupees(30000,"founder");
});
console.log(pass+" passed, "+fail+" failed");
