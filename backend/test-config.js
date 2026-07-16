'use strict';
const { config, productionReadiness, NON_CODE_GATES } = require('./src/config');
let p=0,f=0;const a=(c,m)=>{if(c){p++;console.log('  \u2713 '+m)}else{f++;console.log('  \u2717 FAIL: '+m)}};
console.log('\n\u2501\u2501\u2501 CONFIG + READINESS \u2501\u2501\u2501\n');
a(config.port===4100||typeof config.port==='number','Port resolves to a number');
a(config.payments.provider==='mock','Default payments = mock (safe)');
a(config.store==='file','Default store = file (pilot)');
a(config.auth.mode==='session'||config.auth.mode==='none','Auth mode resolves (session in dev, none if forced)');
a(config.auth.secret!==undefined,'Auth secret field present');
// dev readiness: ready (no prod requirements)
const dev=productionReadiness({...config,isProd:false});
a(dev.ready===true,'Dev is "ready" (no prod gates enforced)');
// prod readiness with mock: NOT ready, lists specifics
const prod=productionReadiness({...config,isProd:true,auth:{mode:'none',secret:null}});
a(prod.ready===false,'Prod with mock config is NOT ready');
a(prod.missing.some(m=>m.includes('PAYMENTS')),'  \u2514 flags mock payments');
a(prod.missing.some(m=>m.includes('AUTH')),'  \u2514 flags demo auth');
// fully configured prod: ready
const full=productionReadiness({isProd:true,payments:{provider:'razorpay',razorpayKeyId:'k',razorpayKeySecret:'s',webhookSecret:'w'},store:'postgres',databaseUrl:'x',auth:{mode:'jwt',jwtSecret:'j'}});
a(full.ready===true,'Fully-configured prod IS ready');
a(NON_CODE_GATES.length>=10,'≥10 non-code gates documented (payments, regulatory officers, verification providers, banking, business registration)');
a(NON_CODE_GATES.some(g=>/CA/.test(g))&&NON_CODE_GATES.some(g=>/lawyer/.test(g)),'  \u2514 includes CA + lawyer sign-off');
console.log('\n'+'\u2550'.repeat(48));console.log('  RESULTS: '+p+' passed, '+f+' failed');console.log('\u2550'.repeat(48));
process.exit(f>0?1:0);
