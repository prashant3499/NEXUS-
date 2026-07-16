'use strict';

const C = require('./src/contentStudio');
const listingAssistant = require('./src/listingAssistant');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Capability map: what the AI can build');
{
  const c = C.capabilities();
  a(c.can_build.length >= 6, `Catalogs multiple content types (${c.can_build.length})`);
  a(c.for_summary.maker.includes('product_listing'), 'For makers: product listing');
  a(c.for_summary.platform.includes('presentation'), 'For platform: presentation');
  a(c.for_summary.government.includes('government_outreach'), 'For government: outreach package');
  a(c.can_build.every((x) => x.type && x.for && x.builds && x.generator && x.live_on), 'Each entry: type, for, builds, generator, live status');
}

sec('Honest about what it CANNOT build');
{
  const c = C.capabilities();
  a(c.cannot_build.some((x) => /image|photo/i.test(x)), 'No image generation (guides instead)');
  a(c.cannot_build.some((x) => /audio|video/i.test(x)), 'No audio/video');
  a(c.cannot_build.some((x) => /claim/i.test(x)), 'No unsubstantiated claims');
}

sec('Generation routes to the right generator');
{
  const ai = listingAssistant.MockAIProvider();
  const listing = C.generate('product_listing', { trade: 'potter', phrase: 'blue pottery vase', language: 'hi' }, { listingAI: ai });
  a(listing.ok && listing.draft && listing.draft.title, 'Builds a product listing');
  const photo = C.generate('photo_guidance', { trade: 'cobbler' }, { listingAI: ai });
  a(photo.ok && photo.photo_guidance.length >= 3, 'Builds photo guidance');
  const pres = C.generate('presentation', { audience: 'government' }, { brand: 'KalaSetu' });
  a(pres.ok && JSON.stringify(pres.presentation).includes('KalaSetu'), 'Builds a brand-aware presentation');
  const growth = C.generate('growth_plan', { vertical: 'gi' });
  a(growth.ok && growth.plan.government_and_network_channels.length > 0, 'Builds a growth plan');
  const gov = C.generate('government_outreach', { body: 'UP ODOP Cell', level: 'state', vertical: 'gi', artisans: 400 });
  a(gov.ok && /Subject:/.test(gov.package.draft_outreach), 'Builds government outreach');
  const lift = C.generate('sales_lift', { maker: { name: 'Ramvati' } });
  a(lift.ok && lift.lift.levers.length > 0, 'Builds sales-lift advice');
  a(C.generate('nonsense', {}).ok === false, 'Unknown type → error with options');
}

sec('Inherited guarantees: never fabricates, never overstates');
{
  const ai = listingAssistant.MockAIProvider();
  const claimy = C.generate('product_listing', { trade: 'naturals_maker', phrase: 'organic eco recycled bag' }, { listingAI: ai });
  a(claimy.evidence_prompts && claimy.evidence_prompts.length >= 2, 'Claim words → evidence prompts, not fabricated facts');
  const pres = C.generate('presentation', { audience: 'investor' }, {});
  a(/pre-revenue|pilot|honest/i.test(JSON.stringify(pres.presentation).toLowerCase()), 'Presentation carries honest status');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
