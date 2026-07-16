const assert=require("assert");const R=require("./src/resilience");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
async function at(n,f){try{await f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
(async()=>{
  await at("withTimeout resolves fast",async()=>{const v=await R.withTimeout(Promise.resolve(5),100);assert.equal(v,5);});
  await at("withTimeout rejects slow",async()=>{let threw=false;try{await R.withTimeout(new Promise(r=>setTimeout(()=>r(1),50)),5);}catch(e){threw=/timeout/.test(e.message);}assert.ok(threw);});
  await at("retry succeeds after failures",async()=>{let n=0;const v=await R.retry(async()=>{n++;if(n<3)throw new Error("x");return "ok";},{tries:3,baseMs:1});assert.equal(v,"ok");assert.equal(n,3);});
  await at("retry gives up",async()=>{let threw=false;try{await R.retry(async()=>{throw new Error("no");},{tries:2,baseMs:1});}catch(e){threw=true;}assert.ok(threw);});
  // circuit breaker with injected clock
  let now=1000;const cb=new R.CircuitBreaker({failThreshold:2,cooldownMs:100,now:()=>now});
  t("breaker starts closed",()=>assert.equal(cb.state,"closed"));
  t("breaker opens after threshold",()=>{cb.onFailure();cb.onFailure();assert.equal(cb.state,"open");assert.equal(cb.canPass(),false);});
  t("breaker half-opens after cooldown",()=>{now+=150;assert.equal(cb.canPass(),true);assert.equal(cb.state,"half-open");});
  t("breaker closes on success",()=>{cb.onSuccess();assert.equal(cb.state,"closed");});
  t("half-open failure re-opens",()=>{const c2=new R.CircuitBreaker({failThreshold:2,cooldownMs:10,now:()=>now});c2.onFailure();c2.onFailure();now+=20;c2.canPass();c2.onFailure();assert.equal(c2.state,"open");});
  await at("guard returns fallback when open",async()=>{const b=new R.CircuitBreaker({failThreshold:1});b.onFailure();const v=await R.guard(b,async()=>"live","FB");assert.equal(v,"FB");});
  await at("guard returns live when closed",async()=>{const b=new R.CircuitBreaker();const v=await R.guard(b,async()=>"live","FB");assert.equal(v,"live");});
  await at("guard swallows throw → fallback",async()=>{const b=new R.CircuitBreaker();const v=await R.guard(b,async()=>{throw new Error("boom");},"FB");assert.equal(v,"FB");});
  await at("safe returns fallback on throw",async()=>{assert.equal(await R.safe(async()=>{throw new Error("x");},"D"),"D");});
  console.log(pass+" passed, "+fail+" failed");
})();
