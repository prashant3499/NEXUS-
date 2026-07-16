'use strict';

/**
 * test-platform-settings.js
 *
 * Tests the founder's no-code pricing control:
 *   - Defaults load
 *   - Price changes apply + audit
 *   - Never-in-loss floor rejects below-cost prices
 *   - Sansthan stays custom (can't set a fixed price)
 *   - Snapshot round-trips for persistence
 */

const PS = require('./src/platformSettings');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Defaults');
{
  const s = new PS.PlatformSettings();
  a(s.priceFor('karigar') === 79900, 'Karigar default ₹799');
  a(s.priceFor('niryatak') === 1199900, 'Niryatak default ₹11999');
  a(s.priceFor('sansthan') === null, 'Sansthan is custom (null)');
}

sec('validatePrice — floor enforcement');
{
  a(PS.validatePrice('karigar', 49900).ok, 'Above floor OK');
  a(!PS.validatePrice('karigar', 10000).ok, 'Below floor rejected (₹100 < ₹200 cost)');
  const r = PS.validatePrice('karigar', 10000);
  a(/never operates at a loss/i.test(r.error), 'Error cites never-in-loss');
  a(r.floor === 20000, 'Floor surfaced for the UI');
  a(PS.validatePrice('karigar', 20000).ok, 'Exactly at floor is allowed');
}

sec('validatePrice — type + tier checks');
{
  a(!PS.validatePrice('karigar', -100).ok, 'Negative rejected');
  a(!PS.validatePrice('karigar', 1.5).ok, 'Fractional paise rejected');
  a(!PS.validatePrice('wizard', 50000).ok, 'Unknown tier rejected');
}

sec('validatePrice — sansthan is custom');
{
  a(PS.validatePrice('sansthan', null).ok, 'Sansthan null OK');
  a(!PS.validatePrice('sansthan', 50000).ok, 'Sansthan fixed price rejected');
}

sec('setPrice — applies + audits');
{
  let now = 1000;
  const s = new PS.PlatformSettings(null, { now: () => now });
  const r = s.setPrice('karigar', 59900, { by: 'founder', note: 'pilot price bump' });
  a(r.ok, 'Price set');
  a(s.priceFor('karigar') === 59900, 'New price applied');
  a(s.audit.length === 1, 'Audit entry recorded');
  a(s.audit[0].from_paise === 79900 && s.audit[0].to_paise === 59900, 'Audit captures from→to');
  a(s.audit[0].note === 'pilot price bump', 'Audit note kept');
}

sec('setPrice — rejects below floor, no mutation');
{
  const s = new PS.PlatformSettings();
  const before = s.priceFor('niryatak');
  const r = s.setPrice('niryatak', 100000);  // ₹1000 < ₹1500 floor
  a(!r.ok, 'Below-floor rejected');
  a(s.priceFor('niryatak') === before, 'Price unchanged after rejection');
  a(s.audit.length === 0, 'No audit entry for rejected change');
}

sec('pricingTable — founder settings screen data');
{
  const s = new PS.PlatformSettings();
  const t = s.pricingTable();
  a(t.karigar.price_display === '₹799/mo', 'Karigar display');
  a(t.karigar.floor_display === '₹200/mo', 'Karigar floor display');
  a(t.karigar.editable === true, 'Karigar editable');
  a(t.sansthan.price_display === 'Custom', 'Sansthan shows Custom');
  a(t.sansthan.editable === false, 'Sansthan not editable');
}

sec('snapshot — round-trips for persistence');
{
  let now = 5000;
  const s = new PS.PlatformSettings(null, { now: () => now });
  s.setPrice('vyapari', 299900, { note: 'raise' });
  const snap = s.snapshot();
  const restored = new PS.PlatformSettings(snap);
  a(restored.priceFor('vyapari') === 299900, 'Restored price matches');
  a(restored.audit.length === 1, 'Restored audit matches');
}

sec('Charity — founder-configurable, transparent giving');
{
  const s = new PS.PlatformSettings();
  a(s.charityConfig().enabled === false, 'Charity off by default');
  a(s.charityConfig().max_pct === PS.CHARITY_MAX_PCT, 'Exposes the cap');
  // Enabling demands a named cause (transparency)
  const noCause = s.setCharity({ enabled: true });
  a(!noCause.ok && /cause/i.test(noCause.error), 'Cannot enable without a named cause');
  // Enable with a cause
  const ok = s.setCharity({ enabled: true, cause: 'Artisan welfare fund', pct: 0.005 });
  a(ok.ok === true, 'Enables with a cause');
  a(s.charityConfig().cause === 'Artisan welfare fund', 'Cause stored');
  a(s.charityConfig().pct === 0.005, 'Rate stored');
  // Cap enforced
  const over = s.setCharity({ pct: 0.10 });
  a(!over.ok && /exceed/i.test(over.error), `Rate capped at ${PS.CHARITY_MAX_PCT * 100}%`);
  // borne_by validation
  const badBorne = s.setCharity({ borne_by: 'martians' });
  a(!badBorne.ok, 'Rejects invalid borne_by');
  // Round-trips through snapshot
  const restored = new PS.PlatformSettings(s.snapshot());
  a(restored.charityConfig().cause === 'Artisan welfare fund', 'Charity survives persistence');
  a(restored.charityConfig().enabled === true, 'Enabled state persists');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
