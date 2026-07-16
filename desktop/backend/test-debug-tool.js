const assert=require("assert");const dbg=require("./src/debugTool");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
dbg.reset();
t("trace records + caps ring",()=>{for(let i=0;i<350;i++)dbg.trace({method:"GET",path:"/x"+i,status:200,ms:5});assert.ok(dbg.recent(400).length<=300);});
t("slowest sorted",()=>{dbg.reset();dbg.trace({path:"/a",ms:10});dbg.trace({path:"/b",ms:900});assert.equal(dbg.slowest(1)[0].path,"/b");});
t("SECRETS REDACTED — values never appear",()=>{process.env.AUTH_SECRET="supersecret123";process.env.FOUNDER_TOKEN="tok_abc";const r=JSON.stringify(dbg.envReport());assert.ok(!/supersecret123|tok_abc/.test(r));assert.ok(/SET \(redacted\)/.test(r));delete process.env.AUTH_SECRET;delete process.env.FOUNDER_TOKEN;});
t("snapshot has runtime + no secret values",()=>{process.env.ENCRYPTION_KEY="deadbeef";const s=dbg.snapshot();assert.ok(s.node.startsWith("v"));assert.ok(s.memory_mb.rss>0);assert.ok(!JSON.stringify(s).includes("deadbeef"));delete process.env.ENCRYPTION_KEY;});
t("moduleHealth loads all src modules",()=>{const m=dbg.moduleHealth(__dirname+"/src");assert.ok(m.modules>100);assert.equal(m.failed,0);});
console.log(pass+" passed, "+fail+" failed");
