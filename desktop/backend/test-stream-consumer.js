'use strict';

/**
 * test-stream-consumer.js
 *
 * The streaming chat send uses `_consumeAnthropicStream` to reconstruct
 * the content[] array from SSE events. This test verifies that the
 * reconstruction is correct on real-shape event sequences — text deltas
 * are accumulated, tool_use input is accumulated as JSON then parsed,
 * and stop_reason is captured.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

// Extract _consumeAnthropicStream from the SPA
const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const inBrowser = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const fnMatch = inBrowser.match(/async function _consumeAnthropicStream[\s\S]*?\n\}/);

// Replace document/cfBody references so the function runs without a DOM.
// We replace the bubble-update lines with no-ops.
const adapted = fnMatch[0]
  .replace(/const cfBody = document\.getElementById\('cfBody'\);/, 'const cfBody = null;')
  .replace(/_renderChatMarkdown\([^)]+\)/g, '""');

const ctx = { console, TextDecoder };
vm.createContext(ctx);
vm.runInContext(adapted + '; this._consumeAnthropicStream = _consumeAnthropicStream;', ctx);

// Helper: build a fake ReadableStream from an array of SSE event objects
function makeStream(events) {
  const chunks = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n');
  const encoder = new TextEncoder();
  const queue = chunks.map(c => encoder.encode(c));
  let i = 0;
  return {
    body: {
      getReader() {
        return {
          read() {
            if (i >= queue.length) return Promise.resolve({ done: true, value: undefined });
            return Promise.resolve({ done: false, value: queue[i++] });
          },
        };
      },
    },
  };
}

(async () => {
  // ════════════════════════════════════════════════════════════
  sec('Text-only streaming');
  {
    const events = [
      { type: 'message_start', message: { id: 'm1' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content.length === 1,                       'One content block reconstructed');
    a(result.content[0].type === 'text',                 'Block type is text');
    a(result.content[0].text === 'Hello world',          'Text deltas accumulated');
    a(result.stopReason === 'end_turn',                  'stop_reason captured');
  }

  sec('Tool-use streaming — input JSON accumulated across chunks');
  {
    const events = [
      { type: 'message_start', message: { id: 'm2' } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me check.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_abc', name: 'search_leads', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"seg' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'ment":"karigar' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '_prospect"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      { type: 'message_stop' },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content.length === 2,                       'Two blocks (text + tool_use)');
    a(result.content[0].type === 'text',                 'First block is text');
    a(result.content[0].text === 'Let me check.',         'Text content correct');
    a(result.content[1].type === 'tool_use',              'Second block is tool_use');
    a(result.content[1].id === 'tu_abc',                  'Tool id preserved');
    a(result.content[1].name === 'search_leads',          'Tool name preserved');
    a(typeof result.content[1].input === 'object'
      && !Array.isArray(result.content[1].input),         'Tool input is an object (parsed from JSON)');
    a(result.content[1].input.segment === 'karigar_prospect', 'Tool input segment correct');
    a(result.stopReason === 'tool_use',                   'stop_reason is tool_use');
  }

  sec('Tool-use with empty input (no input_json_delta events)');
  {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_x', name: 'summarize_funnel', input: {} } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content.length === 1,                       'Block reconstructed');
    a(typeof result.content[0].input === 'object',        'Empty input is parsed as {} (no JSON.parse crash)');
    a(Object.keys(result.content[0].input).length === 0,  'Empty input has no keys');
  }

  sec('Multiple text blocks');
  {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Part 1' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Part 2' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content.length === 2,                       'Two text blocks preserved');
    a(result.content[0].text === 'Part 1' && result.content[1].text === 'Part 2',
                                                          'Both texts intact');
  }

  sec('Unknown event types are tolerated');
  {
    const events = [
      { type: 'unknown_event' },                              // ignored
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
      { type: 'ping' },                                       // ignored
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content.length === 1 && result.content[0].text === 'hi',
                                                          'Unknown events do not corrupt the parse');
  }

  sec('Error event throws');
  {
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'error', error: { type: 'overloaded_error', message: 'try again' } },
    ];
    let threw = false, msg = '';
    try { await ctx._consumeAnthropicStream(makeStream(events)); }
    catch (e) { threw = true; msg = e.message; }
    a(threw,                                              'Error event throws');
    a(/try again/.test(msg),                              'Error message surfaced');
  }

  sec('Tool input survives chunk boundaries mid-key and mid-value');
  {
    // Real APIs chunk partial_json at awkward places. Test that we
    // handle a split right in the middle of a key name and a value.
    const events = [
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'check_scheme_eligibility', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ag' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'e":3' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '8,"gender":"' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'female"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ];
    const result = await ctx._consumeAnthropicStream(makeStream(events));
    a(result.content[0].input.age === 38,                'age=38 parsed from chunked JSON');
    a(result.content[0].input.gender === 'female',       'gender=female parsed from chunked JSON');
  }

  // ════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
