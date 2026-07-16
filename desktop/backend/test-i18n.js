'use strict';

const i18n = require('./src/i18n');
const { TABLES } = require('./src/i18nStrings');
const B = require('./src/bhashini');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// ────────────────────────────────────────────────────────────
sec('LOCALES — priority list shape');
{
  a(i18n.LOCALES.length === 13, '13 locales declared (12 Indian languages + English)');
  a(i18n.LOCALES[0].code === 'en', 'English is first');
  a(i18n.LOCALES[1].code === 'hi', 'Hindi is second (pilot language)');
  a(i18n.LOCALES.find(l => l.code === 'ur').rtl === true, 'Urdu is flagged RTL');
  a(i18n.LOCALES.every(l => l.native && l.native.length > 0), 'Every locale has a native-script name');
  a(i18n.LOCALE_CODES.includes('ta') && i18n.LOCALE_CODES.includes('bn'), 'Tamil and Bengali included');
}

// ────────────────────────────────────────────────────────────
sec('RESOLUTION — preference priority');
{
  a(i18n.resolveLocale({ user: 'hi' }) === 'hi', 'User preference wins');
  a(i18n.resolveLocale({ user: 'xx' }) === 'en', 'Invalid user preference falls back to en');
  a(i18n.resolveLocale({ browser: 'hi-IN' }) === 'hi', 'Browser hint parsed (hi-IN → hi)');
  a(i18n.resolveLocale({ browser: 'en-GB' }) === 'en', 'en-GB → en');
  a(i18n.resolveLocale({ browser: 'TA-IN' }) === 'ta', 'Case-insensitive');
  a(i18n.resolveLocale({}) === 'en', 'No hints → default en');
  a(i18n.resolveLocale({ user: 'hi', browser: 'en' }) === 'hi', 'User beats browser');
}

// ────────────────────────────────────────────────────────────
sec('LOOKUP — direct key resolution');
{
  a(i18n.lookup('en', 'common.confirm') === 'Confirm', 'English direct hit');
  a(i18n.lookup('hi', 'common.confirm') === 'पक्का', 'Hindi direct hit');
  a(i18n.lookup('hi', 'nav.orders') === 'ऑर्डर', 'Hindi navigation key');
  a(i18n.lookup('en', 'does.not.exist') === 'does.not.exist', 'Missing key returns the key itself (visible miss)');
}

// ────────────────────────────────────────────────────────────
sec('FALLBACK — locale missing key falls back to English');
{
  // 'bn' (Bengali) table is empty in this pilot — should fall through to en
  a(i18n.lookup('bn', 'common.confirm') === 'Confirm', 'Bengali falls back to English for unfilled keys');
  a(i18n.lookup('ta', 'nav.orders') === 'Orders', 'Tamil falls back to English');
  a(i18n.lookup('hi', 'common.confirm') === 'पक्का', 'Hindi still uses its own translation when present');
}

// ────────────────────────────────────────────────────────────
sec('INTERPOLATION — variable substitution');
{
  a(i18n.interpolate('Hello {name}', { name: 'Ramvati' }) === 'Hello Ramvati', 'Single var replaced');
  a(i18n.interpolate('{a} and {b}', { a: 'X', b: 'Y' }) === 'X and Y', 'Multiple vars replaced');
  a(i18n.interpolate('No vars here', {}) === 'No vars here', 'No vars → unchanged');
  a(i18n.interpolate('Missing {x}', {}) === 'Missing {x}', 'Missing var left as placeholder (visible)');
  a(i18n.interpolate('Twice: {x} and {x}', { x: 'Y' }) === 'Twice: Y and Y', 'Same var used twice replaces both');
}

// ────────────────────────────────────────────────────────────
sec('t() — full pipeline');
{
  a(i18n.t('common.confirm', { locale: 'en' }) === 'Confirm', 'English confirm');
  a(i18n.t('common.confirm', { locale: 'hi' }) === 'पक्का', 'Hindi confirm');
  a(i18n.t('common.confirm', { locale: 'bn' }) === 'Confirm', 'Bengali falls back through t()');
  const v = i18n.t('buyer.trust.where_money_goes', { locale: 'hi', params: { total: '1,580', toMaker: '1,418.77' } });
  a(v.includes('1,580') && v.includes('1,418.77'), 'Variable interpolation through t() in Hindi');
  a(v.includes('₹'), 'Currency symbol preserved');
}

// ────────────────────────────────────────────────────────────
sec('COVERAGE — pilot completeness check');
{
  const en = i18n.coverage('en');
  a(en.pct === 100, 'English is 100% by definition');
  a(en.missing.length === 0, 'No missing keys for English');

  const hi = i18n.coverage('hi');
  a(hi.pct === 100 && hi.missing.length === 0,
    `Hindi pilot is 100% covered (got ${hi.pct}%, ${hi.missing.length} missing)`);

  const bn = i18n.coverage('bn');
  a(bn.pct === 0, 'Bengali coverage is 0% (declared empty, falls back to en)');
  a(bn.missing.length > 50, 'Bengali missing list lists every key');
}

// ────────────────────────────────────────────────────────────
sec('COVERAGE — report across all locales');
{
  const r = i18n.coverageReport();
  a(r.length === 13, 'Report covers all 13 declared locales');
  a(r.find(c => c.locale === 'en').pct === 100, 'English is 100% in report');
  a(r.find(c => c.locale === 'hi').pct === 100, 'Hindi is 100% in report');
  a(r.filter(c => c.pct === 0).length === 11, '11 locales are pending (declared but unpopulated)');
}

// ────────────────────────────────────────────────────────────
sec('SEMANTICS — critical seller screens have proper Hindi translations');
{
  // Check that translations are not just lazy English copies (which would
  // pass coverage but fail the spirit). Each Hindi string should differ
  // from the English on these specific keys.
  const checks = [
    'seller.onboard.title',
    'seller.products.title',
    'seller.orders.title',
    'seller.payouts.title',
    'seller.payouts.platform_never_holds',
    'seller.products.add.story',
    'seller.orders.expected_payout',
  ];
  for (const key of checks) {
    const en = i18n.lookup('en', key);
    const hi = i18n.lookup('hi', key);
    a(en !== hi, `Hindi differs from English on critical key "${key}"`);
  }
}

// ────────────────────────────────────────────────────────────
sec('BHASHINI — supported languages');
{
  a(B.supports('hi'), 'Hindi supported');
  a(B.supports('en'), 'English supported');
  a(B.supports('sat'), 'Santhali supported (low-resource: where Bhashini is uniquely valuable)');
  a(!B.supports('xx'), 'Unknown lang not supported');
  a(B.BHASHINI_LANGS.length >= 22, 'At least 22 languages declared');
}

// ────────────────────────────────────────────────────────────
sec('BHASHINI — mock ASR contract');
(async () => {
  const ok = await B.callBhashini('asr', { audioRef: 'mock-audio-ref', sourceLang: 'hi' });
  a(ok.ok === true,                       'ASR succeeds with valid input');
  a(typeof ok.output === 'string',        'Output is a string transcript');
  a(ok.output.length > 0,                 'Transcript non-empty');
  a(ok.provider === 'mock',               'Reports the mock provider');
  a(typeof ok.latencyMs === 'number',     'Reports latency');
  a(ok.reasons.length > 0,                'Includes audit reasons');

  const noAudio = await B.callBhashini('asr', { sourceLang: 'hi' });
  a(noAudio.ok === false,                 'Missing audio → fails cleanly');
  a(noAudio.reasons.some(r => /audio/i.test(r.text)), 'Reason mentions missing audio');

  const badLang = await B.callBhashini('asr', { audioRef: 'x', sourceLang: 'xx' });
  a(badLang.ok === false,                 'Unsupported language → fails cleanly');

  // ──────────────────────────────────────────────────────────
  sec('BHASHINI — mock NMT contract');
  const nmt = await B.callBhashini('nmt', { text: 'Hello', sourceLang: 'en', targetLang: 'hi' });
  a(nmt.ok === true,            'NMT succeeds with valid input');
  a(nmt.output === 'नमस्ते',    'Mock returns known translation pair');

  const same = await B.callBhashini('nmt', { text: 'No translation', sourceLang: 'hi', targetLang: 'hi' });
  a(same.ok === true && same.output === 'No translation', 'Same-language NMT is a passthrough');

  const empty = await B.callBhashini('nmt', { text: '', sourceLang: 'en', targetLang: 'hi' });
  a(empty.ok === false,         'Empty text → fails');

  // ──────────────────────────────────────────────────────────
  sec('BHASHINI — mock TTS contract');
  const tts = await B.callBhashini('tts', { text: 'पक्का', lang: 'hi' });
  a(tts.ok === true,                                       'TTS succeeds');
  a(typeof tts.output === 'string' && tts.output.startsWith('mock://bhashini/tts/hi/'),
    'Returns a mock audio reference URL');

  const ttsBad = await B.callBhashini('tts', { text: 'x', lang: 'xx' });
  a(ttsBad.ok === false, 'Unsupported lang fails cleanly');

  // ──────────────────────────────────────────────────────────
  sec('BHASHINI — unknown task');
  const unknown = await B.callBhashini('not_a_task', {});
  a(unknown.ok === false,                                  'Unknown task fails');
  a(unknown.reasons.some(r => /unknown task/i.test(r.text)), 'Reason names the issue');

  // ──────────────────────────────────────────────────────────
  sec('BHASHINI — real provider needs credentials');
  let threw = false;
  try { B.makeRealBhashiniProvider({}); } catch (e) { threw = true; }
  a(threw, 'Real provider throws without credentials (no silent degradation)');

  const real = B.makeRealBhashiniProvider({ apiKey: 'k', pipelineId: 'p' });
  const realRes = await B.callBhashini('nmt', { text: 'x', sourceLang: 'en', targetLang: 'hi' }, real);
  a(realRes.ok === false && /not implemented/i.test(realRes.reasons[0].text),
    'Real provider with creds but no HTTP impl returns structured error (not throw)');

  // ──────────────────────────────────────────────────────────
  sec('GLOBAL TRANSLATE — supported languages');
  const G = require('./src/globalTranslate');
  a(G.supports('fr') && G.supports('es') && G.supports('de'), 'Major European languages supported');
  a(G.supports('ar') && G.supports('zh') && G.supports('ja'),  'Arabic / Chinese / Japanese supported');
  a(G.isRTL('ar') && G.isRTL('he'),                            'Arabic and Hebrew flagged RTL');
  a(!G.supports('hi'),                                          'Hindi NOT in global list (Bhashini handles it)');
  a(!G.supports('xx'),                                          'Unknown lang not supported');
  a(G.GLOBAL_LANGS.length >= 25,                                'At least 25 global languages declared');

  // ──────────────────────────────────────────────────────────
  sec('GLOBAL TRANSLATE — mock provider contract');
  const gOk = await G.translate('Hello', 'en', 'fr');
  a(gOk.ok === true,                          'Translate succeeds with valid pair');
  a(gOk.output === 'Bonjour',                 'Mock returns known translation');
  a(gOk.provider === 'mock-global',           'Reports mock-global provider');
  a(gOk.costPaise > 0,                        'Reports per-char cost');
  a(typeof gOk.latencyMs === 'number',        'Reports latency');

  const gSame = await G.translate('Hello', 'en', 'en');
  a(gSame.ok === true && gSame.output === 'Hello', 'Same-language passthrough');
  a(gSame.costPaise === 0,                          'Zero cost on passthrough');

  const gEmpty = await G.translate('', 'en', 'fr');
  a(gEmpty.ok === false,                      'Empty text fails');

  const gBadLang = await G.translate('Hello', 'en', 'xx');
  a(gBadLang.ok === false,                    'Unsupported target fails');

  // ──────────────────────────────────────────────────────────
  sec('GLOBAL TRANSLATE — cost estimation');
  a(G.estimateCostPaise('Hello') === 5 * G.COST_PER_CHAR_PAISE, 'Cost is char-count * per-char rate');
  a(G.estimateCostPaise('') === 0,                              'Empty text → 0 cost');
  a(G.estimateCostPaise(null) === 0,                            'Null → 0 cost (defensive)');

  // ──────────────────────────────────────────────────────────
  sec('GLOBAL TRANSLATE — real provider needs credentials');
  threw = false;
  try { G.makeRealGlobalProvider({}); } catch (e) { threw = true; }
  a(threw, 'Real global provider throws without { vendor, apiKey }');

  threw = false;
  try { G.makeRealGlobalProvider({ vendor: 'google' }); } catch (e) { threw = true; }
  a(threw, 'Real global provider throws with vendor but no apiKey');

  // ──────────────────────────────────────────────────────────
  sec('TRANSLATION ROUTER — picks the right provider per pair');
  const R = require('./src/translateRouter');

  const rIndic = R.pickProvider('en', 'hi');
  a(rIndic.provider === 'bhashini' && rIndic.costEstimatePaise === 0,
    'en → hi routes to Bhashini at ₹0');

  const rGlobal = R.pickProvider('en', 'fr');
  a(rGlobal.provider === 'global',
    'en → fr routes to global provider');

  const rIndic2 = R.pickProvider('hi', 'bn');
  a(rIndic2.provider === 'bhashini',
    'hi → bn (both Indic) routes to Bhashini');

  const rNone = R.pickProvider('xx', 'yy');
  a(rNone.provider === 'none', 'Unsupported pair → none');

  // ──────────────────────────────────────────────────────────
  sec('TRANSLATION ROUTER — end-to-end through providers');
  const tIndic = await R.translate('Hello', 'en', 'hi');
  a(tIndic.ok === true,                       'Indic route works end-to-end');
  a(tIndic.output === 'नमस्ते',                'Returns the Bhashini mock translation');
  a(tIndic.costPaise === 0,                   'Indic route reports zero cost');
  a(tIndic.reasons.some(r => /Indic/i.test(r.text)), 'Reason explains why Bhashini was picked');

  const tGlobal = await R.translate('Hello', 'en', 'fr');
  a(tGlobal.ok === true,                      'Global route works end-to-end');
  a(tGlobal.output === 'Bonjour',             'Returns the global mock translation');
  a(tGlobal.costPaise > 0,                    'Global route reports cost');

  const tSame = await R.translate('Hello', 'en', 'en');
  a(tSame.provider === 'passthrough',         'Same-language → passthrough');
  a(tSame.costPaise === 0,                    'Passthrough is free');

  const tEmpty = await R.translate('', 'en', 'fr');
  a(tEmpty.ok === false,                      'Empty input fails cleanly');

  // ──────────────────────────────────────────────────────────
  sec('TRANSLATION ROUTER — bulk translation tallies cost');
  const tBulk = await R.translateBulk('Hello', 'en', ['hi', 'fr', 'es', 'de']);
  a(Object.keys(tBulk.results).length === 4,    'Bulk produces results for all targets');
  a(tBulk.results.hi.ok && tBulk.results.fr.ok, 'Both Indic and Global targets succeed');
  a(tBulk.results.hi.costPaise === 0,           'Hindi (Bhashini) is free');
  a(tBulk.results.fr.costPaise > 0,             'French (Global) has cost');
  a(tBulk.totalCostPaise === tBulk.results.fr.costPaise + tBulk.results.es.costPaise + tBulk.results.de.costPaise,
    'Total cost = sum of non-zero entries (Hindi is free)');

  // ──────────────────────────────────────────────────────────
  console.log('\n' + '\u2550'.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('\u2550'.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
