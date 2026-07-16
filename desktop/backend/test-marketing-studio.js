'use strict';

const M = require('./src/marketingStudio');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Generates a full campaign');
{
  const c = M.campaign({ brand: 'KalaSetu', audience: 'diaspora', product: 'Banarasi saree' });
  a(c.ok && c.angle && c.value_prop, 'Campaign has an angle + value prop');
  a(c.channels.length >= 3, 'Suggests channels');
  a(c.ad_copy.short && c.ad_copy.long && c.ad_copy.captions.length, 'Ad copy: short, long, captions');
  a(c.content_calendar.length >= 4, 'Content calendar');
  a(JSON.stringify(c).includes('KalaSetu'), 'Brand-aware');
}

sec('Reel/video = SCRIPT only, never a rendered video');
{
  const c = M.campaign({ audience: 'buyer' });
  a(c.reel_script.is_script_only === true, 'Reel is explicitly script-only');
  a(c.reel_script.shots.length >= 4, 'Shot-by-shot storyboard');
  a(c.reel_script.shots.every((s) => s.visual && s.vo), 'Each shot has visual + voiceover');
  a(/not a rendered video/i.test(c.reel_script.note), 'Note: not a rendered video');
  a(/creator or.*tool|external seam|media/i.test(c.media_note), 'Campaign hands media off to creator/tool');
}

sec('Honest: no unprovable claims, no fake urgency');
{
  const c = M.capabilities();
  a(c.cannot_generate.some((x) => /#1|unprovable|best/i.test(x)), 'Cannot make unprovable claims');
  a(c.cannot_generate.some((x) => /urgency|scarcity/i.test(x)), 'No fake urgency');
  a(c.cannot_generate.some((x) => /rendered reel|video/i.test(x)), 'Cannot render video (honest)');
  const s = M.stripUnprovable('We are the #1 best most trusted platform');
  a(s.flagged.length >= 3, 'Flags unprovable superlatives');
}

sec('Offers respect never-in-loss');
{
  const o = M.offer({ type: 'first_order' });
  a(o.ok && o.offer.name, 'Generates an offer');
  a(/never-in-loss/i.test(o.guardrail), 'Offer guardrail cites never-in-loss');
  a(/no fake.*urgency|false scarcity/i.test(o.guardrail), 'No fake urgency in offers');
}

sec('Capabilities are honest about the media boundary');
{
  const c = M.capabilities();
  a(c.can_generate.some((x) => /script/i.test(x)), 'Can generate scripts');
  a(c.inherits.includes('honest-stage'), 'Inherits honest-stage');
  a(/words, scripts, and structure/i.test(c.note), 'Note: words + scripts + structure, not pixels');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
