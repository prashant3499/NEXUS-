'use strict';

const CC = require('./src/founderControlCentre');
const slicer = require('./src/slicer');
const { PlatformSettings } = require('./src/platformSettings');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Snapshot shows every lever + current value');
{
  slicer.resetCommissionPct();
  const settings = new PlatformSettings();
  const s = CC.snapshot(settings);
  a(!!s.levers.platform_fee && s.levers.platform_fee.display === '12.00%', 'Platform fee shown at current 12%');
  a(!!s.levers.subscription_fees && !!s.levers.subscription_fees.current.karigar, 'Subscription tiers shown');
  a(!!s.levers.charity_pct && !!s.levers.autonomy && !!s.levers.agents, 'Charity, autonomy, agents all present');
  a(s.invariants_protected.includes('never_in_loss'), 'Lists protected invariants');
}

sec('Change platform fee directly — guarded');
{
  slicer.resetCommissionPct();
  const ok = CC.change('platform_fee', 0.06);
  a(ok.ok && ok.applied === '6.00%', 'Founder sets fee to 6% directly');
  a(slicer.getCommissionPct() === 0.06, 'Takes effect live');
  const low = CC.change('platform_fee', 0.005);
  a(low.ok === false && /floor|never-in-loss/i.test(low.reason), 'Below-floor refused (never-in-loss)');
  const high = CC.change('platform_fee', 0.5);
  a(high.ok === false && /cap|maker-first/i.test(high.reason), 'Above-ceiling refused (maker-first)');
  CC.change('reset_platform_fee');
  a(slicer.getCommissionPct() === slicer.DEFAULT_CONFIG.platform_commission_pct, 'Reset restores default');
}

sec('Change subscription fee directly — floor-guarded');
{
  const settings = new PlatformSettings();
  const ok = CC.change('subscription', { tier: 'vyapari', paise: 499900 }, { settings });
  a(ok.ok === true, 'Founder raises vyapari subscription directly');
  a(settings.priceFor('vyapari') === 499900, 'Takes effect live');
  // below cost-to-serve floor should be refused by validatePrice
  const low = CC.change('subscription', { tier: 'karigar', paise: 1 }, { settings });
  a(low.ok === false, 'Sub below cost-to-serve floor refused');
}

sec('Unknown lever is rejected cleanly');
{
  a(CC.change('nonexistent', 1).ok === false, 'Unknown lever → error, no change');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
slicer.resetCommissionPct();
process.exit(fail > 0 ? 1 : 0);
