const assert=require("assert");const rfq=require("./src/rfq");const al=require("./src/auditLog");
let pass=0,fail=0;function t(n,f){try{f();pass++;}catch(e){fail++;console.log("FAIL",n,e.message);}}
al.reset(); rfq.reset();
t("bulk tiers scale with qty",()=>{assert.equal(rfq.bulkTierPct(5),0);assert.equal(rfq.bulkTierPct(10),4);assert.equal(rfq.bulkTierPct(50),8);assert.equal(rfq.bulkTierPct(200),12);assert.equal(rfq.bulkTierPct(500),18);});
t("request opens RFQ",()=>{const r=rfq.request({buyer:"Taj Hotels",buyerType:"hotel",vertical:"handicraft",qty:200,unitBudgetRupees:1500});assert.ok(r.ok);assert.equal(r.rfq.status,"requested");assert.equal(r.rfq.qty,200);});
t("qty required",()=>assert.ok(!rfq.request({buyer:"X"}).ok));
t("quote computes bulk + fees + total",()=>{const id=rfq.list()[0].id;const q=rfq.quote(id,{unitPriceRupees:1500,curationRupees:5000,packagingRupees:8000},"founder");assert.ok(q.ok);const Q=q.rfq.quote;
  // 200*1500=300000 gross; 12% off = -36000; +5000 curation +8000 packaging = 277000
  assert.equal(Q.bulk_discount_pct,12);assert.equal(Q.total_rupees,277000);assert.equal(q.rfq.status,"quoted");});
t("cannot accept before quote",()=>{const r=rfq.request({buyer:"NoQuote",qty:5});assert.ok(!rfq.accept(r.rfq.id).ok);});
t("accept then convert -> MoR order, never-in-loss",()=>{const id=rfq.list("quoted")[0].id;assert.ok(rfq.accept(id,"buyer").ok);
  const c=rfq.convert(id,"m2","founder");assert.ok(c.ok);assert.ok(c.order.id);assert.ok(c.split.never_in_loss);
  assert.equal(c.split.maker_payout_rupees+c.split.platform_fee_rupees,c.split.collected_rupees);});
t("illegal transition blocked",()=>{const r=rfq.request({buyer:"Z",qty:5});assert.ok(!rfq.convert(r.rfq.id,"m1").ok);});
t("decline is terminal",()=>{const r=rfq.request({buyer:"D",qty:5});rfq.decline(r.rfq.id);assert.ok(!rfq.quote(r.rfq.id,{unitPriceRupees:100}).ok);});
t("pipeline counts by status",()=>{const p=rfq.pipeline();assert.ok(p.total>=4);assert.ok(p.by_status.ordered>=1);});
t("everything audited + chain valid",()=>{assert.ok(al.list().some(e=>e.event.action==="rfq_request"));assert.ok(al.list().some(e=>e.event.action==="rfq_ordered"));assert.ok(al.verifyChain().valid);});
console.log(pass+" passed, "+fail+" failed");
