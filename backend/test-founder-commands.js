'use strict';

/**
 * test-founder-commands.js — the founder's plain-language control over the
 * platform, bounded by hard invariants.
 */

const F = require('./src/founderCommands');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Pricing — interpreted + floor-aware');
{
  const r = F.interpret('set the karigar price to 399');
  a(r.matched && r.id === 'set_price', 'Maps a price instruction');
  a(r.params.tier === 'karigar' && r.params.price_paise === 39900, 'Extracts tier + amount in paise');
  a(r.requiresConfirm === true, 'Price change requires confirmation');
  const r2 = F.interpret('change vyapari plan to ₹1,299');
  a(r2.params.tier === 'vyapari' && r2.params.price_paise === 129900, 'Handles ₹ and commas');
}

sec('Charity — rate-capped + named cause');
{
  const r = F.interpret('enable charity at 2% for artisan welfare');
  a(r.matched && r.effect === 'set_charity', 'Maps a charity instruction');
  a(r.params.enabled === true && Math.abs(r.params.pct - 0.02) < 1e-9, 'Extracts 2%');
  a(/artisan welfare/.test(r.params.cause), 'Extracts the named cause');
  const off = F.interpret('turn off charity');
  a(off.params.enabled === false, 'Can turn charity off');
}

sec('Agents + autonomy');
{
  const pause = F.interpret('pause the SEO agent');
  a(pause.effect === 'toggle_agent' && pause.params.agent === 'seo' && pause.params.paused === true, 'Pauses the SEO agent');
  const resume = F.interpret('resume the watchdog agent');
  a(resume.params.paused === false && resume.params.agent === 'watchdog', 'Resumes the watchdog');
  const auto = F.interpret('set autonomy to manual');
  a(auto.effect === 'set_autonomy' && auto.params.autonomy === 'manual', 'Sets autonomy to manual');
}

sec('HARD INVARIANTS cannot be switched off — not even by the founder');
{
  const c1 = F.interpret('disable consent before sale');
  a(c1.blocked === true && c1.ok === false, 'Refuses to disable consent');
  const c2 = F.interpret('let a minor sell without a guardian');
  a(c2.blocked === true, 'Refuses to bypass the child-safety gate');
  const c3 = F.interpret('remove the never-in-loss floor');
  a(c3.blocked === true, 'Refuses to remove the never-in-loss floor');
  a(Array.isArray(c1.protected) && c1.protected.includes('child-safety'), 'Names the protected invariants');
}

sec('Structural code changes are honestly out of scope at runtime');
{
  const s = F.interpret('add a new endpoint for refunds');
  a(s.ok === false && s.deferred === true, 'Does not pretend to rewrite running code');
  a(s.effect === 'record_change_request', 'Records it as a change request instead');
}

sec('Read-only + unknown');
{
  const e = F.interpret('show current pricing config');
  a(e.effect === 'explain_config', 'Explains current configuration');
  const u = F.interpret('asdfghjkl');
  a(u.matched === false && /couldn/i.test(u.reason), 'Unknown instruction is declined with guidance');
  const empty = F.interpret('');
  a(empty.ok === false, 'Empty instruction handled');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
