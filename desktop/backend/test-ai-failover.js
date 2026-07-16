const assert=require("assert");
let pass=0,fail=0;async function at(n,f){try{await f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
function fresh(env){Object.keys(env).forEach(k=>{if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];});delete require.cache[require.resolve("./src/aiProvider")];return require("./src/aiProvider");}
(async()=>{
  let ai=fresh({AI_PROVIDER_CHAIN:"krutrim,anthropic",AI_API_KEY:undefined,ANTHROPIC_API_KEY:undefined});
  await at("chain honors env order",async()=>assert.deepEqual(ai.chain(),["krutrim","anthropic"]));
  await at("no keys → fallback null (never throws)",async()=>{const r=await ai.chatWithFallback([{role:"user",content:"hi"}]);assert.equal(r,null);});
  // stub _call: krutrim fails, anthropic succeeds → failover works
  ai=fresh({AI_PROVIDER_CHAIN:"krutrim,anthropic",AI_API_KEY:"k",ANTHROPIC_API_KEY:"a"});
  ai._call=async(p)=>{if(p==="krutrim")throw new Error("down");return {text:"from "+p,provider:p};};
  await at("fails over krutrim→anthropic",async()=>{const r=await ai.chatWithFallback([{role:"user",content:"hi"}]);assert.equal(r.provider,"anthropic");});
  await at("all-down never throws → null",async()=>{ai._call=async()=>{throw new Error("all down");};const r=await ai.chatWithFallback([{role:"user",content:"hi"}]);assert.equal(r,null);});
  await at("healthy primary used first",async()=>{ai._call=async(p)=>({text:"x",provider:p});const r=await ai.chatWithFallback([{role:"user",content:"hi"}]);assert.equal(r.provider,"krutrim");});
  console.log(pass+" passed, "+fail+" failed");
})();
