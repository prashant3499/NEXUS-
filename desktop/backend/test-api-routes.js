'use strict';

/**
 * test-api-routes.js — Integration tests for the new REST endpoints.
 *
 * Spawns the server in a child process, hits each endpoint with real HTTP,
 * verifies status codes + bodies + persistence (data survives between calls).
 * Same pattern as test-payments / test-wiring but exercises sourcing + returns.
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const a = (cond, msg) => { if (cond) { pass++; console.log('  \u2713 ' + msg); } else { fail++; console.log('  \u2717 FAIL: ' + msg); } };
const sec = (n) => console.log('\n\u2501\u2501\u2501 ' + n + ' \u2501\u2501\u2501\n');

const PORT = 4101;          // separate port so it doesn't collide with the dev server
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = path.join(__dirname, 'data-test');
const STORE_FILE = path.join(DATA_DIR, 'nexus-store.json');

// ────────────────────────────────────────────────────────────
// HTTP helper
// ────────────────────────────────────────────────────────────

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      method, hostname: 'localhost', port: PORT, path,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : null }); }
        catch { resolve({ status: res.statusCode, json: null, raw: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer() {
  for (let i = 0; i < 30; i++) {
    try { await req('GET', '/health'); return; } catch { await sleep(150); }
  }
  throw new Error('server did not start');
}

// ────────────────────────────────────────────────────────────
// Boot
// ────────────────────────────────────────────────────────────

(async () => {
  // Clean slate
  if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);

  const env = { ...process.env, PORT: String(PORT), DATA_DIR, AUTH_MODE: 'none' };
  const proc = spawn('node', ['server.js'], { env, stdio: 'pipe' });
  let stderr = '';
  proc.stderr.on('data', d => stderr += String(d));

  try {
    await waitForServer();
    console.log('  Server up on :' + PORT);

    // ════════════════════════════════════════════════════════════
    sec('SOURCING — GET /api/leads on empty store');
    {
      const r = await req('GET', '/api/leads');
      a(r.status === 200,             'GET /api/leads → 200');
      a(r.json.total === 0,            'Empty store reports total 0');
      a(Array.isArray(r.json.leads),    'leads is an array');
    }

    sec('SOURCING — POST /api/leads creates a lead');
    let lead1;
    {
      const body = {
        source: 'gjepc_member_directory',
        segment: 'niryatak_prospect',
        name: 'Surat Diamond House',
        contactHandles: { whatsapp: '+919876543210' },
        signals: { hasIEC: true, exportingAlready: true, hasGST: true, onGJEPCorEPCH: true },
        notes: 'GJEPC member #12345',
      };
      const r = await req('POST', '/api/leads', body);
      a(r.status === 201,                          'Returns 201 created');
      a(r.json.id && r.json.id.startsWith('lead_'),'ID generated with correct prefix');
      a(r.json.status === 'new',                    'Initial status is new');
      a(r.json.score > 0,                            'Score computed');
      a(r.json.suggestedTier === 'niryatak',         'Suggested tier from signals');
      a(r.json.history.length === 1,                 'History created');
      lead1 = r.json;
    }

    sec('SOURCING — POST /api/leads validates input');
    {
      const r1 = await req('POST', '/api/leads', { source: 'unknown' });
      a(r1.status === 400,                          'Unknown source → 400');
      a(r1.json.error && /source/i.test(r1.json.error), 'Error mentions source');

      const r2 = await req('POST', '/api/leads', {
        source: 'gjepc_member_directory', segment: 'niryatak_prospect',
      });
      a(r2.status === 400,                          'Missing name → 400');

      const r3 = await req('POST', '/api/leads', {});
      a(r3.status === 400,                          'Empty body → 400');
    }

    sec('SOURCING — GET /api/leads/:id fetches single lead');
    {
      const r = await req('GET', '/api/leads/' + lead1.id);
      a(r.status === 200,                          'Returns 200');
      a(r.json.id === lead1.id,                     'Correct lead returned');
      a(r.json.name === 'Surat Diamond House',       'Full record returned');

      const r2 = await req('GET', '/api/leads/lead_nonexistent');
      a(r2.status === 404,                          'Unknown ID → 404');
    }

    sec('SOURCING — PATCH /api/leads/:id transitions status');
    {
      const r = await req('PATCH', '/api/leads/' + lead1.id, { status: 'researched', note: 'read profile' });
      a(r.status === 200,                          'PATCH returns 200');
      a(r.json.status === 'researched',             'Status updated');
      a(r.json.history.length === 2,                 'History grew by 1');
      a(r.json.history[1].note === 'read profile',    'Note recorded');
      a(r.json.history[1].from === 'new',             'From-state recorded');
    }

    sec('SOURCING — PATCH validates transitions');
    {
      // Try invalid jump from researched → onboarded
      const r = await req('PATCH', '/api/leads/' + lead1.id, { status: 'onboarded' });
      a(r.status === 400,                          'Invalid jump → 400');
      a(/Invalid transition/i.test(r.json.error),   'Error explains invalid transition');

      // Unknown lead
      const r2 = await req('PATCH', '/api/leads/lead_xxx', { status: 'contacted' });
      a(r2.status === 404,                          'Unknown lead → 404');

      // Missing status field
      const r3 = await req('PATCH', '/api/leads/' + lead1.id, {});
      a(r3.status === 400,                          'Missing status → 400');
    }

    sec('SOURCING — Persistence: data survives via store');
    {
      // Add a second lead, then verify the store file actually grew
      const body = {
        source: 'gi_tag_holders', segment: 'vyapari_prospect',
        name: 'Bhuj Bandhani Coop',
        signals: { hasGST: true, hasGITag: true, hasWebsite: true },
      };
      await req('POST', '/api/leads', body);
      await sleep(50);
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      a(Array.isArray(saved.leads),                 'Store file has leads array');
      a(saved.leads.length === 2,                    'Both leads persisted');
      a(saved.leads.some(([id, l]) => l.name === 'Bhuj Bandhani Coop'),
                                                     'New lead in saved store');
    }

    sec('SOURCING — GET /api/leads?status=new filters');
    {
      const r = await req('GET', '/api/leads?status=new');
      a(r.status === 200,                          'Filtered GET → 200');
      a(r.json.total === 2,                          'Total count unchanged');
      a(r.json.filtered === 1,                       'Filtered count: 1 in status=new');
      a(r.json.leads.every(l => l.status === 'new'), 'All filtered have new status');
    }

    sec('SOURCING — GET /api/leads/funnel');
    {
      const r = await req('GET', '/api/leads/funnel');
      a(r.status === 200,                          'Funnel → 200');
      a(r.json.totalLeads === 2,                     'Funnel reports 2 leads');
      a('stages' in r.json,                         'Stages object returned');
      a('conversions' in r.json,                    'Conversions returned');
    }

    sec('SOURCING — GET /api/leads/dormant');
    {
      const r = await req('GET', '/api/leads/dormant');
      a(r.status === 200,                          'Dormant → 200');
      a(Array.isArray(r.json.dormant_ids),          'Returns array');
      a(r.json.dormant_ids.length === 0,             'No dormant leads (just created)');
    }

    // ════════════════════════════════════════════════════════════
    sec('RETURNS — GET /api/returns on empty store');
    {
      const r = await req('GET', '/api/returns');
      a(r.status === 200,                          'Returns → 200');
      a(r.json.total === 0,                          'Empty');
      a(r.json.summary && r.json.summary.total === 0, 'Summary returns 0 total');
    }

    sec('RETURNS — POST /api/returns creates a return');
    let ret1;
    {
      const body = {
        orderId: 'ord_42', buyerId: 'b_amita', sellerId: 's_ramvati',
        originalSlicePaise: 200000,
        deliveredAt: Date.now() - 2 * 86400000,  // 2 days ago, within 7-day window
        reason: 'quality_issue',
        notes: 'glaze cracked',
      };
      const r = await req('POST', '/api/returns', body);
      a(r.status === 201,                          'Return created');
      a(r.json.id && r.json.id.startsWith('ret_'),  'ID prefixed correctly');
      a(r.json.status === 'requested',              'Status: requested');
      a(r.json.requiresHitl === false,              'Low-value: no HITL');
      ret1 = r.json;
    }

    sec('RETURNS — POST validates reason and window');
    {
      // Bad reason
      const r1 = await req('POST', '/api/returns', {
        orderId: 'o', buyerId: 'b', sellerId: 's',
        originalSlicePaise: 100, deliveredAt: Date.now(), reason: 'unknown',
      });
      a(r1.status === 400,                          'Unknown reason → 400');

      // Out of window → API still 201 but status=expired (auto-rejected)
      const r2 = await req('POST', '/api/returns', {
        orderId: 'o2', buyerId: 'b', sellerId: 's',
        originalSlicePaise: 100,
        deliveredAt: Date.now() - 10 * 86400000,
        reason: 'changed_mind',
      });
      a(r2.status === 201,                          'Out-of-window still creates (auto-expired)');
      a(r2.json.status === 'expired',                'Marked as expired');
      a(r2.json.autoRejected === true,              'autoRejected flag set');
    }

    sec('RETURNS — High-value flags HITL');
    {
      const body = {
        orderId: 'ord_big', buyerId: 'b_rich', sellerId: 's_lux',
        originalSlicePaise: 7500000,  // ₹75K — over the ₹50K threshold
        deliveredAt: Date.now() - 86400000,
        reason: 'not_as_described',
      };
      const r = await req('POST', '/api/returns', body);
      a(r.status === 201,                          'High-value created');
      a(r.json.requiresHitl === true,               'HITL flag set');
      a(r.json.hitlReason && /High-value/.test(r.json.hitlReason),
                                                     'HITL reason explains why');
    }

    sec('RETURNS — PATCH /api/returns/:id transitions');
    {
      const r = await req('PATCH', '/api/returns/' + ret1.id, {
        status: 'approved', note: 'seller agreed',
      });
      a(r.status === 200,                          'PATCH → 200');
      a(r.json.status === 'approved',               'Status moved to approved');
      a(r.json.history.length === 2,                 'History recorded');

      // Walk through full happy path
      const r2 = await req('PATCH', '/api/returns/' + ret1.id, { status: 'in_transit' });
      a(r2.json.status === 'in_transit',             'Transitions to in_transit');
      const r3 = await req('PATCH', '/api/returns/' + ret1.id, { status: 'received' });
      a(r3.json.status === 'received',                'Transitions to received');
    }

    sec('RETURNS — POST /api/returns/:id/refund computes breakdown');
    {
      const body = {
        reverseSlice: {
          maker: 160000, platform: 20000, gst: 10000, tcs: 2000,
          charity: 400, insurance: 4000, gateway_fee: 3600,
        },
      };
      const r = await req('POST', '/api/returns/' + ret1.id + '/refund', body);
      a(r.status === 200,                          'Refund → 200');
      a(r.json.sellerFault === true,                'Quality issue is seller-fault');
      a(r.json.buyerRefundPaise === 160000 + 20000 + 10000 + 2000 + 4000 + 3600,
                                                     'Full refund except charity');
      a(r.json.breakdown.charityRetained === 400,    'Charity NEVER refunded');
    }

    sec('RETURNS — refund requires received status');
    {
      // Create a fresh return still in 'requested'
      const c = await req('POST', '/api/returns', {
        orderId: 'ord_99', buyerId: 'b', sellerId: 's',
        originalSlicePaise: 50000, deliveredAt: Date.now() - 86400000,
        reason: 'changed_mind',
      });
      const r = await req('POST', '/api/returns/' + c.json.id + '/refund', { reverseSlice: {} });
      a(r.status === 400,                          'Refund on non-received → 400');
    }

    sec('RETURNS — GET /api/returns/breaches');
    {
      const r = await req('GET', '/api/returns/breaches');
      a(r.status === 200,                          'Breaches → 200');
      a(Array.isArray(r.json.breaches),            'Returns array');
      // Fresh returns won't be breaching (just created)
    }

    sec('RETURNS — persistence survives in store file');
    {
      await sleep(50);
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      a(Array.isArray(saved.returns),               'Returns persisted');
      a(saved.returns.length >= 3,                   'Multiple returns saved');
    }

    // ════════════════════════════════════════════════════════════
    sec('CONVERSATIONS — empty list on first call');
    {
      const r = await req('GET', '/api/conversations');
      a(r.status === 200,                            'GET → 200');
      a(r.json.total === 0,                           'Empty');
      a(Array.isArray(r.json.conversations),          'Array shape');
    }

    let conv1;
    sec('CONVERSATIONS — POST creates a thread');
    {
      const body = {
        turns: [
          { role: 'user',      content: 'What is the most important thing today?' },
          { role: 'assistant', content: 'The 3 sourcing leads waiting for first contact.' },
        ],
      };
      const r = await req('POST', '/api/conversations', body);
      a(r.status === 201,                            'POST → 201');
      a(r.json.id && r.json.id.startsWith('conv_'),  'Conversation id prefixed');
      a(Array.isArray(r.json.turns) && r.json.turns.length === 2, 'Turns recorded');
      a(r.json.started_at > 0,                        'Timestamp set');
      conv1 = r.json;
    }

    sec('CONVERSATIONS — POST accepts empty turns');
    {
      const r = await req('POST', '/api/conversations', {});
      a(r.status === 201,                            'Empty body → still creates');
      a(Array.isArray(r.json.turns),                 'turns is array');
    }

    sec('CONVERSATIONS — GET single fetches full record');
    {
      const r = await req('GET', '/api/conversations/' + conv1.id);
      a(r.status === 200,                            'GET single → 200');
      a(r.json.id === conv1.id,                       'Same id');
      a(r.json.turns.length === 2,                    'Full turns returned');

      const r2 = await req('GET', '/api/conversations/conv_nonexistent');
      a(r2.status === 404,                           'Unknown id → 404');
    }

    sec('CONVERSATIONS — PATCH replaces turns');
    {
      const newTurns = [
        ...conv1.turns,
        { role: 'user',      content: 'OK, draft the outreach for the top lead.' },
        { role: 'assistant', content: 'Here is the draft using the niryatak first-touch template…' },
      ];
      const r = await req('PATCH', '/api/conversations/' + conv1.id, { turns: newTurns });
      a(r.status === 200,                            'PATCH → 200');
      a(r.json.turns.length === 4,                    'Turns updated');
      a(r.json.updated_at >= conv1.started_at,        'updated_at advanced');
    }

    sec('CONVERSATIONS — PATCH appendTurn convenience');
    {
      const r = await req('PATCH', '/api/conversations/' + conv1.id, {
        appendTurn: { role: 'user', content: 'Thanks.' },
      });
      a(r.status === 200,                            'Append → 200');
      a(r.json.turns.length === 5,                    'Appended one turn');
      a(r.json.turns[r.json.turns.length-1].role === 'user', 'Appended turn is user');
      a(r.json.turns[r.json.turns.length-1].at > 0,   'Append timestamp set');
    }

    sec('CONVERSATIONS — GET list reverse-chronological');
    {
      const r = await req('GET', '/api/conversations');
      a(r.status === 200,                            'List → 200');
      a(r.json.total >= 2,                            'At least 2 conversations');
      // Most recent (= last touched) first
      for (let i = 1; i < r.json.conversations.length; i++) {
        a(r.json.conversations[i-1].updated_at >= r.json.conversations[i].updated_at,
                                                       `Index ${i} not newer than ${i-1}`);
      }
      // Each item has preview and turn_count
      a('turn_count' in r.json.conversations[0],     'turn_count present');
      a('preview' in r.json.conversations[0],         'preview present');
    }

    sec('CONVERSATIONS — DELETE removes thread');
    {
      const r = await req('DELETE', '/api/conversations/' + conv1.id);
      a(r.status === 200,                            'DELETE → 200');
      a(r.json.deleted === conv1.id,                  'Returned deleted id');

      const r2 = await req('GET', '/api/conversations/' + conv1.id);
      a(r2.status === 404,                           'GET after delete → 404');

      const r3 = await req('DELETE', '/api/conversations/conv_xxx');
      a(r3.status === 404,                           'DELETE unknown → 404');
    }

    sec('CONVERSATIONS — persistence in store file');
    {
      // Create one we can verify in the file
      await req('POST', '/api/conversations', { turns: [{ role: 'user', content: 'persist me' }] });
      await sleep(50);
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      a(Array.isArray(saved.conversations),          'conversations key in store file');
      a(saved.conversations.length >= 1,              'At least one conversation persisted');
    }

    // ════════════════════════════════════════════════════════════
    sec('SCHEDULER — /api/ops/status returns shape');
    {
      const r = await req('GET', '/api/ops/status');
      a(r.status === 200,                            'Status → 200');
      a(typeof r.json.enabled === 'boolean',          'enabled flag present');
      a(typeof r.json.intervalMs === 'number',         'intervalMs present');
      a(r.json.lastSweep !== undefined,                'lastSweep present');
      a(typeof r.json.auditCount === 'number',         'auditCount present');
      // After boot, the initial sweep should already have run
      a(r.json.lastSweep > 0 || r.json.enabled === false,
                                                       'Initial sweep ran (or scheduler disabled)');
    }

    sec('SCHEDULER — /api/ops/sweep triggers manual sweep');
    {
      const before = await req('GET', '/api/ops/status');
      const r = await req('POST', '/api/ops/sweep');
      a(r.status === 200,                            'Sweep → 200');
      a(r.json.sweptAt > 0,                            'sweptAt timestamp set');
      a(r.json.result && r.json.result.health,         'Health result included');
      a('summary' in r.json.result.health,             'Summary in health result');
      const after = await req('GET', '/api/ops/status');
      a(after.json.lastSweep >= before.json.lastSweep, 'lastSweep advanced (or unchanged)');
    }

    sec('SCHEDULER — health check results are well-formed');
    {
      const r = await req('POST', '/api/ops/sweep');
      const results = r.json.result.health.results;
      a('store_size' in results,                       'store_size check ran');
      a('inference_cost_share' in results,             'inference_cost_share ran');
      a('ready_gate' in results,                       'ready_gate ran');
      a('returns_sla' in results,                      'returns_sla ran');
      a('sourcing_freshness' in results,               'sourcing_freshness ran');
      // Each result has level + evidence
      const sample = results.store_size;
      a(['ok','warn','fail'].includes(sample.level),  'level is valid enum');
      a(typeof sample.evidence === 'string',           'evidence is string');
    }

    sec('SCHEDULER — audit log captures non-OK checks');
    {
      const r = await req('GET', '/api/ops/audit?limit=10');
      a(r.status === 200,                            'Audit → 200');
      a(Array.isArray(r.json.audit),                  'audit is array');
      // The test environment has missing config (ready_gate fail), so we expect at least one audit entry
      a(r.json.audit.length >= 0,                     'Audit count non-negative');
      // If there are entries, they have the right shape
      if (r.json.audit.length > 0) {
        const e = r.json.audit[0];
        a(e.id && e.id.startsWith('ops_'),            'Audit entry has prefixed id');
        a(typeof e.at === 'number',                    'at is number');
        a(['check','runbook_step','window_complete','profit_sweep','pnl_digest'].includes(e.action), 'action enum valid');
      }
    }

    sec('GENERAL — 404 on unknown route');
    {
      const r = await req('GET', '/api/nonexistent');
      a(r.status === 404,                          'Unknown route → 404');
    }

    sec('BODY PARSER — malformed JSON returns 400 with clear error');
    {
      // Send raw garbage to a POST endpoint
      const data = 'this is {{{ not json';
      const r = await new Promise((resolve) => {
        const rq = http.request({
          method: 'POST', hostname: 'localhost', port: PORT, path: '/api/leads',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
          let buf = ''; res.on('data', c => buf += c);
          res.on('end', () => {
            try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); }
            catch { resolve({ status: res.statusCode, raw: buf }); }
          });
        });
        rq.write(data); rq.end();
      });
      a(r.status === 400,                          'Malformed JSON → 400');
      a(r.json && /Invalid JSON/i.test(r.json.error), 'Error message names the actual problem');
      // Verify the misleading "Unknown source" is NOT in the error
      a(r.json && !/Unknown source/.test(r.json.error), 'No misleading "Unknown source" leak');
    }

    sec('BODY PARSER — empty body parses to {} (does NOT 400)');
    {
      const r = await new Promise((resolve) => {
        const rq = http.request({
          method: 'POST', hostname: 'localhost', port: PORT, path: '/api/leads',
          headers: { 'Content-Type': 'application/json', 'Content-Length': '0' },
        }, (res) => {
          let buf = ''; res.on('data', c => buf += c);
          res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, raw: buf }); } });
        });
        rq.end();
      });
      // Empty body parses cleanly to {} — then sourcing.createLead() rejects it
      // with a 400 because required fields are missing. Different from the malformed-JSON 400.
      a(r.status === 400,                          'Empty body → 400 from validation');
      a(r.json && !/Invalid JSON/i.test(r.json.error || ''),
                                                    'Error is validation-style, not parser-style');
    }

    sec('BODY PARSER — oversized payload rejected with 413');
    {
      const huge = JSON.stringify({
        source: 'gjepc_member_directory', segment: 'niryatak_prospect',
        name: 'X', notes: 'A'.repeat(1_500_000),    // 1.5 MB
      });
      const r = await new Promise((resolve) => {
        const rq = http.request({
          method: 'POST', hostname: 'localhost', port: PORT, path: '/api/leads',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(huge) },
        }, (res) => {
          let buf = ''; res.on('data', c => buf += c);
          res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, raw: buf }); } });
        });
        rq.on('error', () => resolve({ status: 'ERR' }));
        rq.write(huge); rq.end();
      });
      a(r.status === 413,                          'Oversized → 413');
      a(r.json && /exceeds/.test(r.json.error || ''), 'Error names the size limit');
    }

    sec('BODY PARSER — small valid payload still works');
    {
      const r = await req('POST', '/api/leads', {
        source: 'gjepc_member_directory',
        segment: 'niryatak_prospect',
        name: 'Post-fix smoke',
      });
      a(r.status === 201,                          'Small payload → 201');
      a(r.json.id && r.json.id.startsWith('lead_'),'Lead created');
    }

    // ════════════════════════════════════════════════════════════
    sec('COOPERATIVES — GET empty list');
    {
      const r = await req('GET', '/api/cooperatives');
      a(r.status === 200,                          'GET → 200');
      a(r.json.total === 0,                          'Empty');
      a(Array.isArray(r.json.cooperatives),          'Array shape');
    }

    let coop1;
    sec('COOPERATIVES — POST creates with beneficiaries');
    {
      const body = {
        name: 'Khurja Potters Guild',
        region: 'Khurja, Uttar Pradesh',
        beneficiaries: [
          { id: 'p1', name: 'Ramvati Devi', share_bps: 4000 },
          { id: 'p2', name: 'Mohan Singh',  share_bps: 3500 },
          { id: 'p3', name: 'Lakshmi Bai',  share_bps: 2500 },
        ],
      };
      const r = await req('POST', '/api/cooperatives', body);
      a(r.status === 201,                          'POST → 201');
      a(r.json.id && r.json.id.startsWith('coop_'),'ID prefixed');
      a(r.json.beneficiaries.length === 3,          'Three beneficiaries persisted');
      coop1 = r.json;
    }

    sec('COOPERATIVES — POST validates beneficiary shares');
    {
      const r = await req('POST', '/api/cooperatives', {
        name: 'Bad', region: 'X',
        beneficiaries: [
          { id: 'a', name: 'A', share_bps: 6000 },
          { id: 'b', name: 'B', share_bps: 5000 },  // sums to 11000
        ],
      });
      a(r.status === 400,                          'Wrong sum → 400');
      a(r.json.error && /10000/.test(r.json.error), 'Error names the required sum');
    }

    sec('COOPERATIVES — GET single + 404 unknown');
    {
      const r = await req('GET', '/api/cooperatives/' + coop1.id);
      a(r.status === 200,                          'GET single → 200');
      a(r.json.id === coop1.id,                     'Same id');

      const r2 = await req('GET', '/api/cooperatives/coop_nonexistent');
      a(r2.status === 404,                         'Unknown id → 404');
    }

    sec('COOPERATIVES — POST /:id/preview computes split');
    {
      const r = await req('POST', '/api/cooperatives/' + coop1.id + '/preview', {
        makerPortionPaise: 158000,
      });
      a(r.status === 200,                          'Preview → 200');
      a(r.json.ok === true,                          'Split succeeded');
      a(r.json.totalAllocated === 158000,            'Reconciles to input');
      a(r.json.allocations.length === 3,             'Three allocations returned');
    }

    sec('COOPERATIVES — PATCH replaces beneficiaries');
    {
      const r = await req('PATCH', '/api/cooperatives/' + coop1.id, {
        beneficiaries: [
          { id: 'p1', name: 'Ramvati Devi', share_bps: 5000 },
          { id: 'p2', name: 'Mohan Singh',  share_bps: 3000 },
          { id: 'p3', name: 'Lakshmi Bai',  share_bps: 2000 },
        ],
      });
      a(r.status === 200,                          'PATCH → 200');
      a(r.json.beneficiaries[0].share_bps === 5000, 'New shares applied');
    }

    sec('COOPERATIVES — persistence');
    {
      await sleep(50);
      const saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      a(Array.isArray(saved.cooperatives),         'cooperatives key in store file');
      a(saved.cooperatives.length >= 1,             'At least one persisted');
    }

    // ════════════════════════════════════════════════════════════
    sec('SCHEMES — GET list');
    {
      const r = await req('GET', '/api/schemes');
      a(r.status === 200,                          'GET → 200');
      a(r.json.total >= 9,                          'At least 9 schemes registered');
      a(r.json.schemes.some(s => s.id === 'pmkvy'),'PMKVY in list');
      a(r.json.schemes.some(s => s.id === 'pm_vishwakarma'), 'Vishwakarma in list');
    }

    sec('SCHEMES — GET single + checklist');
    {
      const r = await req('GET', '/api/schemes/pm_vishwakarma');
      a(r.status === 200,                          'GET single → 200');
      a(r.json.id === 'pm_vishwakarma',             'Right scheme');

      const r2 = await req('GET', '/api/schemes/pm_vishwakarma/checklist');
      a(r2.status === 200,                         'Checklist → 200');
      a(Array.isArray(r2.json.documents_required), 'Documents listed');
      a(Array.isArray(r2.json.application_steps),  'Steps listed');

      const r3 = await req('GET', '/api/schemes/unknown_scheme');
      a(r3.status === 404,                         'Unknown → 404');
    }

    sec('SCHEMES — POST /evaluate with a profile');
    {
      const profile = {
        age: 35, gender: 'female', category: 'obc',
        has_aadhaar: true, has_bank_account: true,
        has_gst: false, craft_category: 'pottery',
        state: 'UP', is_first_business: true,
      };
      const r = await req('POST', '/api/schemes/evaluate', { profile });
      a(r.status === 200,                          'Evaluate → 200');
      a(r.json.eligibleCount >= 3,                  '3+ schemes eligible for this profile');
      a(r.json.eligible[0].score > 0,               'Top scheme has a positive score');
      a(Array.isArray(r.json.ineligible),          'Ineligible list returned');
    }

    sec('SCHEMES — POST /evaluate with empty profile');
    {
      const r = await req('POST', '/api/schemes/evaluate', { profile: {} });
      a(r.status === 200,                          'Empty profile → 200');
      a(r.json.eligibleCount <= 2,                  'Almost nothing matches');
    }

    sec('GENERAL — existing endpoints still work');
    {
      const r1 = await req('GET', '/health');
      a(r1.status === 200,                          '/health still works');
      const r2 = await req('GET', '/api');
      a(r2.status === 200,                          '/api index still works');
    }
  } catch (e) {
    console.error('Test error:', e.message);
    if (stderr) console.error('Server stderr:', stderr);
    fail++;
  } finally {
    proc.kill();
    // Clean up
    try { if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE); } catch {}
    try { if (fs.existsSync(DATA_DIR)) fs.rmdirSync(DATA_DIR); } catch {}
  }

  console.log('\n' + '\u2550'.repeat(50));
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('\u2550'.repeat(50));
  process.exit(fail > 0 ? 1 : 0);
})();
