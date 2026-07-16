'use strict';
const { Platform } = require('./src/platform');
let p=0,f=0; const a=(c,m)=>{if(c){p++;console.log('  \u2713 '+m)}else{f++;console.log('  \u2717 FAIL: '+m)}};
const sec=(s)=>console.log('\n\u2501\u2501\u2501 '+s+' \u2501\u2501\u2501\n');

sec('AGENT PIPELINE + VERTICALS wired into the LIVE platform');
const plat = new Platform();

// Vertical validation now fires on listing
const ar = plat.onboard({ isMaker:true, hasVoterId:true, language:'hi' });
const goodGem = plat.listProduct(ar.id, { title:'Ruby', supplierPrice:5000, sellPrice:9000,
  vertical:'gems', attributes:{carat:2,cut:'oval',clarity:'VS',cert_lab:'IGI',cert_no:'X1',origin:'Burma',treatment:'none'} });
a(goodGem.attr_valid===true, 'Gem with full attributes → valid, listed live');
a(goodGem.status==='live', '  \u2514 status live');

const badGem = plat.listProduct(ar.id, { title:'Ruby2', supplierPrice:5000, sellPrice:9000,
  vertical:'gems', attributes:{carat:2} });
a(badGem.attr_valid===false, 'Gem missing attributes → flagged invalid');
a(badGem.status==='pending_review', '  \u2514 routed to review (Sourcing agent caught it)');
a(badGem.attr_missing.includes('cert_no'), '  \u2514 names the missing field');

// Compliance hooks attach by vertical
const nat = plat.listProduct(ar.id, { title:'Honey', supplierPrice:100, sellPrice:300,
  vertical:'naturals', attributes:{organic_cert_no:'O1',harvest_date:'2024',farm_gps:'x',carbon_footprint_kg:1,biodegradable:true}, isExport:true });
a(nat.compliance_hooks.includes('fssai_if_edible'), 'Edible natural → FSSAI hook attached');
a(nat.compliance_hooks.includes('eu_csrd_if_export'), '  \u2514 export → CSRD hook attached');

sec('ORDER runs through the agent pipeline');
const o = plat.processOrder(goodGem.id, { buyerName:'Sophie', isExport:true });
a(Array.isArray(o.agent_trace) && o.agent_trace.length>=2, 'Order carries an agent trace');
a(o.agent_trace.some(t=>t.stage==='Compliance' && t.needs_human), 'Export → Compliance agent demands human (mandatory)');
a(o.vertical==='gems', 'Order inherits the product vertical');

// Large order → finance + logistics escalate
const bigGem = plat.listProduct(ar.id, { title:'BigRuby', supplierPrice:80000, sellPrice:250000,
  vertical:'gems', attributes:{carat:10,cut:'x',clarity:'x',cert_lab:'x',cert_no:'x',origin:'x',treatment:'x'} });
const bigO = plat.processOrder(bigGem.id, { buyerName:'Ahmed', isExport:true });
a(bigO.agent_trace.find(t=>t.stage==='Finance').needs_human, 'Order > ₹2L → Finance agent escalates');
a(bigO.agent_trace.find(t=>t.stage==='Logistics').needs_human, '  \u2514 high-value → Logistics escalates');
a(bigO.status==='hitl_review', '  \u2514 overall order → HITL review');

sec('ACCESSORS for the UI');
a(plat.verticals().length>=6, 'Platform exposes 6+ verticals');
a(plat.agentPipeline().length===6, 'Platform exposes the 6-agent pipeline');

console.log('\n'+'\u2550'.repeat(52));
console.log('  RESULTS: '+p+' passed, '+f+' failed');
console.log('\u2550'.repeat(52));
process.exit(f>0?1:0);
