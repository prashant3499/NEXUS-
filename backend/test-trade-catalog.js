'use strict';

const T = require('./src/tradeCatalog');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Covers the full spectrum of skilled trades');
{
  const c = T.coverage();
  a(c.total_trades >= 12, `Many trades catalogued (${c.total_trades})`);
  a(['cobbler', 'carpenter', 'gem_cleaner', 'jeweller', 'tour_guide'].every((k) => T.getTrade(k)), 'Cobbler, carpenter, gem cleaner, jeweller, tour guide all present');
  a(c.by_modality.goods > 0 && c.by_modality.local_service > 0 && c.by_modality.experience > 0, 'All three modalities represented');
}

sec('Modality is right per trade');
{
  a(T.getTrade('cobbler').modalities.includes(T.MODALITY.LOCAL_SERVICE), 'Cobbler is a local service');
  a(T.getTrade('gem_cleaner').modalities.includes(T.MODALITY.LOCAL_SERVICE) && !T.getTrade('gem_cleaner').modalities.includes(T.MODALITY.GOODS), 'Gem cleaner is service-only (no shipping)');
  a(T.getTrade('potter').modalities.includes(T.MODALITY.GOODS), 'Potter ships goods');
  a(T.getTrade('carpenter').modalities.length === 2, 'Carpenter is hybrid (goods + service)');
  a(T.getTrade('tour_guide').modalities.includes(T.MODALITY.EXPERIENCE), 'Tour guide is an experience');
}

sec('Onboarding profile adapts per trade — one core, different fulfilment');
{
  const cobbler = T.onboardingProfile('cobbler');
  a(cobbler.fulfilment === 'local_service' && cobbler.logistics_needed === false, 'Cobbler → local service, no logistics');
  a(cobbler.fields_required.includes('service_location'), 'Service trade collects a service location');
  const potter = T.onboardingProfile('potter');
  a(potter.fulfilment === 'shipped_goods' && potter.logistics_needed === true, 'Potter → shipped goods, needs logistics');
  const guide = T.onboardingProfile('tour_guide');
  a(guide.fulfilment === 'scheduled_experience', 'Guide → scheduled experience');
  a(guide.verification_required.includes('safety_gate'), 'Experience requires a safety gate');
  // ALL trades use the same core
  a([cobbler, potter, guide].every((p) => p.uses_core.includes('money_split') && p.uses_core.includes('never_in_loss')), 'Every trade uses the same money + safety core');
}

sec('Verification differs appropriately');
{
  a(T.getTrade('gi_weaver').verify.includes('gi_authorised_user'), 'GI weaver needs GI authorised-user status');
  a(T.getTrade('jeweller').verify.includes('hallmark'), 'Jeweller needs hallmark');
  a(T.getTrade('cobbler').verify.includes('skill'), 'Service trades verify demonstrable skill');
  a(T.getTrade('naturals_maker').verify.includes('organic_or_recycled_evidence'), 'Naturals maker needs impact evidence');
}

sec('Adding a trade is data, not code');
{
  a(T.listTrades().every((t) => t.key && t.label && t.category && t.modalities && t.price_band_paise), 'Every trade is a complete data entry');
  a(T.getTrade('nonexistent') === null, 'Unknown trade → null');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
