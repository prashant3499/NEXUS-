const assert=require("assert");const ml=require("./src/mlops");const wc=require("./src/webCrawler");
let pass=0,fail=0;function t(n,f){try{const r=f();if(r&&r.then)return r.then(()=>pass++).catch(e=>{fail++;console.log("FAIL",n,e.message);});pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
(async()=>{
ml.reset(); wc.reset();
// routing registry
t("routing lists tasks",()=>{const r=ml.routing();assert.ok(r.cofounder_chat.provider);assert.ok(r.translation.fallback);});
t("setRoute switches + audits",()=>{const r=ml.setRoute("listing_copy","sarvam","sarvam-m","founder");assert.ok(r.ok);assert.equal(ml.routing().listing_copy.provider,"sarvam");});
t("unknown task rejected",()=>assert.ok(!ml.setRoute("alien","x").ok));
// prompt versions + rollback
t("addPromptVersion not active until activated",()=>{const a=ml.addPromptVersion("listing_copy","v2 text safer","founder");assert.equal(a.version,2);assert.equal(ml.getPrompt("listing_copy").active,1);});
t("activate + rollback info",()=>{const a=ml.activatePrompt("listing_copy",2);assert.ok(a.ok);assert.equal(a.rollback_to,1);assert.equal(ml.getPrompt("listing_copy").active,2);});
t("activate unknown rejected",()=>assert.ok(!ml.activatePrompt("listing_copy",99).ok));
// evals
await t("evals score a good engine",async()=>{const run=await ml.runEvals(q=>{if(/fee/.test(q))return "The platform fee is 12%.";if(/consent/.test(q))return "No — consent is required before any sale.";return "Never — never-in-loss is enforced; no loss possible.";});assert.equal(run.passed,3);assert.equal(run.score,1);});
await t("evals catch a bad engine",async()=>{const run=await ml.runEvals(()=> "I do not know");assert.equal(run.passed,0);});
// telemetry + health
t("telemetry aggregates + health flags",()=>{ml.reset();for(let i=0;i<6;i++)ml.recordCall("krutrim",{ok:i<3,latencyMs:100,costPaise:10});const h=ml.health();assert.ok(h.providers.krutrim.error_rate>=0.5);assert.ok(/krutrim/.test(h.recommendation));});
// crawler
t("allowlist enforced",async()=>{const r=await wc.crawl("evil-site");assert.ok(!r.ok);assert.ok(r.allowed.length>=5);});
await t("disabled by default -> plan",async()=>{delete process.env.CRAWLER_ENABLED;const r=await wc.crawl("datagov");assert.ok(r.queued);assert.ok(r.plan.politeness.allowlist_only);});
await t("enabled: fetches once, then cache",async()=>{process.env.CRAWLER_ENABLED="true";let calls=0;global.fetch=async()=>{calls++;return{ok:true,text:async()=>"<data>gi clusters</data>"};};
  require("./src/cache").clear();const a=await wc.crawl("gi_registry");const b=await wc.crawl("gi_registry");
  assert.ok(a.ok&&!a.from_cache);assert.ok(b.ok&&b.from_cache);assert.equal(calls,1);delete process.env.CRAWLER_ENABLED;});
await t("crawl feeds R&D agent",async()=>{const ra=require("./src/researchAgent");const r=ra.research("gi_registry fetched");assert.ok(r.runtime_findings.length>=1);});
setTimeout(()=>console.log(pass+" passed, "+fail+" failed"),50);
})();
