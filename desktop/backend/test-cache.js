const assert=require("assert");const cache=require("./src/cache");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
cache.clear();
t("miss then hit",()=>{assert.equal(cache.get("k"),undefined);cache.set("k","v");assert.equal(cache.get("k"),"v");});
t("keyOf stable + hashed",()=>{const a=cache.keyOf("ai","m",[{role:"user",content:"hi"}]);const b=cache.keyOf("ai","m",[{role:"user",content:"hi"}]);assert.equal(a,b);assert.equal(a.length,32);assert.notEqual(a,cache.keyOf("ai","m",[{role:"user",content:"bye"}]));});
t("TTL expiry",()=>{cache.clear();cache.set("t","x",1);const w=Date.now()+3;while(Date.now()<w){}assert.equal(cache.get("t"),undefined);});
t("getOrCompute runs fn once",async()=>{cache.clear();let n=0;const f=()=>{n++;return 42;};assert.equal(await cache.getOrCompute("g",f),42);assert.equal(await cache.getOrCompute("g",f),42);assert.equal(n,1);});
t("stats tracks hit rate",()=>{cache.clear();cache.set("a",1);cache.get("a");cache.get("miss");const s=cache.stats();assert.equal(s.hits,1);assert.equal(s.misses,1);assert.equal(s.hit_rate,0.5);});
Promise.resolve().then(()=>console.log(pass+" passed, "+fail+" failed"));
