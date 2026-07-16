'use strict';

/**
 * test-integrations.js — the founder's "what do I need to operate" registry.
 *   - Every integration names env vars, a link, and a fallback mode
 *   - Status is computed from the live environment (nothing assumed connected)
 *   - Required-but-missing blocks the live-ready flag
 *   - nextActions prioritizes required over optional
 */

const I = require('./src/integrations');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Registry shape');
{
  a(I.INTEGRATIONS.length >= 8, 'Registers the key integrations');
  a(I.INTEGRATIONS.every(i => i.env && i.env.length && i.link && i.powers), 'Each names env vars, a link, and what it powers');
  a(I.INTEGRATIONS.some(i => i.id === 'razorpay' && i.required_for_live), 'Razorpay is required for live');
  a(I.INTEGRATIONS.some(i => i.id === 'gstin' && !i.has_mock), 'GSTIN has no mock (real tax compliance only)');
}

sec('Status with NOTHING connected (fresh)');
{
  const s = I.status({});
  a(s.summary.connected === 0, 'Nothing connected on empty env');
  a(s.summary.live_ready === false, 'Not live-ready with required missing');
  a(s.summary.blocking_live_launch.length > 0, 'Lists what blocks launch');
  a(s.integrations.every(i => i.has_mock ? i.current_mode === 'mock_fallback' : i.current_mode === 'unavailable'), 'Each shows its current mode (mock or unavailable)');
}

sec('Status with required connected');
{
  const env = {
    RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's',
    ANTHROPIC_API_KEY: 'a', AUTH_SECRET: 'x'.repeat(32), PLATFORM_GSTIN: '09ABCDE1234F1Z5',
  };
  const s = I.status(env);
  a(s.integrations.find(i => i.id === 'razorpay').connected === true, 'Razorpay connected when both keys present');
  a(s.integrations.find(i => i.id === 'razorpay').current_mode === 'live', 'Connected → live mode');
  a(s.summary.live_ready === true, 'Live-ready when all required connected');
  a(s.summary.headline.includes('can operate live'), 'Headline confirms live-ready');
}

sec('Partial credentials do not count as connected');
{
  const s = I.status({ RAZORPAY_KEY_ID: 'k' }); // missing secret
  a(s.integrations.find(i => i.id === 'razorpay').connected === false, 'One of two keys → not connected');
}

sec('nextActions prioritizes required');
{
  const actions = I.nextActions({ GOOGLE_MAPS_API_KEY: 'm' }); // maps connected, rest missing
  a(actions[0].priority === 'required_for_live', 'Required actions come first');
  a(actions.every(x => x.where && x.do), 'Each action has a what + where');
  a(!actions.some(x => x.do.includes('Google Maps')), 'Connected integration is not in the to-do');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
