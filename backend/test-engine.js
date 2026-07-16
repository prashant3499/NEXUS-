'use strict';
const { VERTICALS, MODALITY, supportsModality, validateAttributes, complianceHooks, registerVertical } = require('./src/verticals');
const { AGENTS, HITL_TIER, runStage, pipeline } = require('./src/agents');
let p=0,f=0; const a=(c,m)=>{if(c){p++;console.log('  \u2713 '+m)}else{f++;console.log('  \u2717 FAIL: '+m)}};
const sec=(s)=>console.log('\n\u2501\u2501\u2501 '+s+' \u2501\u2501\u2501\n');

sec('VERTICALS — 5+ as no-code config modules');
a(Object.keys(VERTICALS).length>=6, `${Object.keys(VERTICALS).length} verticals registered (gems, jewellery, gi, handicraft, naturals, tourism)`);
a(supportsModality('gems', MODALITY.EXIM), 'Gems supports EXIM modality');
a(!supportsModality('naturals', MODALITY.POS), 'Naturals correctly does NOT claim POS');
a(supportsModality('tourism', MODALITY.B2B2C), 'Tourism supports B2B2C');

sec('VERTICAL — attribute validation');
const gv=validateAttributes('gems',{carat:2.1,cut:'brilliant'});
a(!gv.valid && gv.missing.includes('cert_no'), 'Gems missing cert_no flagged');
const full=validateAttributes('handicraft',{materials:'clay',dimensions:'10cm',craft_technique:'wheel',artisan_story:'x',is_handmade:true});
a(full.valid, 'Complete handicraft attributes validate');

sec('VERTICAL — compliance hooks fire correctly');
a(complianceHooks('naturals',{isEdible:true}).includes('fssai_if_edible'), 'Edible natural → FSSAI hook fires');
a(complianceHooks('naturals',{isExport:true}).includes('eu_csrd_if_export'), 'Exported natural → CSRD hook fires');
a(!complianceHooks('naturals',{}).includes('eu_csrd_if_export'), 'Domestic natural → no CSRD hook');
a(complianceHooks('gems',{}).includes('kimberley_process'), 'Gems always → Kimberley process');

sec('VERTICAL — no-code registration at runtime');
registerVertical('leather',{label:'Leather Craft',attributes:['hide_type','tanning'],compliance:['leather_export_council'],modalities:MODALITY.D2C|MODALITY.EXIM});
a(VERTICALS.leather && VERTICALS.leather.label==='Leather Craft', 'New vertical added at runtime — zero code change');

sec('AGENTS — the 6-stage pipeline, sourcing to profit');
const pl=pipeline();
a(pl.length===6, '6 agents in pipeline');
a(pl[0].label==='Sourcing Agent' && pl[5].label==='Marketing Agent', 'Order: Sourcing → ... → Marketing');

sec('AGENTS — HITL escalation by threshold');
a(runStage('sourcing',{newMerchantValue:30000}).autonomy==='auto', 'Small new merchant → auto');
a(runStage('sourcing',{newMerchantValue:60000}).needs_human, 'Merchant > ₹50K → mandatory human');
a(runStage('finance',{amount:50000}).autonomy==='auto', 'Payment ₹50K → auto');
a(runStage('finance',{amount:250000}).needs_human, 'Payment > ₹2L → mandatory human');
a(runStage('compliance',{}).needs_human, 'ALL compliance submissions → mandatory human');
a(runStage('commerce',{priceChangePct:25}).reversible, 'Price change >20% → notify (reversible)');
a(runStage('marketing',{adBudget:100,budgetCap:50}).autonomy==='notify_and_proceed', 'Ad over budget → notify');
a(runStage('commerce',{priceChangePct:5}).autonomy==='auto', 'Small price change → auto');

// Compliance Agent now actually does compliance work (wired to gemExportCompliance)
sec('COMPLIANCE AGENT — operational preflight');
const { preflightCompliance } = require('./src/agents');

const clean = preflightCompliance({ id: 'p_clean', materials: ['gold', 'silver'] });
a(clean.decision === 'allow',                            'Clean materials → allow');
a(clean.events.length === 0,                              'No events for clean export');
a(clean.allowed === true,                                 'allowed flag matches');

const ivory = preflightCompliance({ id: 'p_ivory', materials: ['ivory inlay'] });
a(ivory.decision === 'block',                             'Ivory → block');
a(ivory.events.length === 1,                              'One event emitted');
a(ivory.events[0].type === 'export.blocked',              'Event type is export.blocked');
a(ivory.events[0].product_ref === 'p_ivory',              'Event names the product');
a(ivory.hitlTier === 3,                                   'Blocked export = MANDATORY HITL tier');
a(ivory.blockers.length >= 1,                             'Blockers surfaced');

const coral = preflightCompliance({ id: 'p_coral', materials: ['red coral'], cites_permit: 'BAD' });
a(coral.decision === 'warn',                              'Coral with bad-fmt permit → warn');
a(coral.events.length === 1,                              'One warning event emitted');
a(coral.events[0].type === 'export.warning',              'Event type is export.warning');
a(coral.hitlTier === 1,                                   'Warned export = AUTO HITL tier (proceeds)');

const rough = preflightCompliance({ id: 'p_diamond', hs_code: '7102.31' });
a(rough.decision === 'block',                             'Rough diamond without KP → block');
a(rough.blockers.some(b => b.rule === 'KIMBERLEY_CERT_MISSING'), 'KP blocker surfaces in agent decision');

const multi = preflightCompliance({ id: 'p_multi', materials: ['ivory', 'red coral'], hs_code: '7102.31' });
a(multi.decision === 'block',                             'Multiple violations → block');
a(multi.blockers.length >= 3,                             'All blockers reported (ivory + coral + KP)');

console.log('\n'+'\u2550'.repeat(52));
console.log('  RESULTS: '+p+' passed, '+f+' failed');
console.log('\u2550'.repeat(52));
process.exit(f>0?1:0);
