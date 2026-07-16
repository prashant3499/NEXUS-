const assert=require("assert");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
function withEnv(env,fn){const old={};Object.keys(env).forEach(k=>{old[k]=process.env[k];if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];});delete require.cache[require.resolve("./src/aiProvider")];const ai=require("./src/aiProvider");try{fn(ai);}finally{Object.keys(old).forEach(k=>{if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];});delete require.cache[require.resolve("./src/aiProvider")];}}
const msgs=[{role:"user",content:"hi"}];
t("default provider anthropic",()=>withEnv({AI_PROVIDER:undefined},ai=>assert.equal(ai.active(),"anthropic")));
t("krutrim selectable",()=>withEnv({AI_PROVIDER:"krutrim"},ai=>assert.equal(ai.active(),"krutrim")));
t("unknown provider falls back",()=>withEnv({AI_PROVIDER:"bogus"},ai=>assert.equal(ai.active(),"anthropic")));
t("krutrim → OpenAI-style bearer + india base",()=>withEnv({AI_PROVIDER:"krutrim",AI_API_KEY:"k"},ai=>{const r=ai.buildRequest(msgs);assert.ok(r.headers.authorization.startsWith("Bearer"));assert.ok(/olakrutrim/.test(r.url));assert.ok(r.body.model);}));
t("anthropic → x-api-key header",()=>withEnv({AI_PROVIDER:"anthropic",AI_API_KEY:"a"},ai=>{const r=ai.buildRequest(msgs);assert.ok(r.headers["x-api-key"]);assert.ok(/anthropic/.test(r.url));}));
t("base + model overridable",()=>withEnv({AI_PROVIDER:"sarvam",AI_API_KEY:"s",AI_BASE_URL:"https://x/y",AI_MODEL:"m2"},ai=>{const r=ai.buildRequest(msgs);assert.equal(r.url,"https://x/y");assert.equal(r.body.model,"m2");}));
t("parseResponse openai",()=>withEnv({AI_PROVIDER:"krutrim"},ai=>assert.equal(ai.parseResponse("krutrim",{choices:[{message:{content:"hello"}}]}),"hello")));
t("parseResponse anthropic",()=>withEnv({AI_PROVIDER:"anthropic"},ai=>assert.equal(ai.parseResponse("anthropic",{content:[{text:"hi"}]}),"hi")));
t("status lists providers + residency",()=>withEnv({AI_PROVIDER:"krutrim"},ai=>{const s=ai.status();assert.equal(s.active,"krutrim");assert.equal(s.residency,"india");assert.ok(s.available.length>=3);}));
t("no key → chat returns null (fallback)",()=>withEnv({AI_PROVIDER:"krutrim",AI_API_KEY:undefined},async ai=>{const r=await ai.chat(msgs);assert.equal(r,null);}));
console.log(pass+" passed, "+fail+" failed");
