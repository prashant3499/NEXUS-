'use strict';

/**
 * founderCommands.js
 *
 * The founder's co-founder can change the platform from a plain-language
 * instruction — "set the Karigar price to 399", "turn on charity at 2 percent
 * for artisan welfare", "pause the SEO agent", "make the AI manual-only". This
 * module turns such an instruction into a STRUCTURED, BOUNDED action.
 *
 * Bounded is the whole point. The founder has broad control over everything
 * that is configuration-, policy-, and operation-driven. But three things are
 * HARD INVARIANTS that no instruction — not even the founder's — can switch
 * off, because they protect the business and the people on it:
 *
 *   • never-in-loss      (a price can't go below cost-to-serve)
 *   • consent-before-sale
 *   • child-safety        (the minor/guardian gate)
 *
 * So this interpreter has no command that can disable those; price changes are
 * floor-validated; charity is rate-capped. Consequential actions return a
 * preview and require an explicit confirm. Structural CODE changes are out of
 * scope at runtime by design — the interpreter says so honestly and records the
 * request rather than pretending to rewrite its own source.
 *
 * Pure + dependency-free. The server passes in the live mutation API (settings,
 * control plane) via `ctx`; this module decides WHAT to do and whether it's
 * allowed, the server performs the effect.
 */

// Hard invariants — surfaced so the interpreter can refuse clearly.
const PROTECTED = Object.freeze([
  'never-in-loss', 'consent-before-sale', 'child-safety',
]);

const TIERS = ['karigar', 'vyapari', 'niryatak', 'pravasi', 'sansthan'];

function _num(str) {
  // pull a rupee amount: "399", "₹1,299", "1299 rupees"
  const m = String(str).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function _tier(str) {
  const s = String(str).toLowerCase();
  return TIERS.find((t) => s.includes(t)) || null;
}
function _pct(str) {
  const m = String(str).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(?:%|percent|pct)/);
  return m ? parseFloat(m[1]) / 100 : null;
}

/**
 * The command catalog. Each: id, match (does this instruction apply?), build
 * (extract params + preview + guard), and `effect` name the server maps to a
 * real mutation. `requiresConfirm` gates consequential changes.
 */
const COMMANDS = [
  // ── Refuse anything that would breach a hard invariant ──
  {
    id: 'blocked_invariant',
    match: (s) => /(disable|turn off|remove|bypass|skip|ignore).*(consent|child|minor|guardian|never.?in.?loss|loss|floor|safety)/.test(s)
      || /(sell|list).*(without|no).*(consent|authoriz)/.test(s)
      || /(allow|let).*(minor|child).*(without|no).*(guardian)/.test(s),
    build: () => ({
      ok: false, blocked: true,
      reason: 'That would breach a hard invariant (never-in-loss, consent-before-sale, or child-safety). These protect the business and the people on the platform and cannot be switched off — not even by the founder.',
      protected: PROTECTED,
    }),
  },

  // ── Pricing (floor-validated) ──
  {
    id: 'set_price',
    match: (s) => /(price|cost|charge|plan)/.test(s) && /(set|change|make|raise|lower|update|to)/.test(s) && !!_tier(s) && _num(s) != null,
    build: (s) => {
      const tier = _tier(s), rupees = _num(s);
      return {
        ok: true, effect: 'set_price', requiresConfirm: true,
        params: { tier, price_paise: Math.round(rupees * 100) },
        preview: `Set the ${tier} subscription price to ₹${rupees.toLocaleString('en-IN')}/mo. Will be rejected if below the cost-to-serve floor (never-in-loss).`,
      };
    },
  },

  // ── Charity (rate-capped, named cause) ──
  {
    id: 'set_charity',
    match: (s) => /charit|donat|welfare|give back/.test(s),
    build: (s) => {
      const off = /(turn off|disable|stop|no charity)/.test(s);
      const pct = _pct(s);
      // try to capture a cause after "for"
      const causeM = s.match(/for (?:the )?([a-z0-9 ]+?)(?: fund| at | with |$)/);
      const cause = causeM ? causeM[1].trim() : null;
      if (off) return { ok: true, effect: 'set_charity', requiresConfirm: true, params: { enabled: false }, preview: 'Turn off the charity contribution.' };
      return {
        ok: true, effect: 'set_charity', requiresConfirm: true,
        params: { enabled: true, pct: pct != null ? pct : undefined, cause: cause || undefined },
        preview: `Enable charity${pct != null ? ' at ' + Math.round(pct * 100) + '%' : ''}${cause ? ' for "' + cause + '"' : ''}. Rate is capped at 5% and a named cause is required.`,
      };
    },
  },

  // ── Pause / resume an operational agent ──
  {
    id: 'toggle_agent',
    match: (s) => /(pause|stop|resume|enable|disable|turn on|turn off).*(agent|watchdog|seo|cms|telecaller|sourcing|scheduler)/.test(s),
    build: (s) => {
      const on = /(resume|enable|turn on|start)/.test(s);
      const agentM = s.match(/(watchdog|seo|cms|telecaller|sourcing|scheduler)/);
      const agent = agentM ? agentM[1] : 'agent';
      return {
        ok: true, effect: 'toggle_agent', requiresConfirm: false,
        params: { agent, paused: !on },
        preview: `${on ? 'Resume' : 'Pause'} the ${agent} agent.`,
      };
    },
  },

  // ── AI autonomy tier ──
  {
    id: 'set_autonomy',
    match: (s) => /(autonomy|auto.?mode|manual|notify)/.test(s) && /(set|make|switch|change|only)/.test(s),
    build: (s) => {
      let tier = 'manual';
      // Check manual/notify first; match "auto" only as a standalone mode word
      // (so the word "autonomy" itself isn't read as the "auto" tier).
      if (/manual/.test(s)) tier = 'manual';
      else if (/notify/.test(s)) tier = 'notify';
      else if (/\bauto\b|auto mode|automatic/.test(s)) tier = 'auto';
      return {
        ok: true, effect: 'set_autonomy', requiresConfirm: true,
        params: { autonomy: tier },
        preview: `Set the AI autonomy to ${tier}. (manual = nothing runs without your click; notify = runs and tells you; auto = read-only actions can run.)`,
      };
    },
  },

  // ── Read-only: explain current configuration ──
  {
    id: 'explain_config',
    match: (s) => /(what|show|explain|current|status|tell me).*(price|charity|config|setting|autonomy|state)/.test(s) || /^(status|config)$/.test(s.trim()),
    build: () => ({ ok: true, effect: 'explain_config', requiresConfirm: false, params: {}, preview: 'Show the current platform configuration.' }),
  },

  // ── Structural / code change — honest out-of-scope ──
  {
    id: 'structural_change',
    match: (s) => /(add|build|create|write|change|modify|refactor).*(module|endpoint|feature|code|table|schema|field|api|page|view)/.test(s),
    build: (s) => ({
      ok: false, deferred: true, effect: 'record_change_request',
      params: { request: s },
      reason: 'That\u2019s a structural/code change. I won\u2019t rewrite the running platform\u2019s source from a chat instruction — that\u2019s how outages and security holes happen. I\u2019ve recorded it as a change request for a safe, reviewed build.',
    }),
  },
];

/**
 * interpret — turn a plain-language instruction into a structured action.
 * @returns { matched, id, ok, effect, params, preview, requiresConfirm, blocked, deferred, reason }
 */
function interpret(instruction) {
  const s = String(instruction || '').toLowerCase().trim();
  if (!s) return { matched: false, ok: false, reason: 'Tell me what to change.' };
  // Order matters: invariant-block first, structural last.
  for (const cmd of COMMANDS) {
    if (cmd.match(s)) {
      const built = cmd.build(s);
      return { matched: true, id: cmd.id, ...built };
    }
  }
  return {
    matched: false, ok: false,
    reason: 'I couldn\u2019t map that to a safe action. Try: "set the karigar price to 399", "enable charity at 2% for artisan welfare", "pause the SEO agent", or "set autonomy to manual".',
  };
}

module.exports = { PROTECTED, TIERS, COMMANDS, interpret };
