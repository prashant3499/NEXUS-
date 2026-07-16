'use strict';

const AA = require('./src/agentAuthority');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

sec('Every agent has the access it needs for its role');
{
  const m = AA.matrix();
  a(m.agents.length >= 5, 'All agents declared in the matrix');
  for (const ag of m.agents) {
    a(ag.read.length > 0 && ag.autonomous.length > 0, `${ag.key} has read + autonomous scope`);
    a(typeof ag.founder_in_loop === 'string', `${ag.key} states its founder-in-loop rule`);
  }
}

sec('Autonomous actions are allowed (agents can do their job)');
{
  a(AA.can('self_audit', 'run_audit').mode === 'autonomous', 'Self-audit may run audits');
  a(AA.can('self_healing', 'retry_failed_webhooks').mode === 'autonomous', 'Self-heal may retry webhooks');
  a(AA.can('self_healing', 'resume_paused_tasks').mode === 'autonomous', 'Self-heal may resume tasks');
  a(AA.can('innovation', 'propose_opportunities').mode === 'autonomous', 'Innovation may propose');
  a(AA.can('growth_ops', 'search_leads').mode === 'autonomous', 'Growth ops may search leads');
}

sec('Consequential actions require founder approval (in the loop)');
{
  a(AA.can('innovation', 'change_pricing').mode === 'needs_approval', 'Innovation cannot change pricing alone');
  a(AA.can('innovation', 'launch_vertical').mode === 'needs_approval', 'Innovation cannot launch a vertical alone');
  a(AA.can('innovation', 'spend_budget').mode === 'needs_approval', 'Innovation cannot spend alone');
  a(AA.can('self_healing', 'money_provider_down').mode === 'needs_approval', 'Money fault escalates to founder');
  a(AA.can('growth_ops', 'transition_product').mode === 'needs_approval', 'Mutating product change needs approval');
}

sec('Forbidden actions are off-limits to EVERY agent');
{
  for (const f of AA.FORBIDDEN) {
    a(AA.can('self_healing', f).mode === 'forbidden', `'${f}' forbidden to self_healing`);
  }
  // Even an unknown agent can't do a forbidden action
  a(AA.can('any_agent', 'disable_never_in_loss').mode === 'forbidden', 'Forbidden beats unknown-agent');
  a(AA.can('innovation', 'bypass_consent_gate').allowed === false, 'No agent bypasses consent');
  a(AA.can('self_audit', 'mark_verified_without_registry').allowed === false, 'No agent fakes verification');
  a(AA.can('self_healing', 'move_funds_without_founder').allowed === false, 'No agent moves funds alone');
}

sec('Agents cannot act outside their declared scope');
{
  a(AA.can('self_audit', 'retry_failed_webhooks').mode === 'unknown_action', 'Audit agent cannot do healing actions');
  a(AA.can('nope', 'run_audit').mode === 'unknown_agent', 'Unknown agent rejected');
}

console.log('\n' + '='.repeat(50));
console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
