'use strict';

const L = require('./src/listingAssistant');
const translateRouter = require('./src/translateRouter');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Turns a few spoken words into a complete draft listing');
{
  const r = L.draftListing({ trade: 'potter', phrase: 'blue pottery vase with peacock design', language: 'hi' });
  a(r.ok === true, 'Produces a draft');
  a(r.draft.title && r.draft.description, 'Has title + description');
  a(Array.isArray(r.draft.tags) && r.draft.tags.length > 0, 'Suggests tags');
  a(Array.isArray(r.draft.suggested_price_band_paise) && r.draft.suggested_price_band_paise.length === 2, 'Suggests a price band from the trade');
  a(r.draft.photo_guidance.length >= 3, 'Gives concrete photo guidance (solves the photo gap)');
  a(r.needs_review === true, 'Marked needs-review — maker confirms');
}

sec('Service trades get service-appropriate guidance');
{
  const r = L.draftListing({ trade: 'cobbler', phrase: 'leather shoe resole and polish' });
  a(/booked locally|skilled|work/i.test(r.draft.description), 'Service framing, not "handmade product"');
  a(r.draft.modality === 'local_service', 'Modality is local service');
}

sec('Anti-fabrication: never asserts an unsubstantiated claim');
{
  const r = L.draftListing({ trade: 'naturals_maker', phrase: 'organic recycled eco handbag' });
  a(r.evidence_prompts.length >= 2, 'Claim words become EVIDENCE PROMPTS, not asserted facts');
  a(r.evidence_prompts.some((e) => e.claim === 'organic'), 'Flags "organic" for evidence');
  a(!/\borganic\b/i.test(r.draft.title) || r.note.includes('evidence'), 'Does not publish the claim as fact without evidence');
  a(/evidence/i.test(r.note), 'Note explains claims need evidence');
  a(L.detectClaims('pure genuine handmade').length === 3, 'Detects multiple claim words');
}

sec('Honest AI seam');
{
  const mock = L.makeAIProvider({});
  a(mock.kind === 'mock_ai' && mock.live === false, 'Mock AI by default, honestly labelled');
  const r = L.draftListing({ trade: 'potter', phrase: 'vase' }, mock);
  a(r.draft.generated_by === 'mock_ai', 'Draft marks it was mock-generated');
  const live = L.makeAIProvider({ anthropicApiKey: 'k' });
  a(live.kind === 'anthropic' && live.live === true, 'Real provider slot on a key');
}

sec('Localizes into the maker\u2019s language (Bhashini route)');
{
  return (async () => {
    const r = L.draftListing({ trade: 'potter', phrase: 'blue pottery vase' });
    const loc = await L.localize(r.draft, 'hi', translateRouter);
    a(loc.ok === true, 'Localizes a confirmed draft');
    a(loc.listings.en && loc.listings.hi, 'Renders English + Hindi');
    a(!!loc.listings.hi.translated_by, 'Marks which provider translated (Bhashini route)');
    const en = await L.localize(r.draft, 'en', translateRouter);
    a(en.listings.en && !en.listings.hi, 'English maker → no translation needed');

    a(L.draftListing({ trade: 'potter', phrase: '' }).ok === false, 'Empty phrase → asks for input');
    a(L.draftListing({ trade: 'nope', phrase: 'x' }).ok === false, 'Unknown trade → reason');

    console.log('\n' + '='.repeat(50));
    console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
    console.log('='.repeat(50));
    process.exit(fail > 0 ? 1 : 0);
  })();
}
