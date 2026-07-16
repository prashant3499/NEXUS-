'use strict';

const T = require('./src/aiTools');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// Fixture state — a small but realistic platform snapshot
const fixtureState = {
  leads: [
    { id: 'lead_aaa1', name: 'Surat Diamond House',     source: 'gjepc_member_directory',  segment: 'niryatak_prospect', status: 'new',        score: 92, createdAt: Date.now() - 86400000, contactHandles: { phone: '+91 98765 43210', email: 'a@surat.example' }, notes: 'GJEPC member, IEC active', history: [{ at: Date.now() - 86400000, action: 'created' }] },
    { id: 'lead_aaa2', name: 'Bhuj Bandhani Cooperative', source: 'gi_tag_registered',     segment: 'sansthan_prospect',  status: 'researched', score: 78, createdAt: Date.now() - 172800000, contactHandles: { email: 'c@bhuj.example' }, history: [] },
    { id: 'lead_aaa3', name: 'Jaipur Heritage Tours',   source: 'tourism_operator_registry', segment: 'pravasi_prospect', status: 'contacted',  score: 65, createdAt: Date.now() - 259200000, contactHandles: { phone: '+91 99888 12345' }, history: [] },
    { id: 'lead_aaa4', name: 'Khurja Potters Guild',    source: 'state_handicraft_boards', segment: 'karigar_prospect',   status: 'new',        score: 58, createdAt: Date.now() - 3600000, contactHandles: {}, history: [] },
    { id: 'lead_aaa5', name: 'Ramvati Devi',            source: 'whatsapp_referral',       segment: 'karigar_prospect',   status: 'qualified',  score: 71, createdAt: Date.now() - 7200000, contactHandles: { phone: '+91 90000 00001' }, history: [] },
    { id: 'lead_aaa6', name: 'Old Lead',                source: 'whatsapp_referral',       segment: 'karigar_prospect',   status: 'dormant',    score: 12, createdAt: Date.now() - 99999999, contactHandles: {}, history: [] },
  ],
};

// ════════════════════════════════════════════════════════════
sec('REGISTRY shape');
{
  a(typeof T.TOOLS === 'object',                  'TOOLS is exported');
  a('search_leads' in T.TOOLS,                    'search_leads registered');
  a('get_lead' in T.TOOLS,                        'get_lead registered');
  a('summarize_funnel' in T.TOOLS,                'summarize_funnel registered');
  a('check_scheme_eligibility' in T.TOOLS,        'check_scheme_eligibility registered');
  Object.values(T.TOOLS).forEach(tool => {
    a(typeof tool.name === 'string' && tool.name.length > 0, `${tool.name}: has name`);
    a(typeof tool.description === 'string' && tool.description.length > 20, `${tool.name}: has substantive description`);
    a(typeof tool.input_schema === 'object',      `${tool.name}: has input_schema`);
    a(typeof tool.executor === 'function',        `${tool.name}: has executor`);
    a([T.AUTONOMY.AUTO, T.AUTONOMY.NOTIFY, T.AUTONOMY.MANUAL].includes(tool.autonomy),
                                                   `${tool.name}: autonomy is valid enum`);
    a(typeof tool.sensitive === 'boolean',         `${tool.name}: sensitive flag is bool`);
  });
}

// ════════════════════════════════════════════════════════════
sec('VALIDATION — unknown tool rejected');
{
  const v = T.validateToolCall('totally_not_a_tool', {});
  a(v.ok === false,                                'Unknown tool rejected');
  a(/Unknown/.test(v.error),                       'Error message names the problem');
}

sec('VALIDATION — non-object input rejected');
{
  a(!T.validateToolCall('search_leads', null).ok,       'null input rejected');
  a(!T.validateToolCall('search_leads', undefined).ok,  'undefined input rejected');
  a(!T.validateToolCall('search_leads', 'string').ok,    'string input rejected');
  a(!T.validateToolCall('search_leads', 42).ok,          'number input rejected');
}

sec('VALIDATION — required fields enforced');
{
  // get_lead requires lead_id
  const v = T.validateToolCall('get_lead', {});
  a(v.ok === false,                                'get_lead w/o lead_id rejected');
  a(/lead_id/.test(v.error),                       'Error names the missing field');
  // With required field present
  a(T.validateToolCall('get_lead', { lead_id: 'lead_x' }).ok === true, 'get_lead WITH lead_id accepted');
  // No required fields on summarize_funnel
  a(T.validateToolCall('summarize_funnel', {}).ok === true, 'summarize_funnel{} accepted');
}

sec('VALIDATION — enum fields enforced');
{
  a(!T.validateToolCall('search_leads', { segment: 'invalid_segment' }).ok,
                                                    'Bad segment enum rejected');
  a(T.validateToolCall('search_leads', { segment: 'niryatak_prospect' }).ok,
                                                    'Valid segment enum accepted');
  a(!T.validateToolCall('search_leads', { status: 'made_up_status' }).ok,
                                                    'Bad status enum rejected');
  a(!T.validateToolCall('check_scheme_eligibility', { gender: 'queen' }).ok,
                                                    'Bad gender enum rejected');
}

sec('VALIDATION — type checking');
{
  a(!T.validateToolCall('search_leads', { name_contains: 12345 }).ok,
                                                    'Non-string name_contains rejected');
  a(!T.validateToolCall('search_leads', { limit: 'ten' }).ok,
                                                    'Non-integer limit rejected');
  a(!T.validateToolCall('search_leads', { limit: 5.5 }).ok,
                                                    'Float limit rejected (must be integer)');
  a(!T.validateToolCall('search_leads', { limit: 100 }).ok,
                                                    'limit > 25 rejected');
  a(!T.validateToolCall('check_scheme_eligibility', { has_aadhaar: 'yes' }).ok,
                                                    'Non-boolean has_aadhaar rejected');
}

// ════════════════════════════════════════════════════════════
sec('search_leads — empty input returns ranked top 10');
{
  const r = T.executeTool('search_leads', {}, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.total_matched === 6,                  'All 6 leads matched');
  a(r.result.returned === 6,                       '6 returned (below limit)');
  // Sorted by score desc
  const scores = r.result.leads.map(l => l.score);
  for (let i = 1; i < scores.length; i++) {
    a(scores[i-1] >= scores[i],                    `Rank ${i-1} score >= rank ${i}`);
  }
  // Top is the highest-score lead
  a(r.result.leads[0].name === 'Surat Diamond House', 'Top lead is Surat (score 92)');
}

sec('search_leads — name_contains filter');
{
  const r = T.executeTool('search_leads', { name_contains: 'jaipur' }, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.total_matched === 1,                  'One lead matches "jaipur"');
  a(r.result.leads[0].name === 'Jaipur Heritage Tours', 'Matches Jaipur Heritage Tours');
}

sec('search_leads — case-insensitive name match');
{
  const r = T.executeTool('search_leads', { name_contains: 'KHURJA' }, fixtureState);
  a(r.result.total_matched === 1,                  'Uppercase match works');
}

sec('search_leads — segment filter');
{
  const r = T.executeTool('search_leads', { segment: 'karigar_prospect' }, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.total_matched === 3,                  '3 karigar prospects');
  a(r.result.leads.every(l => l.segment === 'karigar_prospect'), 'All results are karigar');
}

sec('search_leads — status filter');
{
  const r = T.executeTool('search_leads', { status: 'new' }, fixtureState);
  a(r.result.total_matched === 2,                  '2 leads in "new" status');
  a(r.result.leads.every(l => l.status === 'new'), 'All in new');
}

sec('search_leads — combined filters');
{
  const r = T.executeTool('search_leads', { segment: 'karigar_prospect', status: 'new' }, fixtureState);
  a(r.result.total_matched === 1,                  'karigar + new → 1');
  a(r.result.leads[0].name === 'Khurja Potters Guild', 'Khurja matches');
}

sec('search_leads — limit caps results');
{
  const r = T.executeTool('search_leads', { limit: 2 }, fixtureState);
  a(r.result.total_matched === 6,                  'All 6 matched');
  a(r.result.returned === 2,                       'Only 2 returned');
  // Still highest score first
  a(r.result.leads[0].score === 92,                'Top score 92 is first');
}

sec('search_leads — does NOT expose contact PII');
{
  const r = T.executeTool('search_leads', {}, fixtureState);
  a(r.result.leads.every(l => !('contact_handles' in l)),
                                                   'No contact_handles in compact list');
  a(r.result.leads.every(l => !('phone' in l)),    'No raw phone field');
  a(r.result.leads.every(l => !('email' in l)),    'No raw email field');
}

// ════════════════════════════════════════════════════════════
sec('get_lead — returns full record including PII');
{
  const r = T.executeTool('get_lead', { lead_id: 'lead_aaa1' }, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.found === true,                       'Found');
  a(r.result.lead.name === 'Surat Diamond House',  'Right lead');
  a(r.result.lead.contact_handles.phone === '+91 98765 43210', 'Phone returned');
  a(r.sensitive === true,                          'Marked sensitive in result envelope');
  a(r.autonomy === T.AUTONOMY.MANUAL,              'Autonomy is MANUAL');
}

sec('get_lead — unknown id returns found:false');
{
  const r = T.executeTool('get_lead', { lead_id: 'lead_does_not_exist' }, fixtureState);
  a(r.ok,                                          'Tool execution still ok (no throw)');
  a(r.result.found === false,                      'found:false reported');
  a(/No lead/.test(r.result.error),                'Error message present');
}

// ════════════════════════════════════════════════════════════
sec('summarize_funnel — counts per status');
{
  const r = T.executeTool('summarize_funnel', {}, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.total_leads === 6,                    '6 total leads');
  a(r.result.status_breakdown.new === 2,           '2 new');
  a(r.result.status_breakdown.researched === 1,    '1 researched');
  a(r.result.status_breakdown.contacted === 1,     '1 contacted');
  a(r.result.status_breakdown.qualified === 1,     '1 qualified');
  a(r.result.status_breakdown.dormant === 1,       '1 dormant');
  a(r.result.status_breakdown.onboarded === 0,     '0 onboarded');
}

sec('summarize_funnel — top_3 by score, no PII');
{
  const r = T.executeTool('summarize_funnel', {}, fixtureState);
  a(r.result.top_3_by_score.length === 3,          'Top 3 returned');
  a(r.result.top_3_by_score[0].score === 92,       '#1 has score 92');
  a(r.result.top_3_by_score[0].name === 'Surat Diamond House', '#1 is Surat');
  // No contact info leaks here either
  a(r.result.top_3_by_score.every(l => !('contact_handles' in l) && !('phone' in l)),
                                                    'No PII in top_3');
}

sec('summarize_funnel — empty state returns zero counts (no crash)');
{
  const r = T.executeTool('summarize_funnel', {}, { leads: [] });
  a(r.ok,                                          'Empty state ok');
  a(r.result.total_leads === 0,                    'Total 0');
  a(r.result.top_3_by_score.length === 0,          'Empty top_3');
}

// ════════════════════════════════════════════════════════════
sec('check_scheme_eligibility — Karigar profile returns >= 4');
{
  const r = T.executeTool('check_scheme_eligibility', {
    age: 38, gender: 'female', category: 'obc',
    has_aadhaar: true, has_bank_account: true,
    craft_category: 'pottery', state: 'UP', is_first_business: true,
  }, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.eligible_count >= 4,                  `>=4 eligible (got ${r.result.eligible_count})`);
  // Vishwakarma should be there
  a(r.result.eligible_schemes.find(s => s.id === 'pm_vishwakarma') !== undefined,
                                                    'PM Vishwakarma included');
  // Each scheme has required fields
  a(r.result.eligible_schemes.every(s => s.name && s.ministry && s.application_url),
                                                    'All schemes have required fields');
}

sec('check_scheme_eligibility — older artisan excluded from PMKVY');
{
  const r = T.executeTool('check_scheme_eligibility', {
    age: 50, gender: 'male', has_aadhaar: true, has_bank_account: true, craft_category: 'handicraft',
  }, fixtureState);
  a(r.ok,                                          'Execution ok');
  a(r.result.eligible_schemes.find(s => s.id === 'pmkvy') === undefined,
                                                    'Age 50 → PMKVY not in eligible');
}

sec('check_scheme_eligibility — empty profile returns minimal');
{
  const r = T.executeTool('check_scheme_eligibility', {}, fixtureState);
  a(r.ok,                                          'Empty profile ok (no required fields)');
  a(r.result.eligible_count <= 2,                  'At most 2 eligible (foundational only)');
}

// ════════════════════════════════════════════════════════════
sec('toolsForAnthropic — produces correct shape');
{
  const tools = T.toolsForAnthropic();
  a(Array.isArray(tools),                          'Returns an array');
  a(tools.length === 5,                            'Has 5 tools (4 read-only + 1 mutating)');
  tools.forEach(t => {
    a(typeof t.name === 'string',                  `${t.name}: name`);
    a(typeof t.description === 'string',           `${t.name}: description`);
    a(typeof t.input_schema === 'object',          `${t.name}: input_schema`);
    // No executor or audit fields leak to Anthropic
    a(!('executor' in t),                          `${t.name}: no executor leak`);
    a(!('autonomy' in t),                          `${t.name}: no autonomy leak`);
    a(!('sensitive' in t),                         `${t.name}: no sensitive leak`);
  });
}

sec('toolsForAnthropic — can exclude sensitive');
{
  const safe = T.toolsForAnthropic({ includeSensitive: false });
  a(safe.length === 4,                             '4 tools when sensitive excluded (get_lead removed)');
  a(!safe.find(t => t.name === 'get_lead'),         'get_lead excluded (it is sensitive)');
}

// ════════════════════════════════════════════════════════════
sec('auditEntry — well-formed and immutable');
{
  const e = T.auditEntry({
    toolName: 'search_leads',
    input: { segment: 'karigar_prospect' },
    decision: 'approved',
    result: { total_matched: 3 },
    by: 'founder',
  });
  a(e.id && e.id.startsWith('tcall_'),             'ID prefixed');
  a(e.tool === 'search_leads',                     'Tool recorded');
  a(e.decision === 'approved',                     'Decision recorded');
  a(typeof e.at === 'number' && e.at > 0,          'Timestamp set');
  a(Object.isFrozen(e),                            'Entry is frozen');

  // Different decision types
  const rej = T.auditEntry({ toolName: 'get_lead', input: { lead_id: 'x' }, decision: 'rejected' });
  a(rej.decision === 'rejected' && rej.result === null, 'Rejected has null result');

  const failed = T.auditEntry({ toolName: 'get_lead', input: {}, decision: 'failed', error: 'bad input' });
  a(failed.error === 'bad input',                   'Failed has error');
}

// ════════════════════════════════════════════════════════════
sec('executeTool — bad input returns ok:false (does not throw)');
{
  const r = T.executeTool('search_leads', { segment: 'bogus' }, fixtureState);
  a(r.ok === false,                                'Bad input → ok:false');
  a(typeof r.error === 'string',                   'Error message present');
}

sec('executeTool — unknown tool returns ok:false');
{
  const r = T.executeTool('hack_the_planet', {}, fixtureState);
  a(r.ok === false,                                'Unknown tool → ok:false');
}

sec('executeTool — null state tolerated');
{
  const r = T.executeTool('summarize_funnel', {}, null);
  a(r.ok,                                          'Null state still works (treats as empty)');
  a(r.result.total_leads === 0,                    '0 leads in null state');
}

// ════════════════════════════════════════════════════════════
// MUTATING TOOLS
// ════════════════════════════════════════════════════════════
sec('transition_lead — registered with correct flags');
{
  const tool = T.TOOLS.transition_lead;
  a(tool !== undefined,                            'transition_lead present');
  a(tool.mutating === true,                         'mutating flag set');
  a(tool.autonomy === T.AUTONOMY.MANUAL,            'autonomy is MANUAL (never auto-runs)');
  a(tool.sensitive === false,                       'sensitive is false (no PII)');
  a(tool.input_schema.required.includes('lead_id'), 'lead_id required');
  a(tool.input_schema.required.includes('new_status'), 'new_status required');
}

sec('transition_lead — validation');
{
  a(!T.validateToolCall('transition_lead', {}).ok,                          'Empty input rejected');
  a(!T.validateToolCall('transition_lead', { lead_id: 'x' }).ok,             'Without new_status rejected');
  a(!T.validateToolCall('transition_lead', { new_status: 'contacted' }).ok,  'Without lead_id rejected');
  a(!T.validateToolCall('transition_lead', { lead_id: 'x', new_status: 'fake_status' }).ok,
                                                                              'Bad new_status enum rejected');
  a(T.validateToolCall('transition_lead', { lead_id: 'lead_x', new_status: 'contacted' }).ok,
                                                                              'Valid call accepted');
  a(T.validateToolCall('transition_lead', { lead_id: 'lead_x', new_status: 'contacted', note: 'spoke to founder' }).ok,
                                                                              'With note also accepted');
}

sec('transition_lead — happy path new → researched');
{
  const lead = {
    id: 'lead_xyz', name: 'Test Co', source: 'gjepc', segment: 'niryatak_prospect',
    status: 'new', score: 80, createdAt: 1000, contactHandles: {}, history: [],
  };
  const state = { leads: [lead] };
  const r = T.executeTool('transition_lead', { lead_id: 'lead_xyz', new_status: 'researched' }, state);
  a(r.ok,                                          'Tool succeeded');
  a(r.mutating === true,                            'Result envelope marks it mutating');
  a(r.result.ok === true,                           'Inner result is ok');
  a(r.result.lead_id === 'lead_xyz',                'Lead id preserved');
  a(r.result.previous_status === 'new',             'Previous status recorded for rollback');
  a(r.result.new_status === 'researched',           'New status recorded');
  a(r.result.updated_lead.status === 'researched',  'Updated lead has new status');
  a(r.result.updated_lead.history.length === 1,     'History grew by 1 entry');
  a(r.result.updated_lead.history[0].from === 'new', 'History records the from');
  a(r.result.updated_lead.history[0].to === 'researched', 'History records the to');
}

sec('transition_lead — note recorded in history');
{
  const lead = { id: 'lead_n', name: 'X', status: 'new', history: [] };
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_n', new_status: 'contacted', note: 'Called this morning',
  }, { leads: [lead] });
  a(r.ok && r.result.ok,                           'Succeeded');
  a(r.result.note === 'Called this morning',        'Note in result');
  a(r.result.updated_lead.history[0].note === 'Called this morning',
                                                    'Note in lead history');
}

sec('transition_lead — invalid transition rejected by state machine');
{
  const lead = { id: 'lead_a', name: 'A', status: 'new', history: [] };
  // new → onboarded is NOT valid (must go through other states)
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_a', new_status: 'onboarded',
  }, { leads: [lead] });
  a(r.ok,                                          'Tool executes (no throw)');
  a(r.result.ok === false,                          'Inner result reports failure');
  a(/Invalid transition/.test(r.result.error),     'Error names the issue');
}

sec('transition_lead — terminal status blocks further transitions');
{
  const onboardedLead = { id: 'lead_o', name: 'O', status: 'onboarded', history: [] };
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_o', new_status: 'contacted',
  }, { leads: [onboardedLead] });
  a(r.ok && !r.result.ok,                          'Tool exec ok, result fails');
  a(/No transitions/.test(r.result.error) || /Invalid/.test(r.result.error),
                                                    'Error explains terminal state');
}

sec('transition_lead — unknown lead returns clear error');
{
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_nonexistent', new_status: 'contacted',
  }, { leads: [] });
  a(r.ok && !r.result.ok,                          'Tool exec ok, result fails');
  a(/No lead/.test(r.result.error),                 'Names the missing lead');
}

sec('transition_lead — original lead is NOT mutated (caller applies the update)');
{
  const original = { id: 'lead_i', name: 'I', status: 'new', history: [] };
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_i', new_status: 'researched',
  }, { leads: [original] });
  a(r.ok && r.result.ok,                           'Succeeded');
  // The executor must NOT mutate the input — it should be the caller's job
  // to apply the updated_lead to whatever store they own
  a(original.status === 'new',                     'Original status untouched (immutability)');
  a(original.history.length === 0,                  'Original history untouched');
}

sec('transition_lead — dormant → responded re-engagement allowed');
{
  const lead = { id: 'lead_d', name: 'D', status: 'dormant', history: [] };
  const r = T.executeTool('transition_lead', {
    lead_id: 'lead_d', new_status: 'responded',
  }, { leads: [lead] });
  a(r.ok && r.result.ok,                           'Re-engagement allowed');
  a(r.result.updated_lead.status === 'responded',  'Now responded');
}

sec('toolsForAnthropic — transition_lead is included by default');
{
  const tools = T.toolsForAnthropic();
  a(tools.find(t => t.name === 'transition_lead') !== undefined,
                                                    'transition_lead exposed to LLM');
  // No mutating flag should leak — Anthropic schema is just name/description/input_schema
  const tl = tools.find(t => t.name === 'transition_lead');
  a(!('mutating' in tl),                           'No mutating field leak');
  a(!('autonomy' in tl),                           'No autonomy field leak');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
