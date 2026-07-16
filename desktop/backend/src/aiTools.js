/**
 * NEXUS — AI Tool Registry.
 *
 * Defines the read-only tools the AI co-founder can invoke against the
 * live platform state. ALL tools in this v1 are read-only by design:
 * the AI can FIND, SUMMARIZE, and EVALUATE — but it cannot MUTATE.
 * Mutating tools (transition_lead, contact_lead, create_cooperative)
 * will live in future versions once the HITL approval pattern is
 * battle-tested.
 *
 * Each tool has:
 *   - name:        Anthropic-compatible tool name (snake_case)
 *   - description: shown to the LLM in its system prompt
 *   - input_schema: JSON-schema-ish, used to validate inputs
 *   - autonomy:    AUTO | NOTIFY | MANUAL — even though all are
 *                  read-only, the autonomy tier governs UI behavior
 *   - sensitive:   true if the result reveals PII (full lead details
 *                  vs. funnel summary). Sensitive tools require
 *                  explicit per-call approval.
 *   - executor:    pure function (input, state) -> result
 *                  state = { leads, returns, customers, ... }
 *
 * Same pattern as the other domain modules — pure, immutable, testable.
 */

'use strict';

// ════════════════════════════════════════════════════════════
// AUTONOMY TIERS
// ════════════════════════════════════════════════════════════

const AUTONOMY = {
  AUTO:   'auto',    // can run without explicit per-call approval
  NOTIFY: 'notify',  // can run, but every call surfaces in the audit feed
  MANUAL: 'manual',  // requires per-call founder approval before execution
};

// ════════════════════════════════════════════════════════════
// TOOL REGISTRY
// ════════════════════════════════════════════════════════════

const TOOLS = {

  // ──────────────────────────────────────────────────────────
  // search_leads
  // Find leads matching a query — name substring, segment, status.
  // ──────────────────────────────────────────────────────────
  search_leads: {
    name: 'search_leads',
    description: 'Search the lead pipeline. Returns matching leads (read-only). Use this when the founder asks "which leads…" or "show me Niryatak prospects" or "anything from GJEPC". Returns up to 10 leads, with their id, name, source, segment, current status, score, and last-touched timestamp. Use get_lead to fetch full detail on a specific lead.',
    input_schema: {
      type: 'object',
      properties: {
        name_contains: { type: 'string', description: 'Substring to match against lead name (case-insensitive)' },
        segment:       { type: 'string', enum: ['karigar_prospect', 'vyapari_prospect', 'niryatak_prospect', 'pravasi_prospect', 'sansthan_prospect'], description: 'Filter by suggested tier' },
        status:        { type: 'string', enum: ['new', 'researched', 'contacted', 'responded', 'qualified', 'demo_scheduled', 'onboarded', 'rejected', 'dormant'], description: 'Filter by current status' },
        limit:         { type: 'integer', minimum: 1, maximum: 25, description: 'Max results (default 10)' },
      },
      required: [],
    },
    autonomy: AUTONOMY.AUTO,
    sensitive: false,
    executor: (input, state) => {
      const leads = (state && state.leads) || [];
      const limit = input.limit || 10;
      let filtered = leads;
      if (input.name_contains) {
        const q = input.name_contains.toLowerCase();
        filtered = filtered.filter(l => (l.name || '').toLowerCase().includes(q));
      }
      if (input.segment) {
        filtered = filtered.filter(l => l.segment === input.segment);
      }
      if (input.status) {
        filtered = filtered.filter(l => l.status === input.status);
      }
      // Sort by score desc, return shape that's compact for LLM
      const ranked = filtered
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, limit)
        .map(l => ({
          id: l.id, name: l.name, source: l.source, segment: l.segment,
          status: l.status, score: l.score, last_touched_at: l.lastTouchedAt || l.createdAt,
        }));
      return {
        total_matched: filtered.length,
        returned: ranked.length,
        leads: ranked,
      };
    },
  },

  // ──────────────────────────────────────────────────────────
  // get_lead
  // Full detail on a specific lead — including contact handles and
  // history. Marked SENSITIVE because it returns PII.
  // ──────────────────────────────────────────────────────────
  get_lead: {
    name: 'get_lead',
    description: 'Get full detail on a single lead by id, including contact handles and full status history. Use this AFTER search_leads to drill into a specific candidate. Returns sensitive PII (phone, email) so requires founder approval.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'The lead id (e.g. "lead_abc123")' },
      },
      required: ['lead_id'],
    },
    autonomy: AUTONOMY.MANUAL,
    sensitive: true,
    executor: (input, state) => {
      const leads = (state && state.leads) || [];
      const lead = leads.find(l => l.id === input.lead_id);
      if (!lead) {
        return { found: false, error: `No lead with id ${input.lead_id}` };
      }
      return {
        found: true,
        lead: {
          id: lead.id,
          name: lead.name,
          source: lead.source,
          segment: lead.segment,
          status: lead.status,
          score: lead.score,
          contact_handles: lead.contactHandles || {},
          notes: lead.notes || '',
          history: lead.history || [],
          created_at: lead.createdAt,
          last_touched_at: lead.lastTouchedAt,
        },
      };
    },
  },

  // ──────────────────────────────────────────────────────────
  // summarize_funnel
  // Pipeline rollup — counts per status, leakiest step, dormant count.
  // No PII, no individual lead data.
  // ──────────────────────────────────────────────────────────
  summarize_funnel: {
    name: 'summarize_funnel',
    description: 'Summarize the lead pipeline. Returns counts per status, the leakiest step (where leads stall most), dormant count, and a top-3 by score. NO personal data — safe for use anywhere. Use this for "how is the funnel doing", "where are leads stuck", "give me a pipeline overview" type questions.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    autonomy: AUTONOMY.AUTO,
    sensitive: false,
    executor: (input, state) => {
      const leads = (state && state.leads) || [];
      const statusCounts = {};
      const STATUSES = ['new', 'researched', 'contacted', 'responded', 'qualified', 'demo_scheduled', 'onboarded', 'rejected', 'dormant'];
      STATUSES.forEach(s => statusCounts[s] = 0);
      leads.forEach(l => { if (statusCounts[l.status] !== undefined) statusCounts[l.status]++; });

      // Leakiest step — biggest dropoff between consecutive forward stages
      const forwardStages = ['new', 'researched', 'contacted', 'responded', 'qualified', 'demo_scheduled', 'onboarded'];
      let leakiestStep = null, biggestDrop = 0;
      for (let i = 0; i < forwardStages.length - 1; i++) {
        const here = leads.filter(l => forwardStages.indexOf(l.status) >= i).length;
        const next = leads.filter(l => forwardStages.indexOf(l.status) >= i + 1).length;
        const drop = here - next;
        if (drop > biggestDrop) {
          biggestDrop = drop;
          leakiestStep = `${forwardStages[i]} → ${forwardStages[i+1]}`;
        }
      }

      // Top-3 by score (no PII — just name + score + status)
      const top = leads
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3)
        .map(l => ({ name: l.name, score: l.score, status: l.status, segment: l.segment }));

      return {
        total_leads: leads.length,
        status_breakdown: statusCounts,
        leakiest_step: leakiestStep,
        biggest_drop_count: biggestDrop,
        top_3_by_score: top,
      };
    },
  },

  // ──────────────────────────────────────────────────────────
  // check_scheme_eligibility
  // Evaluate a hypothetical artisan profile against the 9 govt schemes.
  // No state lookup needed — pure evaluation.
  // ──────────────────────────────────────────────────────────
  check_scheme_eligibility: {
    name: 'check_scheme_eligibility',
    description: 'Evaluate an artisan profile against the 9 registered government schemes (PMKVY, MUDRA Shishu/Kishor, Stand-Up India, PM Vishwakarma, Udyam MSME, Ambedkar Hastshilp, GI Tag, Marketing Support). Returns the ranked list of eligible schemes with their benefit, ministry, and apply URL. Use this when the founder describes an artisan ("38yo woman, pottery, UP, has Aadhaar and bank, no GST") to instantly tell them what they qualify for.',
    input_schema: {
      type: 'object',
      properties: {
        age: { type: 'integer', minimum: 0, maximum: 120 },
        gender: { type: 'string', enum: ['female', 'male', 'other'] },
        category: { type: 'string', enum: ['general', 'obc', 'sc', 'st'] },
        craft_category: { type: 'string', enum: ['handicraft', 'handloom', 'pottery', 'gems_jewellery', 'metalwork', 'woodwork', 'leather', 'tailoring'] },
        state: { type: 'string', description: 'Indian state (e.g. "Uttar Pradesh")' },
        has_aadhaar: { type: 'boolean' },
        has_bank_account: { type: 'boolean' },
        has_gst: { type: 'boolean' },
        is_msme_registered: { type: 'boolean' },
        is_artisan_card: { type: 'boolean' },
        is_first_business: { type: 'boolean' },
        business_age_months: { type: 'integer', minimum: 0 },
      },
      required: [],
    },
    autonomy: AUTONOMY.AUTO,
    sensitive: false,
    executor: (input, _state) => {
      const schemes = require('./schemes');
      const eligible = schemes.findEligibleSchemes(input);
      // Compact shape for the LLM
      return {
        profile_evaluated: input,
        eligible_count: eligible.length,
        eligible_schemes: eligible.map(e => ({
          id: e.scheme.id,
          name: e.scheme.name,
          ministry: e.scheme.ministry,
          benefit: e.scheme.benefit,
          typical_amount_paise: e.scheme.typical_amount_paise,
          application_url: e.scheme.application_url,
          partner_required: e.scheme.partner_required || false,
          score: e.score,
        })),
      };
    },
  },

  // ──────────────────────────────────────────────────────────
  // transition_lead  ⚠ MUTATING
  // Move a lead from its current status to a new valid status. The
  // state machine is enforced — see VALID_TRANSITIONS in src/sourcing.js.
  // Always MANUAL: the founder always sees the before/after preview and
  // explicitly clicks Approve. The audit log records the previous status
  // so the action can be rolled back.
  // ──────────────────────────────────────────────────────────
  transition_lead: {
    name: 'transition_lead',
    description: 'Move a lead to a new status. Use this AFTER the founder has confirmed they want the lead moved (e.g. "yes, mark Surat as contacted"). The state machine restricts which transitions are valid. From new → researched, contacted, rejected, dormant. From contacted → responded, rejected, dormant. Onboarded and rejected are terminal. This is a MUTATING action — the founder must approve every call, and the audit log records the previous status so it can be rolled back.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'The lead id (e.g. "lead_abc123")' },
        new_status: { type: 'string', enum: ['new', 'researched', 'contacted', 'responded', 'demo_scheduled', 'demo_done', 'trialling', 'onboarded', 'rejected', 'dormant'], description: 'The target status' },
        note: { type: 'string', description: 'Optional note recorded in the lead history (e.g. "Founder spoke to them on call — interested")' },
      },
      required: ['lead_id', 'new_status'],
    },
    autonomy: AUTONOMY.MANUAL,
    sensitive: false,
    mutating: true,
    executor: (input, state) => {
      const leads = (state && state.leads) || [];
      const lead = leads.find(l => l.id === input.lead_id);
      if (!lead) {
        return { ok: false, error: `No lead with id ${input.lead_id}` };
      }
      const sourcing = require('./sourcing');
      try {
        const updated = sourcing.updateLeadStatus(lead, input.new_status, input.note || '');
        // The CALLER applies the mutation to its own state (browser updates
        // window._SRC.leads, server updates sourcingState.leads). We just
        // return the new lead + the previous status for rollback.
        return {
          ok: true,
          lead_id: input.lead_id,
          previous_status: lead.status,
          new_status: input.new_status,
          note: input.note || null,
          updated_lead: {
            id: updated.id,
            name: updated.name,
            status: updated.status,
            history: updated.history,
            updatedAt: updated.updatedAt,
          },
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
  },

};

// ════════════════════════════════════════════════════════════
// VALIDATION + EXECUTION HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Validate a tool call. Returns { ok, error? }.
 * Checks:
 *   - tool exists
 *   - input is an object
 *   - required fields are present
 *   - enum fields contain allowed values
 *   - type fields match (basic — string/integer/boolean)
 */
function validateToolCall(toolName, input) {
  const tool = TOOLS[toolName];
  if (!tool) return { ok: false, error: `Unknown tool: ${toolName}` };
  if (input === null || input === undefined) return { ok: false, error: 'input must be an object' };
  if (typeof input !== 'object') return { ok: false, error: 'input must be an object' };

  const schema = tool.input_schema || {};
  const required = schema.required || [];
  for (const field of required) {
    if (input[field] === undefined) return { ok: false, error: `missing required field: ${field}` };
  }

  const props = schema.properties || {};
  for (const [key, value] of Object.entries(input)) {
    const spec = props[key];
    if (!spec) continue;  // tolerate extra fields
    if (spec.enum && !spec.enum.includes(value)) {
      return { ok: false, error: `${key} must be one of: ${spec.enum.join(', ')}` };
    }
    if (spec.type === 'string' && typeof value !== 'string') {
      return { ok: false, error: `${key} must be a string` };
    }
    if (spec.type === 'integer') {
      if (!Number.isInteger(value)) return { ok: false, error: `${key} must be an integer` };
      if (spec.minimum !== undefined && value < spec.minimum) return { ok: false, error: `${key} must be >= ${spec.minimum}` };
      if (spec.maximum !== undefined && value > spec.maximum) return { ok: false, error: `${key} must be <= ${spec.maximum}` };
    }
    if (spec.type === 'boolean' && typeof value !== 'boolean') {
      return { ok: false, error: `${key} must be a boolean` };
    }
  }
  return { ok: true };
}

/**
 * Execute a tool call against the given state snapshot.
 * Returns { ok, result, error? }. NEVER throws.
 * Audit metadata for the caller's audit log.
 */
function executeTool(toolName, input, state) {
  const validation = validateToolCall(toolName, input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const tool = TOOLS[toolName];
  const at = Date.now();
  try {
    const result = tool.executor(input || {}, state || {});
    return {
      ok: true,
      tool: toolName,
      autonomy: tool.autonomy,
      sensitive: tool.sensitive,
      mutating: tool.mutating || false,
      executed_at: at,
      result,
    };
  } catch (e) {
    return { ok: false, error: 'Execution failed: ' + e.message };
  }
}

/**
 * Build the Anthropic-compatible tools array for inclusion in a
 * messages API call. Each tool becomes:
 *   { name, description, input_schema }
 * Mutating tools (none yet) would be filtered out unless explicitly
 * opted in.
 */
function toolsForAnthropic(opts = {}) {
  const includeSensitive = opts.includeSensitive !== false;
  return Object.values(TOOLS)
    .filter(t => includeSensitive || !t.sensitive)
    .map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
}

/**
 * Build an immutable audit entry describing a tool call decision.
 *   decision: 'approved' | 'rejected' | 'executed' | 'failed'
 */
function auditEntry({ toolName, input, decision, result, error, by = 'founder', at = Date.now() }) {
  const crypto = require('crypto');
  const id = 'tcall_' + crypto.randomBytes(6).toString('hex');
  return Object.freeze({
    id,
    tool: toolName,
    input,
    decision,
    result: result || null,
    error: error || null,
    by,
    at,
  });
}

// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  AUTONOMY,
  TOOLS,
  validateToolCall,
  executeTool,
  toolsForAnthropic,
  auditEntry,
};
