'use strict';

/**
 * test-mirror-parity.js
 *
 * The in-browser COOP_* and SCH_* helpers in public/index.html shadow
 * src/cooperativeSplit.js and src/schemes.js. They MUST behave identically
 * — same input → same output — or the UI silently misreports things the
 * backend tests pass.
 *
 * This test executes both implementations on identical inputs and asserts
 * the results match. Any drift (intentional or accidental) fails CI before
 * the user sees it.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// Load the SPA source + extract the script
const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const inBrowser = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const srcCoopText    = fs.readFileSync(path.join(__dirname, 'src/cooperativeSplit.js'), 'utf8');
const srcSchemesText = fs.readFileSync(path.join(__dirname, 'src/schemes.js'), 'utf8');

const srcCoop    = require('./src/cooperativeSplit');
const srcSchemes = require('./src/schemes');

// ────────────────────────────────────────────────────────────
// COOPERATIVE SPLIT — load in-browser version into a VM
// ────────────────────────────────────────────────────────────
const coopCtx = { Math, console, JSON, Date };
vm.createContext(coopCtx);
const coopBrowserCode = inBrowser.match(/const COOP_TOTAL_BPS[\s\S]*?function COOP_split[\s\S]*?\n\}/);
if (coopBrowserCode) {
  vm.runInContext(
    coopBrowserCode[0]
    + '; this.COOP_split = COOP_split; this.COOP_validate = COOP_validate; this.COOP_TOTAL_BPS = COOP_TOTAL_BPS;',
    coopCtx
  );
}

sec('COOP TOTAL_BPS — both equal 10000 (1 bps = 0.01 %)');
{
  a(srcCoop.TOTAL_BPS === 10000,    'src/cooperativeSplit.TOTAL_BPS === 10000');
  a(coopCtx.COOP_TOTAL_BPS === 10000, 'in-browser COOP_TOTAL_BPS === 10000');
}

sec('COOP split math — identical paise across many inputs');
{
  const beneficiaries = [
    { id: 'a', name: 'A', share_bps: 3500 },
    { id: 'b', name: 'B', share_bps: 3500 },
    { id: 'c', name: 'C', share_bps: 3000 },
  ];
  // Many amounts including tricky rounding cases
  for (const amt of [0, 1, 3, 99, 100, 333, 1580, 10000, 100000, 1234567]) {
    const srcResult     = srcCoop.splitMakerShare(amt, beneficiaries);
    const browserResult = coopCtx.COOP_split(amt, beneficiaries);
    const srcTotal     = srcResult.allocations.reduce((s,x)=>s+x.paise, 0);
    const browserTotal = browserResult.allocations.reduce((s,x)=>s+x.paise, 0);
    a(srcTotal === amt,                       `src reconciles at ${amt}p`);
    a(browserTotal === amt,                    `browser reconciles at ${amt}p`);
    const samePerAlloc = srcResult.allocations.every((x, i) => x.paise === browserResult.allocations[i].paise);
    a(samePerAlloc,                            `per-allocation identical at ${amt}p`);
  }
}

sec('COOP validation — both reject the same bad inputs');
{
  // sum != 10000
  let srcThrew = false, browserThrew = false;
  try { srcCoop.validateBeneficiaries([{id:'a',name:'A',share_bps:5000},{id:'b',name:'B',share_bps:6000}]); } catch { srcThrew = true; }
  try { coopCtx.COOP_validate([{id:'a',name:'A',share_bps:5000},{id:'b',name:'B',share_bps:6000}]); } catch { browserThrew = true; }
  a(srcThrew === browserThrew && srcThrew === true, 'bad sum: both throw');

  // negative share
  srcThrew = false; browserThrew = false;
  try { srcCoop.validateBeneficiaries([{id:'a',name:'A',share_bps:-100},{id:'b',name:'B',share_bps:10100}]); } catch { srcThrew = true; }
  try { coopCtx.COOP_validate([{id:'a',name:'A',share_bps:-100},{id:'b',name:'B',share_bps:10100}]); } catch { browserThrew = true; }
  a(srcThrew === browserThrew && srcThrew === true, 'negative share: both throw');

  // empty
  srcThrew = false; browserThrew = false;
  try { srcCoop.validateBeneficiaries([]); } catch { srcThrew = true; }
  try { coopCtx.COOP_validate([]); } catch { browserThrew = true; }
  a(srcThrew === browserThrew && srcThrew === true, 'empty list: both throw');
}

// ────────────────────────────────────────────────────────────
// SCHEMES — load in-browser version
// ────────────────────────────────────────────────────────────
const schCtx = { Math, console, JSON, Date };
vm.createContext(schCtx);
const schBrowserCode = inBrowser.match(/const SCHEMES_REGISTRY[\s\S]*?function SCH_findEligible[\s\S]*?\n\}/);
if (schBrowserCode) {
  vm.runInContext(
    schBrowserCode[0]
    + '; this.SCH_findEligible = SCH_findEligible; this.SCH_evalScheme = SCH_evalScheme; this.SCHEMES_REGISTRY = SCHEMES_REGISTRY;',
    schCtx
  );
}

sec('SCHEME REGISTRY — same set of schemes');
{
  const srcIds = Object.keys(srcSchemes.SCHEMES).sort();
  const browserIds = Object.keys(schCtx.SCHEMES_REGISTRY).sort();
  a(srcIds.length === browserIds.length, `count matches: ${srcIds.length}`);
  a(JSON.stringify(srcIds) === JSON.stringify(browserIds), `ids identical: ${srcIds.join(',')}`);
}

sec('SCHEME ELIGIBILITY — same profile returns same eligible set');
{
  const profiles = [
    {
      name: 'Karigar — undocumented woman artisan',
      profile: { age: 38, gender: 'female', category: 'obc', has_aadhaar: true, has_bank_account: true, craft_category: 'pottery', state: 'UP', is_first_business: true },
    },
    {
      name: 'Niryatak — registered exporter',
      profile: { age: 42, gender: 'male', has_aadhaar: true, has_bank_account: true, has_gst: true, is_msme_registered: true, business_age_months: 24, craft_category: 'gems_jewellery' },
    },
    {
      name: 'Stand-Up India target — female SC',
      profile: { age: 28, gender: 'female', category: 'sc', has_aadhaar: true, has_bank_account: true, craft_category: 'handicraft', is_first_business: true },
    },
    {
      name: 'Older artisan (50yo) — PMKVY excludes',
      profile: { age: 50, gender: 'male', has_aadhaar: true, has_bank_account: true, craft_category: 'handicraft' },
    },
    {
      name: 'Bare profile — minimal',
      profile: { age: 30, has_aadhaar: true, has_bank_account: true },
    },
    {
      name: 'Empty profile',
      profile: {},
    },
  ];
  profiles.forEach(({ name, profile }) => {
    const srcResult = srcSchemes.findEligibleSchemes(profile);
    const browserResult = schCtx.SCH_findEligible(profile);
    const srcSet = srcResult.map(r => r.scheme.id).sort();
    const browserSet = browserResult.map(r => r.scheme.id).sort();
    a(JSON.stringify(srcSet) === JSON.stringify(browserSet),
      `"${name}": eligible set identical (${srcSet.length} schemes)`);
  });
}

sec('SCHEME EVAL — failure reasons match for ineligible schemes');
{
  // For an older artisan, PMKVY should fail with age_max criterion in both
  const profile = { age: 50, has_aadhaar: true, has_bank_account: true };
  const srcEval = srcSchemes.evaluateScheme(srcSchemes.SCHEMES.pmkvy, profile);
  const browserEval = schCtx.SCH_evalScheme(schCtx.SCHEMES_REGISTRY.pmkvy, profile);
  a(srcEval.eligible === browserEval.eligible,
    `pmkvy@age50: both ${srcEval.eligible ? 'eligible' : 'ineligible'}`);
  // Both report at least one failed criterion related to age
  const srcMentionsAge = (srcEval.failedCriteria || []).some(f => /age/i.test(f.criterion || f.reason || ''));
  const browserMentionsAge = (browserEval.failed || browserEval.failedCriteria || []).some(f => /age/i.test(typeof f === 'string' ? f : (f.criterion || f.reason || '')));
  a(srcMentionsAge && browserMentionsAge, 'both surface age as the failure reason');
}

// ────────────────────────────────────────────────────────────
// AI TOOLS — same parity check
// ────────────────────────────────────────────────────────────
const srcAITools = require('./src/aiTools');
const aiCtx = { Math, console, JSON, Date, fetch: () => Promise.resolve({ ok: false }) };
vm.createContext(aiCtx);
// Pull out the AI_TOOLS object + helpers from in-browser code
const aiBrowserCode = inBrowser.match(/const AI_TOOL_AUTONOMY[\s\S]*?function AI_toolsForAnthropic[\s\S]*?\n\}/);
if (aiBrowserCode) {
  // The in-browser executor reads/writes window._SRC; in the test context
  // we mount a stub `window` object directly on the ctx (since we can't
  // assign global.window cleanly in Node 22+, but we CAN inject via vm).
  vm.runInContext(
    'var window = { _SRC: { leads: [] } };'
    + aiBrowserCode[0]
    + '; this.AI_TOOLS = AI_TOOLS; this.AI_validateToolCall = AI_validateToolCall;'
    + '  this.AI_executeTool = AI_executeTool; this.AI_toolsForAnthropic = AI_toolsForAnthropic;'
    + '  this.setState = (s) => { window._SRC.leads = s.leads || []; };'
    + '  this.getState = () => ({ leads: window._SRC.leads });',
    aiCtx
  );
}

sec('AI TOOLS REGISTRY — src tools are subset of browser tools');
{
  const srcToolNames = Object.keys(srcAITools.TOOLS).sort();
  const browserToolNames = Object.keys(aiCtx.AI_TOOLS).sort();
  // Every src tool MUST be in the browser. Browser MAY have more
  // (server-backed registry tools added on top of the src baseline).
  const missing = srcToolNames.filter(n => !browserToolNames.includes(n));
  a(missing.length === 0,
    `Browser has all src tools (missing: ${missing.join(', ') || 'none'})`);
  a(srcToolNames.length === 5, '5 src-side tools (4 read-only + 1 mutating)');
  // Browser-only tools are explicitly the registry-backed ones
  const browserOnly = browserToolNames.filter(n => !srcToolNames.includes(n));
  for (const name of browserOnly) {
    a(aiCtx.AI_TOOLS[name].server_backed === true,
      `Browser-only tool "${name}" is server_backed`);
  }
}

sec('AI TOOLS — autonomy + sensitive + mutating flags match per src tool');
{
  Object.keys(srcAITools.TOOLS).forEach(name => {
    const src = srcAITools.TOOLS[name];
    const browser = aiCtx.AI_TOOLS[name];
    a(src.autonomy === browser.autonomy, `${name}: same autonomy (${src.autonomy})`);
    a(src.sensitive === browser.sensitive, `${name}: same sensitive flag (${src.sensitive})`);
    a((src.mutating || false) === (browser.mutating || false),
      `${name}: same mutating flag (${src.mutating || false})`);
  });
}

sec('AI TOOLS — toolsForAnthropic — src tools all present in browser');
{
  const srcTools = srcAITools.toolsForAnthropic();
  const browserTools = aiCtx.AI_toolsForAnthropic();
  // Browser has src tools + 6 server-backed registry tools
  a(browserTools.length >= srcTools.length,
    `Browser ≥ src count (browser: ${browserTools.length}, src: ${srcTools.length})`);
  // Every src tool must appear in browser
  const srcNames = srcTools.map(t => t.name);
  const browserNames = browserTools.map(t => t.name);
  const allSrcInBrowser = srcNames.every(n => browserNames.includes(n));
  a(allSrcInBrowser, 'All src tools exposed in browser');
  // No executor leak in either
  a(srcTools.every(t => !('executor' in t)), 'src: no executor leak');
  a(browserTools.every(t => !('executor' in t)), 'browser: no executor leak');
}

sec('AI TOOLS — execution: search_leads produces same result');
(async () => {
  const fixtureLeads = [
    { id: 'l1', name: 'Surat Diamond', source: 'gjepc', segment: 'niryatak_prospect', status: 'new', score: 92, createdAt: 1000 },
    { id: 'l2', name: 'Bhuj Bandhani', source: 'gi', segment: 'sansthan_prospect', status: 'researched', score: 78, createdAt: 2000 },
    { id: 'l3', name: 'Khurja Potters', source: 'state', segment: 'karigar_prospect', status: 'new', score: 58, createdAt: 3000 },
  ];
  const srcResult = srcAITools.executeTool('search_leads', { segment: 'karigar_prospect' }, { leads: fixtureLeads });
  // Inject same state into browser context
  aiCtx.setState({ leads: fixtureLeads });
  const browserResult = await aiCtx.AI_executeTool('search_leads', { segment: 'karigar_prospect' });
  a(srcResult.ok && browserResult.ok, 'Both succeed');
  a(srcResult.result.total_matched === browserResult.result.total_matched,
    `Total matched matches: ${srcResult.result.total_matched}`);
  a(JSON.stringify(srcResult.result.leads.map(l=>l.id)) === JSON.stringify(browserResult.result.leads.map(l=>l.id)),
    'Same leads returned in same order');
})()
.then(() => { sec('AI TOOLS — execution: summarize_funnel produces same result'); })
.then(async () => {
  const fixtureLeads = [
    { id: 'l1', status: 'new', score: 90 }, { id: 'l2', status: 'new', score: 80 },
    { id: 'l3', status: 'researched', score: 70 }, { id: 'l4', status: 'contacted', score: 60 },
    { id: 'l5', status: 'qualified', score: 95 }, { id: 'l6', status: 'dormant', score: 10 },
  ];
  const srcResult = srcAITools.executeTool('summarize_funnel', {}, { leads: fixtureLeads });
  aiCtx.setState({ leads: fixtureLeads });
  const browserResult = await aiCtx.AI_executeTool('summarize_funnel', {});
  a(srcResult.ok && browserResult.ok, 'Both succeed');
  a(srcResult.result.total_leads === browserResult.result.total_leads,
    `Total: ${srcResult.result.total_leads}`);
  a(JSON.stringify(srcResult.result.status_breakdown) === JSON.stringify(browserResult.result.status_breakdown),
    'Same status breakdown');
  a(srcResult.result.leakiest_step === browserResult.result.leakiest_step,
    `Same leakiest step: ${srcResult.result.leakiest_step}`);
  a(JSON.stringify(srcResult.result.top_3_by_score.map(t=>t.score)) === JSON.stringify(browserResult.result.top_3_by_score.map(t=>t.score)),
    'Same top-3 scores');
})
.then(() => { sec('AI TOOLS — validation: same errors for same bad input'); })
.then(() => {
  // Bad enum value
  const srcV = srcAITools.validateToolCall('search_leads', { segment: 'bogus' });
  const browserV = aiCtx.AI_validateToolCall('search_leads', { segment: 'bogus' });
  a(!srcV.ok && !browserV.ok, 'Both reject bad enum');
  // Missing required field
  const srcV2 = srcAITools.validateToolCall('get_lead', {});
  const browserV2 = aiCtx.AI_validateToolCall('get_lead', {});
  a(!srcV2.ok && !browserV2.ok, 'Both reject missing required');
  // Unknown tool
  const srcV3 = srcAITools.validateToolCall('not_real', {});
  const browserV3 = aiCtx.AI_validateToolCall('not_real', {});
  a(!srcV3.ok && !browserV3.ok, 'Both reject unknown tool');
})
.then(() => { sec('AI TOOLS — transition_lead happy path: both produce same result'); })
.then(async () => {
  const lead = {
    id: 'lead_p1', name: 'Parity Test Co', source: 'gjepc',
    segment: 'niryatak_prospect', status: 'new', score: 80,
    createdAt: 1000, contactHandles: {}, history: [],
  };
  // src expects state.leads; browser uses internal window._SRC.leads
  const srcResult = srcAITools.executeTool('transition_lead', {
    lead_id: 'lead_p1', new_status: 'researched',
  }, { leads: [lead] });
  // Browser mutates window._SRC.leads — set it up before the call
  aiCtx.setState({ leads: [JSON.parse(JSON.stringify(lead))] });
  const browserResult = await aiCtx.AI_executeTool('transition_lead', {
    lead_id: 'lead_p1', new_status: 'researched',
  });
  a(srcResult.ok && browserResult.ok, 'Both succeed at top level');
  a(srcResult.result.ok && browserResult.result.ok, 'Both inner results ok');
  a(srcResult.result.previous_status === browserResult.result.previous_status,
    `Same previous_status: ${srcResult.result.previous_status}`);
  a(srcResult.result.new_status === browserResult.result.new_status,
    `Same new_status: ${srcResult.result.new_status}`);
  a(srcResult.result.updated_lead.status === browserResult.result.updated_lead.status,
    'Updated lead status matches');
  a(srcResult.result.updated_lead.history.length === browserResult.result.updated_lead.history.length,
    'History grew identically');
})
.then(() => { sec('AI TOOLS — transition_lead invalid transition: same rejection in both'); })
.then(async () => {
  const lead = { id: 'lead_p2', name: 'X', status: 'new', history: [] };
  const srcResult = srcAITools.executeTool('transition_lead', {
    lead_id: 'lead_p2', new_status: 'onboarded',
  }, { leads: [lead] });
  aiCtx.setState({ leads: [JSON.parse(JSON.stringify(lead))] });
  const browserResult = await aiCtx.AI_executeTool('transition_lead', {
    lead_id: 'lead_p2', new_status: 'onboarded',
  });
  a(srcResult.ok && browserResult.ok, 'Both top-level ok (no throw)');
  a(srcResult.result.ok === false && browserResult.result.ok === false,
    'Both inner result.ok === false');
  // Both error messages mention "Invalid transition"
  a(/Invalid transition/.test(srcResult.result.error)
    && /Invalid transition/.test(browserResult.result.error),
    'Both error messages name the state machine violation');
})
.then(() => {
  sec('AI TOOLS — toolsForAnthropic includes transition_lead, no mutating leak');
  const srcTools = srcAITools.toolsForAnthropic();
  const browserTools = aiCtx.AI_toolsForAnthropic();
  const srcHasTL = srcTools.find(t => t.name === 'transition_lead');
  const browserHasTL = browserTools.find(t => t.name === 'transition_lead');
  a(srcHasTL && browserHasTL, 'Both expose transition_lead');
  // mutating flag must NOT be in the Anthropic descriptor
  a(!('mutating' in srcHasTL), 'src: mutating flag stripped');
  a(!('mutating' in browserHasTL), 'browser: mutating flag stripped');
  // schema is the same
  a(JSON.stringify(srcHasTL.input_schema) === JSON.stringify(browserHasTL.input_schema),
    'transition_lead input schema matches');

  const srcTl = srcTools.find(t => t.name === 'transition_lead');
  const browserTl = browserTools.find(t => t.name === 'transition_lead');
  a(!('autonomy' in srcTl), 'src: no autonomy field leak');
  a(!('autonomy' in browserTl), 'browser: no autonomy field leak');

  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})
.catch(e => {
  console.error('UNHANDLED ERROR:', e);
  process.exit(1);
});
