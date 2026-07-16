'use strict';

/**
 * founderConsole.js
 *
 * "The founder can command it to do everything needed to operate this." This is
 * that single command surface: the founder expresses an intent in plain words,
 * and the console routes it to the right capability — the audit/heal/innovation/
 * advisor/presentation agents, the config commands, or an honest "this is a
 * human task" hand-off.
 *
 * It sits ON TOP of the authority model, it does not override it:
 *   • operational intents (audit, heal, status, advise, present, innovate) run
 *     and return a result;
 *   • config intents (set price, charity, autonomy) route to founderCommands,
 *     which still enforces the invariants (a price below the floor is refused
 *     even when the founder commands it);
 *   • real-world intents (register the company, get GST, sign with a lawyer,
 *     connect a real payment key) are NOT things software can do — the console
 *     says so plainly and points to the founder-advisor's next step.
 *
 * Natural-language understanding is the Anthropic seam (the AI co-founder); this
 * module provides deterministic intent routing so it works and is testable even
 * without the model, and is honest about which layer answered.
 */

const CAPABILITY = Object.freeze({
  AGENT: 'agent_action',          // the console can run it now
  CONFIG: 'config_change',        // routes to invariant-guarded config
  HUMAN: 'human_task',            // only the founder/real world can do it
  UNKNOWN: 'unknown',
});

// Intent routing table. Each entry: keywords → how to handle it.
const ROUTES = [
  { intent: 'audit', keywords: ['audit', 'verify', 'is it safe', 'trustworthy', 'health check', 'self check'], capability: CAPABILITY.AGENT, agent: 'self_audit', say: 'Running a full invariant self-audit.' },
  { intent: 'heal', keywords: ['heal', 'fix', 'recover', 'repair', 'unstick', 'retry'], capability: CAPABILITY.AGENT, agent: 'self_healing', say: 'Diagnosing and applying safe recovery.' },
  { intent: 'advise', keywords: ['what should i do', 'next', 'next steps', 'todo', 'priorit', 'advise'], capability: CAPABILITY.AGENT, agent: 'founder_advisor', say: 'Composing your prioritized next actions.' },
  { intent: 'innovate', keywords: ['opportunit', 'idea', 'innovate', 'grow', 'improve', 'what next for growth'], capability: CAPABILITY.AGENT, agent: 'innovation', say: 'Scanning signals for opportunities to propose.' },
  { intent: 'present', keywords: ['present', 'pitch', 'show', 'explain to', 'deck', 'introduce'], capability: CAPABILITY.AGENT, agent: 'presentation', say: 'Preparing a tailored presentation.' },
  { intent: 'status', keywords: ['status', 'how are we', 'overview', 'dashboard', 'metrics', 'cockpit'], capability: CAPABILITY.AGENT, agent: 'status', say: 'Pulling the live platform status.' },
  { intent: 'feedback', keywords: ['feedback', 'reviews', 'complaints', 'sentiment', 'insight'], capability: CAPABILITY.AGENT, agent: 'feedback', say: 'Folding feedback into insights.' },

  { intent: 'config', keywords: ['set price', 'set the', 'charity', 'enable', 'disable', 'pause the', 'autonomy', 'commission'], capability: CAPABILITY.CONFIG, say: 'Routing to invariant-guarded config.' },

  { intent: 'register_company', keywords: ['register the company', 'incorporate', 'company registration', 'llp'], capability: CAPABILITY.HUMAN, say: 'Company registration is a founder + CA task — I can prepare documents and track status, but I cannot incorporate an entity for you.' },
  { intent: 'get_gst', keywords: ['gst', 'tcs registration', 'tax registration', 'iec', 'export licence', 'export license'], capability: CAPABILITY.HUMAN, say: 'GST/TCS/IEC registration is a founder + CA task. I can prepare the application data and track it, but the registration itself is human-only.' },
  { intent: 'legal_signoff', keywords: ['lawyer', 'legal sign', 'mor opinion', 'legal review', 'counsel'], capability: CAPABILITY.HUMAN, say: 'A lawyer must review the Merchant-of-Record + TCS model. I can give them the drafted documents; I cannot give legal sign-off myself.' },
  { intent: 'connect_credential', keywords: ['connect razorpay', 'real payment', 'api key', 'go live', 'real credential', 'production key'], capability: CAPABILITY.HUMAN, say: 'Connecting a real provider needs YOUR credential (you hold the account). Set it and I operate it automatically — but I will never fabricate or move real money without it.' },
];

/**
 * interpret — map a founder's words to a route. Deterministic keyword match
 * (the Anthropic seam refines this when connected).
 */
function interpret(text) {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return { matched: false, reason: 'Empty command.' };
  for (const r of ROUTES) {
    if (r.keywords.some((k) => t.includes(k))) {
      return { matched: true, intent: r.intent, capability: r.capability, agent: r.agent || null, say: r.say };
    }
  }
  return {
    matched: false,
    reason: 'I couldn\u2019t map that to a known operation. Try: "audit the platform", "what should I do next", "show the investor pitch", "scan for opportunities", "set the karigar price to 399", or "connect Razorpay".',
  };
}

/**
 * execute — run an interpreted command using injected handlers (the live agents
 * + config). Honest about which layer answered and whether the founder must act.
 * @param {object} parsed   from interpret()
 * @param {object} input    raw input (e.g. audience for present, plan for config)
 * @param {object} handlers { audit, heal, advise, innovate, present, status, feedback, config }
 */
async function execute(parsed, input = {}, handlers = {}) {
  if (!parsed || !parsed.matched) return { ok: false, reason: (parsed && parsed.reason) || 'Not understood.' };

  if (parsed.capability === CAPABILITY.HUMAN) {
    return { ok: true, capability: parsed.capability, did_it: false, who: 'founder', message: parsed.say, note: 'This is a real-world task — the assistant prepares and tracks, the founder (with CA/lawyer) completes it.' };
  }

  if (parsed.capability === CAPABILITY.CONFIG) {
    if (!handlers.config) return { ok: false, reason: 'config handler not wired' };
    const r = await handlers.config(input.instruction || input.text || '');
    return { ok: !!r && r.ok !== false, capability: parsed.capability, did_it: !!r && r.ok !== false, result: r, note: 'Config changes are still checked against the invariants — a command that would break never-in-loss/consent is refused.' };
  }

  // AGENT capability
  const fn = handlers[parsed.intent] || handlers[parsed.agent];
  if (!fn) return { ok: false, reason: `No handler for ${parsed.intent}` };
  const result = await fn(input);
  return { ok: true, capability: parsed.capability, did_it: true, who: 'ai', intent: parsed.intent, message: parsed.say, result };
}

module.exports = { CAPABILITY, ROUTES, interpret, execute };
