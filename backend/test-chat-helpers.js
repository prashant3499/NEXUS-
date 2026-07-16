'use strict';

/**
 * test-chat-helpers.js
 *
 * Pure-function tests for the two new helpers added to the chat flow:
 *   _sliceForAPI(history, maxTurns) — slice that never strands a
 *     tool_use/tool_result pair
 *   _coerceHistoryContent(content)  — render array content (tool_use
 *     blocks) sensibly without showing [object Object]
 *
 * Both live inside public/index.html as in-browser helpers. We extract
 * them into a vm context and exercise them.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// Load the script + extract the two helpers
const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const inBrowser = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

const sliceMatch = inBrowser.match(/function _sliceForAPI[\s\S]*?\n\}/);
const coerceMatch = inBrowser.match(/function _coerceHistoryContent[\s\S]*?\n\}/);

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  sliceMatch[0] + '\n' + coerceMatch[0] +
  '\nthis._sliceForAPI = _sliceForAPI; this._coerceHistoryContent = _coerceHistoryContent;',
  ctx
);

// ════════════════════════════════════════════════════════════
sec('_sliceForAPI — empty / null inputs');
{
  a(JSON.stringify(ctx._sliceForAPI([], 12)) === '[]',                'Empty history → []');
  a(JSON.stringify(ctx._sliceForAPI(null, 12)) === '[]',              'Null history → []');
  a(JSON.stringify(ctx._sliceForAPI(undefined, 12)) === '[]',         'Undefined → []');
}

sec('_sliceForAPI — simple history fits in window');
{
  const h = [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
    { role: 'user', content: 'how are you' },
  ];
  const out = ctx._sliceForAPI(h, 12);
  a(out.length === 3,                                                 'All 3 turns kept');
  a(out[0].content === 'hi',                                          'First turn intact');
}

sec('_sliceForAPI — long history trimmed to maxTurns');
{
  const h = [];
  for (let i = 0; i < 20; i++) {
    h.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
  }
  const out = ctx._sliceForAPI(h, 5);
  a(out.length <= 5,                                                  `Trimmed to 5 or fewer (${out.length})`);
  // The slice should end with the most recent message
  a(out[out.length - 1].content === 'msg 19',                          'Ends at most recent');
}

sec('_sliceForAPI — never starts with orphan tool_result');
{
  // Construct a slice that would normally start with a tool_result
  // (which the API rejects). Helper should walk forward to a clean boundary.
  const h = [
    { role: 'user', content: 'ask the question' },
    { role: 'assistant', content: [
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 't1', name: 'search_leads', input: {} },
    ]},
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: '{"results": []}' },
    ]},
    { role: 'assistant', content: 'final answer' },
    { role: 'user', content: 'follow-up' },
    { role: 'assistant', content: 'reply' },
  ];
  // If we slice -4 naively, we'd start with the orphan tool_result.
  const out = ctx._sliceForAPI(h, 4);
  // First message must be a user turn with non-tool_result content
  const first = out[0];
  a(first.role === 'user',                                            'First turn is user');
  const isToolResult = Array.isArray(first.content)
    && first.content.length > 0
    && first.content[0].type === 'tool_result';
  a(!isToolResult,                                                    'First turn is NOT tool_result orphan');
  a(typeof first.content === 'string',                                'First turn content is a string');
}

sec('_sliceForAPI — keeps complete tool_use/tool_result pair when window allows');
{
  const h = [
    { role: 'user', content: 'ask' },
    { role: 'assistant', content: [
      { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 't1', name: 'search_leads', input: {} },
    ]},
    { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: '{}' },
    ]},
    { role: 'assistant', content: 'final' },
  ];
  const out = ctx._sliceForAPI(h, 4);
  a(out.length === 4,                                                 'Whole history kept');
  // The pair is intact: assistant tool_use followed by user tool_result
  const assistantIdx = out.findIndex(m => Array.isArray(m.content)
    && m.content.some(b => b.type === 'tool_use'));
  a(assistantIdx >= 0,                                                'tool_use assistant turn present');
  const nextTurn = out[assistantIdx + 1];
  a(nextTurn && nextTurn.role === 'user'
    && Array.isArray(nextTurn.content)
    && nextTurn.content.some(b => b.type === 'tool_result'),
                                                                      'Immediately followed by tool_result user turn');
}

// ════════════════════════════════════════════════════════════
sec('_coerceHistoryContent — string passthrough');
{
  a(ctx._coerceHistoryContent('hello') === 'hello',                   'String passes through');
  a(ctx._coerceHistoryContent('') === '',                             'Empty string passes through');
}

sec('_coerceHistoryContent — null / undefined → null');
{
  a(ctx._coerceHistoryContent(null) === null,                         'null → null');
  a(ctx._coerceHistoryContent(undefined) === null,                    'undefined → null');
}

sec('_coerceHistoryContent — text block array');
{
  const out = ctx._coerceHistoryContent([
    { type: 'text', text: 'Hello world' },
  ]);
  a(out === 'Hello world',                                            'Single text block → its text');
}

sec('_coerceHistoryContent — tool_use block summarized');
{
  const out = ctx._coerceHistoryContent([
    { type: 'tool_use', id: 't1', name: 'search_leads', input: {} },
  ]);
  a(/search_leads/.test(out),                                         'Tool name in output');
  a(/used/.test(out),                                                 'Action verb present');
}

sec('_coerceHistoryContent — mixed text + tool_use block');
{
  const out = ctx._coerceHistoryContent([
    { type: 'text', text: 'Let me check the funnel.' },
    { type: 'tool_use', id: 't1', name: 'summarize_funnel', input: {} },
  ]);
  a(/Let me check the funnel/.test(out),                              'Text content preserved');
  a(/summarize_funnel/.test(out),                                     'Tool name appended');
}

sec('_coerceHistoryContent — tool_result block summarized');
{
  const ok = ctx._coerceHistoryContent([
    { type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: false },
  ]);
  a(/result/.test(ok),                                                'result keyword present');

  const err = ctx._coerceHistoryContent([
    { type: 'tool_result', tool_use_id: 't1', content: 'oops', is_error: true },
  ]);
  a(/error/.test(err),                                                'error keyword present');
}

sec('_coerceHistoryContent — never returns [object Object]');
{
  // The actual bug we are guarding against
  const trickyInputs = [
    [{ type: 'tool_use', id: 't1', name: 'search_leads', input: { segment: 'karigar_prospect' } }],
    [{ type: 'tool_result', tool_use_id: 't1', content: '{"x":1}' }],
    [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'get_lead', input: { lead_id: 'l1' } }],
  ];
  for (const input of trickyInputs) {
    const out = ctx._coerceHistoryContent(input);
    a(out === null || (typeof out === 'string' && !/\[object Object\]/.test(out)),
      `No "[object Object]" leak in: ${JSON.stringify(input).slice(0, 50)}`);
  }
}

sec('_coerceHistoryContent — empty block array → null');
{
  a(ctx._coerceHistoryContent([]) === null,                           'Empty array → null (no useful content)');
  // Array of blocks with no recognized types → null
  a(ctx._coerceHistoryContent([{ type: 'unknown' }]) === null,         'Unknown block types → null');
}

// ════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
