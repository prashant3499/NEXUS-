'use strict';
const db = require('./src/dailyBriefing');
let passed = 0, failed = 0;
function a(cond, msg) { if (cond) { passed++; } else { failed++; console.log('  ✗ FAIL:', msg); } }

const ctx = { artisans: 1000, gmvRupees: 12000000, monthlyOrders: 800, sellers: 40, vertical: 'handicraft' };
const b = db.buildDailyBriefing(ctx, { now: '2026-06-18T06:00:00Z' });

a(b.date === '2026-06-18', 'date set from now');
a(typeof b.greeting === 'string' && b.greeting.includes('2026-06-18'), 'greeting includes date');
a(typeof b.overall_status === 'string', 'overall_status present');
a(typeof b.headline === 'string', 'headline present');
a(Array.isArray(b.do_today) && b.do_today.length >= 1, 'do_today has at least one action');
a(b.do_today.every(t => t.what && t.why), 'every do_today item has what + why');
a(Array.isArray(b.executives) && b.executives.length === 10, 'all 10 executives reported');
a(b.executives.every(e => e.title && typeof e.says === 'string'), 'each executive has title + says');
a(Array.isArray(b.cross_functional), 'cross_functional present (founder must decide)');
a(b.growth && typeof b.growth.headline === 'string', 'growth guidance present');
a(b.platform_health && typeof b.platform_health.healthy === 'boolean', 'platform health evaluated');
a(typeof b.honest_note === 'string' && /projection/i.test(b.honest_note), 'honest note labels projections honestly');
a(b.top_priority && b.top_priority.action, 'a single top priority is surfaced');

// Determinism for the same day/context
const b2 = db.buildDailyBriefing(ctx, { now: '2026-06-18T06:00:00Z' });
a(JSON.stringify(b2.do_today) === JSON.stringify(b.do_today), 'deterministic for same day + context');

// Text render is non-empty and contains key sections
const txt = db.renderText(b);
a(/DAILY FOUNDER BRIEFING/.test(txt), 'render has title');
a(/DO TODAY:/.test(txt) && /EXECUTIVE TEAM SAYS:/.test(txt), 'render has the key sections');
a(!/\{"priority"/.test(txt), 'render does not leak raw JSON for growth steps');

console.log(`\n  RESULTS: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
