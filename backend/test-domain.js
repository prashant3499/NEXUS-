const assert=require("assert");
const d=require("./src/domain"), repo=require("./src/repository"), al=require("./src/auditLog");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
al.reset(); repo.reset();
// domain entities
t("create maker validates",()=>{const r=d.create("maker",{name:"Asha Devi",vertical:"textile",cluster:"Varanasi"});assert.ok(r.ok);assert.ok(r.entity.id);});
t("missing required rejected",()=>{const r=d.create("product",{title:"Vase"});assert.ok(!r.ok);assert.ok(r.errors.length);});
t("unknown kind rejected",()=>assert.ok(!d.create("alien",{}).ok));
t("number clamped by schema",()=>{const r=d.create("product",{title:"X",vertical:"handicraft",pricePaise:5,makerId:"m1"});assert.ok(r.ok);assert.ok(r.entity.pricePaise>=100);});
// order lifecycle
t("order starts created",()=>{const r=d.create("order",{productId:"p1",makerId:"m1",amountPaise:500000});assert.equal(r.entity.status,"created");});
t("legal transitions pass",()=>{let o=d.create("order",{productId:"p1",makerId:"m1",amountPaise:500000}).entity;
  for(const s of ["paid","in_fulfilment","shipped","delivered","settled"]){const r=d.transition(o,s,"test");assert.ok(r.ok,s);o=r.order;}
  assert.equal(o.history.length,5);});
t("illegal transition blocked",()=>{const o=d.create("order",{productId:"p1",makerId:"m1",amountPaise:500000}).entity;const r=d.transition(o,"settled");assert.ok(!r.ok);assert.ok(r.allowed);});
t("terminal states frozen",()=>{let o=d.create("order",{productId:"p1",makerId:"m1",amountPaise:500000}).entity;o=d.transition(o,"cancelled").order;assert.ok(!d.transition(o,"paid").ok);});
// MoR abstraction
t("morSplit never-in-loss",()=>{const o={amountPaise:500000};const m=d.morSplit(o,12);assert.ok(m.never_in_loss);assert.ok(m.makerPayoutPaise<=m.collectedPaise);assert.equal(m.makerPayoutPaise+m.platformFeePaise,m.collectedPaise);});
// repository
t("repo create+get",()=>{const r=repo.create("maker",{name:"Ram",vertical:"handicraft"},"founder");assert.ok(r.ok);assert.ok(repo.get("maker",r.entity.id).ok);});
t("repo update validates",()=>{const r=repo.create("maker",{name:"Sita",vertical:"gems"});const u=repo.update("maker",r.entity.id,{cluster:"Jaipur"});assert.ok(u.ok);assert.equal(u.entity.cluster,"Jaipur");});
t("repo remove + not found",()=>{const r=repo.create("maker",{name:"Z",vertical:"gems"});assert.ok(repo.remove("maker",r.entity.id).ok);assert.ok(!repo.get("maker",r.entity.id).ok);});
t("repo find/count",()=>{repo.reset();repo.create("maker",{name:"A",vertical:"textile"});repo.create("maker",{name:"B",vertical:"gems"});assert.equal(repo.count("maker"),2);assert.equal(repo.find("maker",m=>m.vertical==="gems").length,1);});
// audit chain
t("writes emit audit entries",()=>{assert.ok(al.list().length>=3);});
t("chain verifies",()=>{assert.ok(al.verifyChain().valid);});
t("tampering detected",()=>{const entries=al.list();entries[0].event={action:"forged"};
  // list() returns copies... mutate the real one:
  const real=al.list(0)||al.list();  // ensure we mutate stored objects
  const store=al.list(); // slice copy — need internal mutation: append then hack via reference
  const e=al.append({action:"x"}); e.event={action:"forged"};
  assert.equal(al.verifyChain().valid,false);});
console.log(pass+" passed, "+fail+" failed");
