'use strict';

const G = require('./src/growthAgent');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Government & ONDC channels are catalogued');
{
  a(Object.keys(G.GOV_CHANNELS).length >= 5, `Multiple government/network channels (${Object.keys(G.GOV_CHANNELS).length})`);
  a(!!G.GOV_CHANNELS.ondc && !!G.GOV_CHANNELS.gem && !!G.GOV_CHANNELS.trifed, 'ONDC, GeM, TRIFED present');
  a(G.GOV_CHANNELS.ondc.leverage === 'highest', 'ONDC is highest-leverage (widest reach)');
  a(Object.values(G.GOV_CHANNELS).every((c) => c.requires && c.brings && c.action), 'Each channel says what it brings + requires');
}

sec('Channels match the vertical');
{
  const gi = G.govChannelsFor('gi');
  a(gi.some((c) => c.key === 'odop') && gi.some((c) => c.key === 'epch'), 'GI craft → ODOP + EPCH (export) suggested');
  const svc = G.govChannelsFor('services');
  a(svc.some((c) => c.key === 'ondc'), 'Services → at least ONDC (suits all)');
  a(svc.some((c) => c.key === 'gem'), 'Services → GeM (procurement)');
}

sec('Growth plan prioritizes high-leverage demand channels, honestly gated');
{
  const plan = G.growthPlan({ vertical: 'handicraft', archetype: 'karigar' });
  a(plan.government_and_network_channels[0].key === 'ondc', 'ONDC ranked first (highest leverage)');
  a(plan.prioritized_steps[0].channel === 'ondc', 'First step is ONDC');
  a(plan.prioritized_steps[0].who === 'founder', 'Without a gateway key, ONDC enrollment is a founder task');
  a(/cannot manufacture it/i.test(plan.honest_note), 'Honest: surfaces demand, does not fabricate it');
  a(plan.private_partner_channels.length > 0, 'Includes private partner channels too');
}

sec('With ONDC credentials, the agent can prepare');
{
  const plan = G.growthPlan({ vertical: 'gi', ondcGatewayKey: 'live-key' });
  a(plan.prioritized_steps[0].who === 'agent_can_prepare', 'With a key, the agent can build the catalog');
}

sec('Sales-lift for a maker uses only real platform levers, honestly');
{
  const lift = G.salesLift({ name: 'Ramvati' });
  a(lift.levers.length >= 4, 'Multiple concrete sales levers');
  a(lift.levers.some((l) => /provenance/i.test(l.lever)), 'Provenance premium lever');
  a(lift.levers.some((l) => /ONDC/i.test(l.lever)), 'ONDC reach lever');
  a(/do not create demand from nothing|none create demand/i.test(lift.honest_note), 'Honest: lifts existing demand, does not invent it');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
