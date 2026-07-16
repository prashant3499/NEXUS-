const assert=require("assert");const o=require("./src/ondcOnboarding");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
t("generates both keypairs",()=>{const k=o.generateBecknKeys();assert.equal(k.signing.algo,"Ed25519");assert.equal(k.encryption.algo,"X25519");assert.ok(k.signing.public_key.length>20);assert.ok(k.signing.private_key.length>20);assert.ok(k.encryption.public_key.length>20);});
t("keys are unique each call",()=>{assert.notEqual(o.generateBecknKeys().signing.private_key,o.generateBecknKeys().signing.private_key);});
t("keys are valid base64",()=>{const k=o.generateBecknKeys();assert.doesNotThrow(()=>Buffer.from(k.signing.public_key,"base64"));});
t("site verification embeds id",()=>{assert.ok(o.siteVerificationHtml("ABC123").includes("ABC123"));assert.ok(o.siteVerificationHtml("x").includes("ondc-site-verification"));});
t("checklist has P0 prerequisites",()=>{const c=o.readinessChecklist();assert.ok(c.length>=8);assert.ok(c.some(s=>/entity/.test(s.step)&&s.p==="P0"));assert.ok(c.some(s=>/Beckn/.test(s.step)));});
t("key + site steps marked ready",()=>{const c=o.readinessChecklist();assert.ok(c.find(s=>/Ed25519/.test(s.step)).status==="ready");});
t("options recommend fast then strategic",()=>{const op=o.participantOptions();assert.ok(op.fast_path);assert.ok(op.strategic_path);assert.ok(/fast path/.test(op.recommend));});
console.log(pass+" passed, "+fail+" failed");
