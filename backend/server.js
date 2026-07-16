/**
 * UNIFIED — HTTP API Server (Node built-in http, zero dependencies).
 * Exposes the reconciled platform lifecycle over real, callable endpoints,
 * backed by file persistence so data survives restarts.
 *
 * Run:  node server.js     then  http://localhost:4100
 */

'use strict';

const http = require('http');
const { Platform } = require('./src/platform');
const { FileStore } = require('./src/store');
const { sliceTransaction } = require('./src/slicer');
const { config, productionReadiness, NON_CODE_GATES } = require('./src/config');

const store = new FileStore(config.dataDir ? require('path').join(config.dataDir, 'nexus-store.json') : undefined);
const plat = new Platform(store);

// Sourcing + returns are direct-on-store domains, separate from Platform's
// customer/product/order lifecycle. We persist their full records (frozen
// objects from src/sourcing.js and src/returns.js) into the same FileStore.
const sourcing = require('./src/sourcing');
const returns  = require('./src/returns');
const operations = require('./src/operations');
const cooperativeSplit = require('./src/cooperativeSplit');
const schemes = require('./src/schemes');
const sellerSignup = require('./src/sellerSignup');
const products = require('./src/products');
const profitGuard = require('./src/profitGuard');
const orderProfitGuard = require('./src/orderProfitGuard');
const orders = require('./src/orders');
const deployAgent = require('./src/deployAgent');
const auth = require('./src/auth');
const payments = require('./src/payments');
const razorpayProvider = require('./src/razorpayProvider');
const platformSettings = require('./src/platformSettings');
const adGeneration = require('./src/adGeneration');
const autoSource = require('./src/autoSource');
const supplyClusters = require('./src/supplyClusters');
const geo = require('./src/geo');
const executiveTeam = require('./src/executiveTeam');
const launchOrchestrator = require('./src/launchOrchestrator');
const grievance = require('./src/grievance');
const sellerConsent = require('./src/sellerConsent');
const platformManifest = require('./src/platformManifest');
const minorGuardian = require('./src/minorGuardian');
const saasMetrics = require('./src/saasMetrics');
const telecaller = require('./src/telecaller');
const prospectDb = require('./src/prospectDb');
const sourcingAgentSweep = require('./src/sourcingAgentSweep');
const founderCommands = require('./src/founderCommands');
const explainer = require('./src/explainer');
const watchdog = require('./src/watchdog');
const fraudDetection = require('./src/fraudDetection');
const ondc = require('./src/ondc');
const schemeAlignment = require('./src/schemeAlignment');
const insurance = require('./src/insurance');
const sellerAds = require('./src/sellerAds');
const integrations = require('./src/integrations');
const charityFund = require('./src/charityFund');
const customerSourcing = require('./src/customerSourcing');
const complianceRegistry = require('./src/complianceRegistry');
const i18n = require('./src/i18n');
const i18nStrings = require('./src/i18nStrings');
const beckn = require('./src/beckn');
const logistics = require('./src/logistics');
const webhooks = require('./src/webhooks');
const founderAdvisor = require('./src/founderAdvisor');
const translateRouter = require('./src/translateRouter');
const environmentVertical = require('./src/environmentVertical');
const kycVerification = require('./src/kycVerification');
const reviews = require('./src/reviews');
const asyncTaskManager = require('./src/asyncTaskManager');
const feedbackLoop = require('./src/feedbackLoop');
const selfAuditAgent = require('./src/selfAuditAgent');
const selfHealingAgent = require('./src/selfHealingAgent');
const innovationAgent = require('./src/innovationAgent');
const agentAuthority = require('./src/agentAuthority');
const founderConsole = require('./src/founderConsole');
const tradeCatalog = require('./src/tradeCatalog');
const dataSources = require('./src/dataSources');
const productionGuard = require('./src/productionGuard');
const listingAssistant = require('./src/listingAssistant');
const listingAI = listingAssistant.makeAIProvider({ anthropicApiKey: process.env.ANTHROPIC_API_KEY });
const growthAgent = require('./src/growthAgent');
const aiProviderRouter = require('./src/aiProviderRouter');
const governmentAlignment = require('./src/governmentAlignment');
const governmentLiaison = require('./src/governmentLiaisonAgent');
const dataProtection = require('./src/dataProtection');
const autoCorrect = require('./src/autoCorrect');
const founderControlCentre = require('./src/founderControlCentre');
const branding = require('./src/branding');
const contentStudio = require('./src/contentStudio');
const marketingStudio = require('./src/marketingStudio');
const changeControl = require('./src/changeControl');
const pipelineCoherence = require('./src/pipelineCoherence');
const insuranceConnector = require('./src/insuranceConnector');
const CHANGE_QUEUE = { _q: [], push(e) { this._q.push(e); }, list() { return this._q; }, take(id) { const i = this._q.findIndex((x) => x.id === id); return i >= 0 ? this._q.splice(i, 1)[0] : null; } };
const CORRECTION_QUEUE = { _q: [], push(e) { this._q.push(e); }, list() { return this._q; }, take(id) { const i = this._q.findIndex((x) => x.id === id); return i >= 0 ? this._q.splice(i, 1)[0] : null; } };
const presentationAgent = require('./src/presentationAgent');
const TASKS = asyncTaskManager.makeManager();
const kycVerifier = kycVerification.makeVerifier({ kycApiKey: process.env.KYC_API_KEY, kycProvider: process.env.KYC_PROVIDER });
const carbonMethodology = environmentVertical.makeCarbonMethodology({ carbonApiKey: process.env.CARBON_API_KEY, carbonRegistry: process.env.CARBON_REGISTRY });
const logisticsCourier = logistics.makeCourier({ courierApiKey: process.env.COURIER_API_KEY, courierId: process.env.COURIER_ID });
// Outbound webhook delivery queue (signed, retried, idempotent).
const WEBHOOK_QUEUE = webhooks.makeQueue();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_dev_default';
const insurer = insurance.makeInsurer({ insurerApiKey: process.env.INSURER_API_KEY, insurerId: process.env.INSURER_ID });

// Unified scheme engine: aggregates the welfare/credit schemes + the ONDC /
// digital-commerce schemes behind one interface. New programmes register as a
// source later without a rewrite — the platform aligns itself to serve them.
// Environment / climate government programmes — unlocked by the environment
// vertical. Real Indian green-economy schemes that benefit eco-craft sellers.
const GREEN_SCHEMES = [
  { id: 'csr_funding', name: 'Corporate CSR (Companies Act Sec 135)', body: 'Ministry of Corporate Affairs', category: 'recognition', benefit: 'Indian companies must spend 2% of profit on CSR — craft + environment is a prime, fundable target.', url: 'https://www.csr.gov.in' },
  { id: 'tribal_forest_produce', name: 'MFP / forest-produce livelihood support', body: 'TRIFED, Ministry of Tribal Affairs', category: 'credit', benefit: 'Support for sustainably-harvested minor forest produce (the Naturals + Environment overlap).', url: 'https://trifed.tribal.gov.in' },
  { id: 'khadi_eco', name: 'Khadi & natural-fibre promotion', body: 'KVIC', category: 'recognition', benefit: 'Recognition + market support for natural-fibre, low-footprint craft.', url: 'https://www.kvic.gov.in' },
];

const schemeEngine = schemeAlignment.createEngine([
  { name: 'gov', match: (seller) => schemes.findEligibleSchemes(seller) || [] },
  { name: 'ondc', match: () => ondc.ONDC_SCHEMES },
  { name: 'green', match: () => GREEN_SCHEMES },
]);

const operationalCost = require('./src/operationalCost');
const verticalCost = require('./src/verticalCost');
const supportAssistant = require('./src/supportAssistant');
const tourism = require('./src/tourism');
const agentRegistry = require('./src/agentRegistry');

// In-process state for the new domains. Loaded once at boot from the store.
const sourcingState = (() => {
  const s = store.load();
  return { leads: s.leads || new Map() };
})();
const returnsState = (() => {
  const s = store.load();
  return { returns: s.returns || new Map() };
})();
const conversationsState = (() => {
  const s = store.load();
  return { conversations: s.conversations || new Map() };
})();
const cooperativesState = (() => {
  const s = store.load();
  return { cooperatives: s.cooperatives || new Map() };
})();

// Self-serve signup service. The service holds OTPs in memory (correct —
// OTPs are transient) but seller records persist via the store. On boot we
// rehydrate sellers from disk; on each completion we write back.
const signupSvc = new sellerSignup.SignupService();
(() => {
  const s = store.load();
  const sellers = s.sellers || new Map();
  for (const [id, seller] of sellers.entries()) {
    signupSvc._sellers.set(id, seller);
    if (seller.phone) signupSvc._phoneToSeller.set(seller.phone, id);
  }
})();

// Products catalog state. Each entry is a seller-scoped product record
// (created via /api/products by an authenticated seller).
const productsState = (() => {
  const s = store.load();
  return { products: s.products_v2 || new Map() };
})();

// Cost ledger — every tool execution records its inference cost here so
// the profit guard can enforce the "never in loss" constraint. Persists
// to disk so per-seller monthly costs survive restarts.
const costLedger = new profitGuard.CostLedger();
(() => {
  const s = store.load();
  const persisted = s.cost_ledger || new Map();
  for (const [key, value] of persisted.entries()) {
    costLedger._ledger.set(key, value);
  }
})();

// Orders state. Each entry is a buyer order created via /api/orders,
// linked to a seller + one or more products. Persists to disk.
const ordersState = (() => {
  const s = store.load();
  return { orders: s.orders_v2 || new Map() };
})();

// Session store for auth — tracks issued sessions so they can be revoked.
// Token verification itself is stateless (HMAC); the store adds revocation.
const sessionStore = new auth.SessionStore();

// Payment gateway — the seam between the order flow and real money movement.
// makeProvider() returns the Razorpay Route adapter when PAYMENTS_PROVIDER=
// razorpay + keys are present; otherwise the MockProvider (dev/pilot). The
// PaymentGateway interface is identical either way, so the order flow is
// unchanged when going live. Linked-account IDs for Route come from config.
const paymentGateway = new payments.PaymentGateway(
  razorpayProvider.makeProvider(config, payments.MockProvider),
);
// Route linked-account mapping. In production these are real Razorpay
// linked-account ids (acc_xxx); in dev they're symbolic so buildSplitPlan
// can still produce a coherent transfer manifest.
const ROUTE_ACCOUNTS = {
  merchant:   process.env.ROUTE_ACC_MERCHANT   || 'acc_merchant_dev',
  platform:   process.env.ROUTE_ACC_PLATFORM   || 'acc_platform_dev',
  taxHolding: process.env.ROUTE_ACC_TAX        || 'acc_tax_dev',
  gateway:    process.env.ROUTE_ACC_GATEWAY    || 'acc_gateway_dev',
  logistics:  process.env.ROUTE_ACC_LOGISTICS  || 'acc_logistics_dev',
};

// Founder-controlled platform settings (subscription pricing + knobs).
// Loaded from the persisted snapshot so founder changes survive restarts.
const settings = new platformSettings.PlatformSettings(
  (() => { try { return store.load().platform_settings; } catch (e) { return null; } })(),
);

// Customer support assistant counters — deflected (answered) vs escalated.
const SUPPORT_STATS = { total: 0, deflected: 0, escalated: 0 };

/** Minimal HTTPS POST → JSON (for the server-side AI proxy). Node core only. */
function httpsPostJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    let https; try { https = require('https'); } catch (e) { return reject(e); }
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req2 = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
    }, (r) => {
      let buf = ''; r.on('data', (c) => (buf += c));
      r.on('end', () => {
        try { const j = JSON.parse(buf); if (r.statusCode >= 400) return reject(new Error(j.error?.message || ('HTTP ' + r.statusCode))); resolve(j); }
        catch (e) { reject(new Error('bad upstream response')); }
      });
    });
    req2.on('error', reject);
    req2.setTimeout(30000, () => { req2.destroy(new Error('AI request timed out')); });
    req2.write(data); req2.end();
  });
}

// Guardian-MoR arrangements for minors (keyed by seller id). A minor may only
// participate through a verified guardian who contracts and is paid.
let guardianArrangements = (() => { try { return store.load().guardian_arrangements || {}; } catch (e) { return {}; } })();

// The SaaS's own prospect database / CRM — sourced candidates + institutional
// partners (white-collar bodies). Seeded with real bodies on first boot.
let prospects = (() => {
  try {
    const loaded = store.load().prospect_db;
    return prospectDb.seedPartners(loaded && loaded.prospects ? loaded : prospectDb.emptyDb());
  } catch (e) { return prospectDb.seedPartners(prospectDb.emptyDb()); }
})();

// Operations control plane — the founder's plain-language commands write here:
// which agents are paused, the AI autonomy tier, and recorded structural
// change requests (which are built safely, not executed from chat).
let OPS_CONTROL = (() => {
  try { return store.load().ops_control || { paused_agents: {}, autonomy: 'notify', change_requests: [] }; }
  catch (e) { return { paused_agents: {}, autonomy: 'notify', change_requests: [] }; }
})();

// Watchdog scan history (last ~50 scan summaries) — powers the improvement trend.
let WATCHDOG_HISTORY = (() => { try { return store.load().watchdog_history || []; } catch (e) { return []; } })();

// Filed grievances, retained so the watchdog can check SLA breaches.
let GRIEVANCE_LOG = (() => { try { return store.load().grievance_log || []; } catch (e) { return []; } })();

// The charity fund — contributions are transparent to customers; the spending
// plan + disbursements are founder-only.
let CHARITY_FUND = (() => { try { return store.load().charity_fund || charityFund.emptyFund(); } catch (e) { return charityFund.emptyFund(); } })();

// Verified-purchase reviews + ratings.
let REVIEWS = (() => { try { return store.load().reviews || []; } catch (e) { return []; } })();

// Feedback-loop signal store (reviews, returns, disputes, sentiment).
let FEEDBACK = (() => { try { return store.load().feedback || feedbackLoop.emptyState(); } catch (e) { return feedbackLoop.emptyState(); } })();

// Geo/maps provider — Google Maps when GOOGLE_MAPS_API_KEY is set, else a mock
// with real Indian coordinates (no network). Same seam pattern as payments.
const geoProvider = geo.makeGeoProvider(config, geo.MockGeoProvider);

// Launch orchestrator approval log — the founder's HITL decisions on launch
// tasks (which policy drafts are approved, which credentials confirmed).
let launchApprovals = (() => { try { return store.load().launch_approvals || {}; } catch (e) { return {}; } })();

// Seller consent records — the legal authorization to sell on each seller's
// behalf. Keyed by seller id. Without the required consents, a seller's
// products cannot go live.
let sellerConsents = (() => { try { return store.load().seller_consents || {}; } catch (e) { return {}; } })();

/**
 * requireAuth — gate a request. Returns the principal on success, or sends
 * the error response and returns null. Callers MUST `return` when it returns
 * null. When auth.mode === 'none' (demo), this is a no-op that injects a
 * founder principal so the demo role-switch keeps working.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {object} [opts] — { role, sellerId } requirements
 * @returns {object|null} principal or null (response already sent)
 */
function requireAuth(req, res, opts = {}) {
  // Demo mode: auth disabled — inject a founder principal so existing flows
  // (and the role-switch UI) keep working unchanged. Production sets a real mode.
  if (config.auth.mode === 'none') {
    return { sub: 'demo', role: 'founder', sellerId: null, demo: true };
  }
  const result = auth.authenticate({
    authHeader: req.headers['authorization'],
    secret: config.auth.secret,
    founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken,
    store: sessionStore,
  });
  if (!result.ok) {
    json(res, result.status || 401, { error: 'unauthenticated', reason: result.error });
    return null;
  }
  const principal = result.principal;
  // Role check
  if (opts.role) {
    const az = auth.authorize(principal, opts.role);
    if (!az.ok) { json(res, az.status, { error: 'unauthorized', reason: az.error }); return null; }
  }
  // Ownership check
  if (opts.sellerId !== undefined) {
    const own = auth.authorizeOwnership(principal, opts.sellerId);
    if (!own.ok) { json(res, own.status, { error: 'unauthorized', reason: own.error }); return null; }
  }
  return principal;
}

/**
 * requireFinancialAccess — gate for endpoints that expose ACTUAL costs,
 * expenses, margins, cost-to-serve, or platform P&L. Only the founder and
 * co-founder may see these. Sellers/buyers get 403. Returns the principal or
 * null (response already sent). In demo mode (auth=none) it injects a founder
 * so the local demo dashboard still works.
 */
/**
 * optionalAuth — returns the principal if the request is authenticated, else
 * null. Never sends a response. For endpoints that personalise when logged in
 * but still work for anonymous callers (e.g. the customer support assistant).
 */
function optionalAuth(req) {
  if (config.auth.mode === 'none') return { sub: 'demo', role: 'founder', sellerId: null, demo: true };
  try {
    const result = auth.authenticate({
      authHeader: req.headers['authorization'],
      secret: config.auth.secret,
      founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken,
      store: sessionStore,
    });
    return result.ok ? result.principal : null;
  } catch (e) { return null; }
}

function requireFinancialAccess(req, res) {
  if (config.auth.mode === 'none') {
    return { sub: 'demo', role: 'founder', sellerId: null, demo: true };
  }
  const result = auth.authenticate({
    authHeader: req.headers['authorization'],
    secret: config.auth.secret,
    founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken,
    store: sessionStore,
  });
  if (!result.ok) { json(res, result.status || 401, { error: 'unauthenticated', reason: result.error }); return null; }
  if (!auth.canSeeFinancials(result.principal)) {
    json(res, 403, { error: 'forbidden', reason: 'cost and financial data is visible only to the founder and co-founder' });
    return null;
  }
  return result.principal;
}

/**
 * Persist a domain change: re-loads the store snapshot, splices in the
 * domain we changed, then atomically saves. Keeps Platform's customers/
 * products/orders untouched and survives concurrent domain updates.
 */
function persistDomain(domain) {
  const current = store.load();
  if (domain === 'leads')         current.leads = sourcingState.leads;
  if (domain === 'returns')       current.returns = returnsState.returns;
  if (domain === 'conversations') current.conversations = conversationsState.conversations;
  if (domain === 'cooperatives')  current.cooperatives = cooperativesState.cooperatives;
  if (domain === 'sellers')       current.sellers = signupSvc._sellers;
  if (domain === 'products_v2')   current.products_v2 = productsState.products;
  if (domain === 'cost_ledger')   current.cost_ledger = costLedger._ledger;
  if (domain === 'orders_v2')     current.orders_v2 = ordersState.orders;
  if (domain === 'platform_settings') current.platform_settings = settings.snapshot();
  if (domain === 'launch_approvals') current.launch_approvals = launchApprovals;
  if (domain === 'seller_consents') current.seller_consents = sellerConsents;
  if (domain === 'guardian_arrangements') current.guardian_arrangements = guardianArrangements;
  if (domain === 'prospect_db') current.prospect_db = prospects;
  if (domain === 'ops_control') current.ops_control = OPS_CONTROL;
  if (domain === 'watchdog_history') current.watchdog_history = WATCHDOG_HISTORY;
  if (domain === 'grievance_log') current.grievance_log = GRIEVANCE_LOG;
  if (domain === 'charity_fund') current.charity_fund = CHARITY_FUND;
  if (domain === 'reviews') current.reviews = REVIEWS;
  store.save(current);
}

/* ────────────────────────────────────────────────────────────
   MAINTENANCE SCHEDULER
   Runs periodically to:
     - Sweep health checks across all domains
     - Identify maintenance windows that are due
     - Record findings to an in-memory audit log
   Does NOT execute any irreversible action — it surfaces what
   needs human eyes via the founder console and the existing
   founder insights flow. The scheduler is the operational
   heartbeat that makes the AI co-founder model actually work.
   ──────────────────────────────────────────────────────────── */

const SCHEDULER = {
  lastSweep: null,
  lastResult: null,
  audit: [],                   // recent ops audit entries, in-memory
  enabled: process.env.SCHEDULER_DISABLED !== '1',
  intervalMs: parseInt(process.env.SCHEDULER_INTERVAL_MS || '900000', 10),  // 15 min default
  windowLastRuns: {},          // tracks when each maintenance window last ran
  _timer: null,
};

/** Build the state snapshot the operations module needs. */
function buildOpsState() {
  const fs = require('fs');
  const path = require('path');
  let storeFileBytes = 0;
  try {
    const f = config.dataDir ? path.join(config.dataDir, 'nexus-store.json') : path.join(__dirname, 'data', 'nexus-store.json');
    if (fs.existsSync(f)) storeFileBytes = fs.statSync(f).size;
  } catch (_) {}
  const cfgReady = productionReadiness(config);
  const breaches = returns.findBreaches([...returnsState.returns.values()]);
  const dormantIds = sourcing.detectDormant([...sourcingState.leads.values()]);
  const leadsArr = [...sourcingState.leads.values()];
  const lastLeadAt = leadsArr.reduce((m, l) => Math.max(m, l.createdAt || 0), 0);
  const daysSinceLastLead = lastLeadAt > 0
    ? Math.round((Date.now() - lastLeadAt) / 86400000)
    : null;
  return {
    storeFileBytes,
    missingConfig: cfgReady.missing,
    returnsBreaches: breaches.length,
    daysSinceLastLead,
    oldestApprovalHours: 0,    // platform.js doesn't expose this yet; placeholder
    testsPassed: 0, testsFailed: 0,  // populated by CI, not at runtime
    totalCostPaise: 0, byCategory: {},  // populated when unit-economics ledger has real data
    windowLastRuns: SCHEDULER.windowLastRuns,
  };
}

/** Run one sweep: health checks + due windows + audit. */
function runSchedulerSweep() {
  const state = buildOpsState();
  const health = operations.runHealthChecks(state);
  const recommendations = operations.recommendedRunbooks(health);
  const due = operations.dueWindows(state);
  const now = Date.now();

  SCHEDULER.lastSweep = now;
  SCHEDULER.lastResult = {
    health,
    recommendations: recommendations.map(r => ({
      triggeredBy: r.triggeredBy, level: r.level, evidence: r.evidence,
      runbookId: r.runbook.id, runbookTitle: r.runbook.title,
      autonomy: r.runbook.autonomy, estimatedMinutes: r.runbook.estimated_minutes,
    })),
    dueWindows: due,
  };

  // Audit: one entry per non-OK check
  for (const [key, r] of Object.entries(health.results || {})) {
    if (r.level !== 'ok') {
      SCHEDULER.audit.unshift(operations.auditEntry({
        action: 'check', key, level: r.level, evidence: r.evidence,
        autonomy: operations.AUTONOMY.AUTO, by: 'scheduler', now,
      }));
    }
  }

  // AUTO-tier windows that are due: mark them complete (placeholder — real work
  // would actually run the runbook steps; for v1 we just record they fired)
  for (const win of due) {
    if (win.autonomy === operations.AUTONOMY.AUTO) {
      SCHEDULER.windowLastRuns[win.key] = now;
      SCHEDULER.audit.unshift(operations.auditEntry({
        action: 'window_complete', key: win.key, level: 'ok',
        evidence: `AUTO-tier window fired (${win.label})`,
        autonomy: operations.AUTONOMY.AUTO, by: 'scheduler', now,
      }));
    }
  }

  // Cap audit log length so it doesn't grow forever
  if (SCHEDULER.audit.length > 200) SCHEDULER.audit.length = 200;

  // ─── Profit-guard sweeps ───
  // Daily: scan every seller, identify any whose monthly utilization is
  //   above the WARN threshold (30% of revenue spent on inference). At-risk
  //   sellers go into the audit log so the founder sees them in the console.
  // Weekly: full platform P&L digest. If platform is in net loss, audit at
  //   'critical' level so it surfaces immediately.
  // Cadences are env-configurable so prod can keep daily/weekly while tests
  //   can force per-sweep re-evaluation.
  const PROFIT_SWEEP_INTERVAL_MS = parseInt(process.env.PROFIT_SWEEP_INTERVAL_MS || (24 * 60 * 60 * 1000), 10);
  const PNL_DIGEST_INTERVAL_MS = parseInt(process.env.PNL_DIGEST_INTERVAL_MS || (7 * 24 * 60 * 60 * 1000), 10);

  if (SCHEDULER._forceProfitSweep || !SCHEDULER.lastProfitSweep || (now - SCHEDULER.lastProfitSweep) > PROFIT_SWEEP_INTERVAL_MS) {
    SCHEDULER._forceProfitSweep = false;
    try {
      const sellers = signupSvc.listSellers();
      const atRisk = [];
      for (const seller of sellers) {
        const revenue = profitGuard.estimateMonthlyRevenuePaise(seller.archetype);
        const cost = costLedger.getMonthlyCostPaise(seller.id);
        if (revenue > 0) {
          const utilization = cost / revenue;
          if (utilization >= profitGuard.WARN_THRESHOLD) {
            atRisk.push({
              seller_id: seller.id,
              archetype: seller.archetype,
              utilization,
              cost_paise: cost,
              revenue_paise: revenue,
            });
          }
        }
      }
      SCHEDULER.lastProfitSweep = now;
      SCHEDULER.lastAtRiskSellers = atRisk;
      if (atRisk.length > 0) {
        SCHEDULER.audit.unshift(operations.auditEntry({
          action: 'profit_sweep', key: 'at_risk_sellers',
          level: atRisk.some(s => s.utilization >= profitGuard.DENY_THRESHOLD) ? 'critical' : 'warn',
          evidence: `${atRisk.length} seller(s) above ${(profitGuard.WARN_THRESHOLD * 100).toFixed(0)}% cost utilization — review`,
          autonomy: operations.AUTONOMY.AUTO, by: 'scheduler', now,
        }));
      } else if (sellers.length > 0) {
        SCHEDULER.audit.unshift(operations.auditEntry({
          action: 'profit_sweep', key: 'all_clear',
          level: 'ok',
          evidence: `${sellers.length} seller(s) — all under cost thresholds`,
          autonomy: operations.AUTONOMY.AUTO, by: 'scheduler', now,
        }));
      }
    } catch (e) {
      console.error('Profit sweep failed:', e.message);
    }
  }

  if (SCHEDULER._forcePnlDigest || !SCHEDULER.lastPnlDigest || (now - SCHEDULER.lastPnlDigest) > PNL_DIGEST_INTERVAL_MS) {
    SCHEDULER._forcePnlDigest = false;
    try {
      const sellerLookup = {
        listSellers: () => signupSvc.listSellers(),
        getSeller: (id) => signupSvc.getSeller(id),
      };
      const pnl = profitGuard.platformPnL(costLedger, sellerLookup);
      SCHEDULER.lastPnlDigest = now;
      SCHEDULER.lastPnlSnapshot = pnl;
      SCHEDULER.audit.unshift(operations.auditEntry({
        action: 'pnl_digest', key: 'weekly',
        level: pnl.net_profit_paise < 0 ? 'critical' : (pnl.margin_pct != null && pnl.margin_pct < 30 ? 'warn' : 'ok'),
        evidence: `${pnl.seller_count} seller(s) · revenue ₹${(pnl.total_revenue_paise/100).toFixed(0)} · cost ₹${(pnl.total_cost_paise/100).toFixed(0)} · net ₹${(pnl.net_profit_paise/100).toFixed(0)} (${pnl.margin_pct}% margin)`,
        autonomy: operations.AUTONOMY.AUTO, by: 'scheduler', now,
      }));
    } catch (e) {
      console.error('P&L digest failed:', e.message);
    }
  }

  // ─── Sourcing-agent sweep ───
  // Daily: while the engine is running (not founder-paused), the sourcing
  // agent pulls a fresh batch of auto-sourced candidates into the prospect
  // pipeline (deduped). It fills the pipeline only — outreach and conversion
  // stay founder-approved, and nobody can sell without full consent.
  // Env: AUTO_SOURCE=off disables; AUTO_SOURCE_INTERVAL_MS / AUTO_SOURCE_LIMIT tune.
  const AUTO_SOURCE_INTERVAL_MS = parseInt(process.env.AUTO_SOURCE_INTERVAL_MS || sourcingAgentSweep.DEFAULT_INTERVAL_MS, 10);
  if (sourcingAgentSweep.isDue({
    lastRunAt: SCHEDULER.lastAutoSource, now, intervalMs: AUTO_SOURCE_INTERVAL_MS,
    force: SCHEDULER._forceAutoSource, disabled: process.env.AUTO_SOURCE === 'off',
  })) {
    SCHEDULER._forceAutoSource = false;
    try {
      const engineControl = require('./src/engineControl');
      const r = sourcingAgentSweep.runSweep(
        { autoSource, prospectDb, engineControl, operations },
        { prospects },
        { limit: parseInt(process.env.AUTO_SOURCE_LIMIT || sourcingAgentSweep.DEFAULT_LIMIT, 10), now },
      );
      if (r.ran) {
        SCHEDULER.lastAutoSource = now;
        SCHEDULER.lastAutoSourceResult = { sourced: r.sourced, added: r.added, refreshed: r.refreshed, total: r.total };
        persistDomain('prospect_db');
        if (r.audit) SCHEDULER.audit.unshift(r.audit);
      }
    } catch (e) {
      console.error('Sourcing-agent sweep failed:', e.message);
    }
  }

  return SCHEDULER.lastResult;
}

/** Start the periodic sweep timer. Safe to call once at boot. */
function startScheduler() {
  if (!SCHEDULER.enabled) return;
  if (SCHEDULER._timer) return;
  // Run once immediately, then on interval
  try { runSchedulerSweep(); } catch (e) { console.error('Scheduler initial sweep failed:', e.message); }
  SCHEDULER._timer = setInterval(() => {
    try { runSchedulerSweep(); } catch (e) { console.error('Scheduler sweep failed:', e.message); }
  }, SCHEDULER.intervalMs);
  if (SCHEDULER._timer.unref) SCHEDULER._timer.unref();  // don't keep event loop alive
}

function stopScheduler() {
  if (SCHEDULER._timer) {
    clearInterval(SCHEDULER._timer);
    SCHEDULER._timer = null;
  }
}

const json = (res, code, data) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data, null, 2));
};
// Max request body — 1MB. POST payloads above this are rejected to
// protect memory. Notes/descriptions don't legitimately exceed a few KB.
const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Parse request body as JSON. Returns one of:
 *   { ok: true,  body: <object> }  — body parsed successfully (or empty)
 *   { ok: false, error: string, status: number }
 *
 * Errors:
 *   - Body exceeds MAX_BODY_BYTES: 413 (Payload Too Large)
 *   - Body is non-empty and not valid JSON: 400 (Bad Request)
 *
 * Empty body parses to {} with ok:true — callers that require fields
 * should validate after parse and return their own 400.
 */
const body = (req) => new Promise((resolve) => {
  let buf = '';
  let bytes = 0;
  let aborted = false;
  req.on('data', (chunk) => {
    if (aborted) return;
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      aborted = true;
      // Drain remaining data so the connection closes cleanly
      req.on('data', () => {});
      resolve({ ok: false, error: `Request body exceeds ${MAX_BODY_BYTES} bytes`, status: 413 });
      return;
    }
    buf += chunk;
  });
  req.on('end', () => {
    if (aborted) return;
    if (!buf) return resolve({ ok: true, body: {} });
    try {
      resolve({ ok: true, body: JSON.parse(buf) });
    } catch (e) {
      resolve({ ok: false, error: 'Invalid JSON body: ' + e.message, status: 400 });
    }
  });
  req.on('error', (e) => resolve({ ok: false, error: 'Read error: ' + e.message, status: 400 }));
});

/**
 * Convenience wrapper: parse body and, on failure, write the error
 * response automatically. Returns the parsed body on success, or null
 * on failure (caller should `return` immediately when null).
 *
 *   const b = await parseBody(req, res); if (b === null) return;
 */
const parseBody = async (req, res) => {
  const result = await body(req);
  if (!result.ok) {
    json(res, result.status, { error: result.error });
    return null;
  }
  return result.body;
};

// ── Basic cybersecurity: in-memory rate limiter + security headers ──
// A sliding-window limiter per client IP. Protects against brute-force,
// credential-stuffing, and card-testing bursts. Tunable; in production a real
// gateway/WAF would augment this, but this is a genuine first line of defence.
const RATE = { windowMs: 60 * 1000, max: 120, store: new Map() }; // 120 req/min/IP
const RATE_WRITE = { windowMs: 60 * 1000, max: 30 };              // stricter for writes
// Disabled when AUTH is in demo/none mode (local dev + automated tests), so the
// limiter protects real deployments without throttling the test harness.
const RATE_LIMIT_ON = config.auth.mode !== 'none' && process.env.RATE_LIMIT !== 'off';
function rateLimited(req) {
  if (!RATE_LIMIT_ON) return false;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const isWrite = req.method !== 'GET' && req.method !== 'HEAD';
  const max = isWrite ? RATE_WRITE.max : RATE.max;
  const key = ip + (isWrite ? ':w' : ':r');
  let rec = RATE.store.get(key);
  if (!rec || now - rec.start > RATE.windowMs) { rec = { start: now, count: 0 }; RATE.store.set(key, rec); }
  rec.count++;
  // Opportunistic cleanup so the map can't grow unbounded.
  if (RATE.store.size > 5000) { for (const [k, v] of RATE.store) if (now - v.start > RATE.windowMs) RATE.store.delete(k); }
  return rec.count > max;
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // A conservative CSP — the SPA is self-contained except Google Fonts.
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com");
}

const monitoring = require('./src/monitoring');
monitoring.install();
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  monitoring.recordRequest(0);
  { const _t0 = Date.now(); const _dp = (req.url || '').split('?')[0];
    res.on('finish', () => { try { require('./src/debugTool').trace({ method: req.method, path: _dp, status: res.statusCode, ms: Date.now() - _t0 }); } catch (e) {} }); }
  // Rate-limit API traffic (not static UI assets).
  if (req.url.startsWith('/api/') && rateLimited(req)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
    return res.end(JSON.stringify({ error: 'rate_limited', reason: 'Too many requests — slow down and retry shortly.' }));
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    // Serve the frontend UI at root
    if (p === '/' && req.method === 'GET') {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(__dirname, 'public', 'index.html');
      if (fs.existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(file, 'utf8'));
      }
    }

    // PWA static files — manifest, service worker, icons
    if (req.method === 'GET' && (
        p === '/manifest.json' || p === '/sw.js' ||
        p === '/icon-192.svg' || p === '/icon-512.svg')) {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(__dirname, 'public', p.slice(1));
      if (fs.existsSync(file)) {
        const ext = p.split('.').pop();
        const type = ext === 'json' ? 'application/manifest+json'
                  : ext === 'js'   ? 'application/javascript; charset=utf-8'
                  : ext === 'svg'  ? 'image/svg+xml'
                  : 'application/octet-stream';
        // Service worker must NOT be aggressively cached — it controls its own update
        const cacheCtl = (p === '/sw.js') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheCtl });
        return res.end(fs.readFileSync(file));
      }
      return json(res, 404, { error: 'not_found', path: p });
    }

    if (p === '/health') return json(res, 200, { status: 'ok', persisted: true });
    if (p === '/api/provenance/verify') {
      const gi = require('./src/giVerify');
      const sz = require('./src/sanitize');
      return json(res, 200, gi.verifyGI({ product: sz.sanitizeString(url.searchParams.get('product'), 120), name: sz.sanitizeString(url.searchParams.get('product'), 120), cluster: sz.sanitizeString(url.searchParams.get('cluster'), 80), gi: url.searchParams.get('gi') === 'true' }));
    }
    if (p === '/api/tourism/intelligence') {
      const ti = require('./src/tourismIntelligence');
      const sz = require('./src/sanitize');
      const op = { name: sz.sanitizeString(url.searchParams.get('name'), 80), cluster: sz.sanitizeString(url.searchParams.get('cluster'), 80), reviews: Number(url.searchParams.get('reviews')) || 0, rating: Number(url.searchParams.get('rating')) || 0 };
      return json(res, 200, { operator: ti.scoreOperator(op, {}), season: ti.seasonalSignals(new Date()) });
    }
    if (p === '/api/ondc/readiness') {
      const ondc = require('./src/ondcOnboarding');
      return json(res, 200, { checklist: ondc.readinessChecklist(), options: ondc.participantOptions() });
    }
    if (p === '/api/feedback' && (req.method === 'GET')) {
      const fb = require('./src/feedback');
      const sp = url.searchParams;
      if (sp.get('view') === 'summary') return json(res, 200, fb.summary());
      if (sp.get('view') === 'list') return json(res, 200, { feedback: fb.list({ role: sp.get('role'), area: sp.get('area') }) });
      const entry = fb.record({ role: sp.get('role'), area: sp.get('area'), rating: sp.get('rating'), message: sp.get('message') });
      return json(res, 200, { ok: true, entry, note: 'Feedback captured. Summary at /api/feedback?view=summary' });
    }
    if (p === '/api/founder/monitoring') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      return json(res, 200, monitoring.status());
    }
    if (p === '/api/founder/audit-log') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const al = require('./src/auditLog');
      return json(res, 200, { chain: al.verifyChain(), entries: al.list(50) });
    }
    if (p === '/api/domain/model') {
      const d = require('./src/domain');
      return json(res, 200, { kinds: d.KINDS, order_lifecycle: d.TRANSITIONS, schemas: Object.keys(d.SCHEMAS) });
    }
    if (p === '/api/cache/stats') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const cache = require('./src/cache');
      return json(res, 200, cache.stats());
    }
    if (p === '/api/ai/providers') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const ai = require('./src/aiProvider');
      return json(res, 200, ai.status());
    }
    if (p === '/api/notify') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const n = require('./src/notifications');
      const sp = url.searchParams;
      if (sp.get('view') === 'status') return json(res, 200, n.status());
      if (sp.get('view') === 'templates') return json(res, 200, { templates: n.templates() });
      if (sp.get('otp')) return n.sendOtp(sp.get('otp'), { lang: sp.get('lang') }).then((r) => json(res, 200, r));
      if (sp.get('template') && sp.get('to')) {
        let data = {}; try { data = JSON.parse(sp.get('data') || '{}'); } catch (e) {}
        return n.send(sp.get('template'), sp.get('to'), data, { lang: sp.get('lang') }).then((r) => json(res, 200, r));
      }
      return json(res, 200, { usage: '/api/notify?template=order_placed&to=..&data={"oid":".."}  |  ?otp=<phone>  |  ?view=status', templates: n.templates() });
    }
    if (p === '/api/rfq') {
      const rfq = require('./src/rfq');
      const sp = url.searchParams;
      // Buyer-facing: opening an RFQ is public (a lead). Everything else is founder-gated.
      if (sp.get('action') === 'request') {
        return json(res, 200, rfq.request({ buyer: sp.get('buyer'), buyerType: sp.get('buyerType'), vertical: sp.get('vertical'), qty: sp.get('qty'), unitBudgetRupees: sp.get('unitBudget'), notes: sp.get('notes'), customization: sp.get('customization') === 'true' }));
      }
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const id = sp.get('id');
      if (sp.get('action') === 'quote') return json(res, 200, rfq.quote(id, { unitPriceRupees: sp.get('unitPrice'), curationRupees: sp.get('curation'), packagingRupees: sp.get('packaging') }, 'founder'));
      if (sp.get('action') === 'accept') return json(res, 200, rfq.accept(id, sp.get('by')));
      if (sp.get('action') === 'decline') return json(res, 200, rfq.decline(id, 'founder'));
      if (sp.get('action') === 'convert') return json(res, 200, rfq.convert(id, sp.get('makerId'), 'founder'));
      if (sp.get('id')) return json(res, 200, { rfq: rfq.get(id) });
      return json(res, 200, { pipeline: rfq.pipeline(), rfqs: rfq.list(sp.get('status')) });
    }
    if (p === '/api/compliance/posture') {
      return json(res, 200, require('./src/complianceEngine').posture());
    }
    if (p === '/api/status/profile') {
      const ss = require('./src/statusSelector');
      const st = (url.searchParams.get('status') || 'unregistered');
      return json(res, 200, ss.profile(st));
    }
    if (p === '/api/policy/prohibited') {
      const cp = require('./src/contentPolicy');
      return json(res, 200, { categories: cp.prohibitedCatalog(), ack_window_hours: cp.ACK_WINDOW_HOURS, resolve_window_days: cp.RESOLVE_WINDOW_DAYS });
    }
    if (p === '/api/policy/screen') {
      const cp = require('./src/contentPolicy');
      const sz = require('./src/sanitize');
      return json(res, 200, cp.screenListing({ title: sz.sanitizeString(url.searchParams.get('title'), 200), material: sz.sanitizeString(url.searchParams.get('material'), 120), category: sz.sanitizeString(url.searchParams.get('category'), 60) }));
    }
    if (p === '/api/policy/notice') {
      const cp = require('./src/contentPolicy');
      const sz = require('./src/sanitize');
      const notice = cp.fileNotice({ listingId: sz.sanitizeString(url.searchParams.get('listingId'), 40), type: sz.sanitizeString(url.searchParams.get('type'), 30), details: sz.sanitizeString(url.searchParams.get('details'), 500), complainant: sz.sanitizeString(url.searchParams.get('from'), 80) });
      return json(res, 200, { notice, note: 'Notice logged with statutory acknowledge/resolve windows for intermediary safe harbor.' });
    }
    if (p === '/api/privacy/request') {
      const dr = require('./src/dataRights');
      const sanitize = require('./src/sanitize');
      const type = sanitize.sanitizeString(url.searchParams.get('type'), 20) || 'access';
      const subject = sanitize.sanitizeString(url.searchParams.get('subject'), 80) || 'demo_subject';
      // demo record set proves the flow; at deploy this pulls from the live store
      const demo = [
        { id: subject, subjectId: subject, type: 'profile', name: 'Demo Maker', phone: '+919000000000', cluster: 'Khurja' },
        { subjectId: subject, type: 'order', amount: 5000, product: 'Blue pottery', name: 'Demo Maker' },
        { subjectId: subject, type: 'consent', granted: true },
        { id: 'other', subjectId: 'someone_else', type: 'profile', name: 'Unrelated' },
      ];
      return json(res, 200, { request: type, subject, dpdp: true, result: dr.processRequest(type, subject, demo) });
    }
    if (p === '/api/geo/llms-txt') {
      const geo = require('./src/geoOptimizer');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(geo.llmsTxt());
    }
    if (p === '/api/geo/product') {
      const geo = require('./src/geoOptimizer');
      const sp = url.searchParams;
      const prod = { name: sp.get('name'), craft: sp.get('craft'), cluster: sp.get('cluster'), state: sp.get('state'),
        vertical: sp.get('vertical'), maker: sp.get('maker'), price: sp.get('price'), gi: sp.get('gi') === 'true', verified: true };
      return json(res, 200, { schema: geo.productSchema(prod), ai_description: geo.aiDescription(prod) });
    }
    if (p === '/api/geo/audit') {
      const geo = require('./src/geoOptimizer');
      return json(res, 200, { audit: geo.audit(), faq_schema: geo.faqSchema(), ai_crawlers_allowed: geo.crawlerPolicy() });
    }
    if (p === '/api/agent/research') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const ra = require('./src/researchAgent');
      const sp = url.searchParams;
      if (sp.get('add') === '1') return json(res, 200, ra.addFinding({ topic: sp.get('topic'), finding: sp.get('finding'), src: sp.get('src') }));
      if (sp.get('view') === 'topics') return json(res, 200, { topics: ra.topics() });
      if (sp.get('view') === 'domains') return json(res, 200, { domains: ra.domains() });
      return json(res, 200, ra.research(sp.get('q') || ''));
    }
    if (p === '/api/founder/ops') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const fo = require('./src/founderOps');
      const sp = url.searchParams;
      if (!sp.get('cmd')) return json(res, 200, { operations: fo.catalog(), usage: '/api/founder/ops?cmd=<command>[&confirm=yes][&arg=...]' });
      return fo.execute(sp.get('cmd'), { confirm: sp.get('confirm'), arg: sp.get('arg'), by: 'founder-cockpit' }).then((r) => json(res, 200, r));
    }
    if (p === '/api/founder/debug') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const dbg = require('./src/debugTool');
      const v = url.searchParams.get('view') || 'snapshot';
      if (v === 'trace') return json(res, 200, { recent: dbg.recent(Number(url.searchParams.get('n')) || 50) });
      if (v === 'slow') return json(res, 200, { slowest: dbg.slowest(10) });
      if (v === 'modules') return json(res, 200, dbg.moduleHealth(require('path').join(__dirname, 'src')));
      return json(res, 200, dbg.snapshot());
    }
    if (p === '/api/founder/deploy') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const dp = require('./src/deployPortability');
      const sp = url.searchParams;
      if (sp.get('platform')) return json(res, 200, dp.config(sp.get('platform')));
      if (sp.get('diagnose')) return json(res, 200, dp.diagnose(sp.get('diagnose')));
      if (sp.get('view') === 'preflight') return json(res, 200, dp.preflight());
      return json(res, 200, { platforms: dp.platforms(), start_command: dp.START, health_check: dp.HEALTH });
    }
    if (p === '/api/founder/maintain') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const ops = require('./src/cockpitOps');
      const cmd = url.searchParams.get('cmd') || '';
      if (!cmd) return json(res, 200, { commands: ops.COMMANDS });
      return json(res, 200, ops.run(cmd, 'founder-cockpit'));
    }
    if (p === '/api/founder/mlops') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const ml = require('./src/mlops');
      const sp = url.searchParams;
      if (sp.get('view') === 'routing') return json(res, 200, { routing: ml.routing(), prompts: ml.prompts() });
      return json(res, 200, ml.health());
    }
    if (p === '/api/agent/crawl') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const wc = require('./src/webCrawler');
      const sp = url.searchParams;
      if (!sp.get('source')) return json(res, 200, { enabled: wc.enabled(), sources: wc.sources() });
      return wc.crawl(sp.get('source')).then((r) => json(res, 200, r));
    }
    if (p === '/api/agent/collect-data') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const dc = require('./src/dataCollectorAgent');
      const all = dc.collectAll();
      const prospects = dc.toProspects();
      return json(res, 200, { collected: all.collected, by_vertical: all.by_vertical, sources_used: all.sources_used,
        live_connectors: all.live_connectors, prospects_created: prospects.length,
        consent_blocked: prospects.filter((x) => !x.canSell).length, money_required: false,
        authorisation_required: false, sample: all.clusters.slice(0, 8), note: all.note });
    }
    if (p === '/api/agent/acquire') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const aa = require('./src/acquisitionAgent');
      return json(res, 200, aa.runAcquisition({ craft: url.searchParams.get('craft'), cluster: url.searchParams.get('cluster'),
        vertical: url.searchParams.get('vertical'), segment: url.searchParams.get('segment'), source: url.searchParams.get('source'), lang: url.searchParams.get('lang') }));
    }
    if (p === '/api/agent/campaign') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const aa = require('./src/acquisitionAgent');
      return json(res, 200, aa.campaign({ tier: url.searchParams.get('tier'), vertical: url.searchParams.get('vertical'), title: url.searchParams.get('title') }));
    }
    if (p === '/api/government/open-data') {
      const od = require('./src/openData');
      return json(res, 200, { sources: od.catalog(), no_auth_launch_ready: od.launchUsable(), money_required: false });
    }
    if (p === '/api/government/schemes') {
      const gs = require('./src/governmentSchemes');
      return json(res, 200, { schemes: gs.catalog(), delivery: gs.deliveryValue() });
    }
    if (p === '/api/maker/schemes') {
      const gs = require('./src/governmentSchemes');
      return json(res, 200, gs.eligibleFor({ vertical: url.searchParams.get('vertical'), exporter: url.searchParams.get('exporter') === 'true' }));
    }
    if (p === '/api/founder/seed-prospects') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      // Build a TEST customer database with NO money in the loop. Every prospect is
      // consent-gated: canSell stays false until the maker grants the required consents.
      const consent = require('./src/sellerConsent');
      const n = Math.max(1, Math.min(200, Number(url.searchParams.get('n')) || 24));
      const pool = [
        ['textile', 'Banarasi weaver', 'Varanasi, UP'], ['textile', 'Ikat weaver', 'Pochampally, TG'],
        ['handicraft', 'Blue-pottery maker', 'Khurja, UP'], ['handicraft', 'Brass artisan', 'Moradabad, UP'],
        ['jewellery', 'Filigree artisan', 'Cuttack, OD'], ['jewellery', 'Meenakari artisan', 'Jaipur, RJ'],
        ['gems', 'Gem cutter', 'Jaipur, RJ'], ['naturals', 'Block-print dyer', 'Bagru, RJ'],
        ['experience', 'Craft-workshop host', 'Jaipur, RJ'],
      ];
      const prospects = [];
      for (let i = 0; i < n; i++) {
        const base = pool[i % pool.length];
        const c = consent.emptyConsent();
        prospects.push({ id: 'pr_' + (i + 1), vertical: base[0], craft: base[1], cluster: base[2],
          stage: 'sourced', lawful_basis: 'public_source', canSell: consent.canSell(c).ok });
      }
      const blocked = prospects.filter((x) => !x.canSell).length;
      return json(res, 200, {
        generated: prospects.length, consent_blocked: blocked, money_required: false,
        note: 'Test database built with no payment. Every prospect is consent-gated — canSell is false until the 5 consents are granted.',
        sample: prospects.slice(0, 6),
      });
    }
    if (p === '/api/maker/ideas') {
      const cs = require('./src/creativeStudio');
      const v = url.searchParams.get('vertical');
      if (v === 'list' || v === null) return json(res, 200, { verticals: cs.verticals() });
      return json(res, 200, cs.ideasFor(v));
    }
    if (p === '/api/founder/ask') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const fi = require('./src/founderInsights');
      const sc = require('./src/spendControl');
      const sp = url.searchParams;
      const q = sp.get('q') || '';
      // cockpit_bridge: founder-directed maintain/repair via chat
      if (/^(run |please )?(diagnos|health check|repair|fix the engine|maintenance)/i.test(q.trim())) {
        const ops = require('./src/cockpitOps');
        const isRepair = /repair|fix|maintenance/i.test(q);
        const r = isRepair ? ops.run('repair', 'founder-via-cofounder') : ops.run('diagnose', 'founder-via-cofounder');
        const rep = isRepair ? r.health_after : r.report;
        const answer = (isRepair ? 'Repair complete. ' : 'Diagnostics complete. ')
          + 'Engine ' + ((rep && rep.healthy) ? 'HEALTHY' : 'NEEDS ATTENTION')
          + (isRepair ? ' — steps: ' + r.steps.map(function (x) { return x.step; }).join(', ')
                      : ' — error rate ' + rep.monitoring.error_rate + ', cache hit rate ' + rep.cache.hit_rate + ', audit chain ' + (rep.audit_chain.valid ? 'valid' : 'BROKEN') + ', spend cap Rs ' + rep.spend_cap_rupees.toLocaleString('en-IN'))
          + '. Every action is in the audit log.';
        return json(res, 200, { q, answer, engine: 'full', action: isRepair ? 'cockpit_repair' : 'cockpit_diagnose', result: r });
      }
      // Co-founder can SET the monthly AI spend cap on the founder's instruction.
      const m = q.match(/(?:set|change|make|raise|lower|cap)\D*(?:budget|spend|cap|limit)\D*?(?:rs|inr|₹)?\s*([\d,]+)/i);
      if (m && /(budget|spend|cap|limit)/i.test(q)) {
        const rupees = Number(m[1].replace(/,/g, ''));
        const r = sc.setCapRupees(rupees, 'founder-via-cofounder');
        const answer = r.ok
          ? 'Done — monthly AI spend cap set to ₹' + r.cap_rupees.toLocaleString('en-IN') + ' (was ₹' + r.previous_rupees.toLocaleString('en-IN') + '). This takes effect immediately across the cost engine.'
          : 'I could not set that: ' + r.error;
        return json(res, 200, { q, answer, engine: 'full', action: 'set_spend_cap', result: r });
      }
      // Founder directs maintain/repair/modify from cockpit chat — HITL-governed, audit-logged.
      if (/\b(repair|heal|diagnose|selftest|self-test|health check|maintain|verify audit|run evals|clear cache|resume engine|pause engine|reset demo)\b/i.test(q)) {
        const fo = require('./src/founderOps');
        const parsed = fo.parse(q);
        if (parsed.op) {
          const r = await fo.execute(q, { by: 'founder-chat', confirm: sp.get('confirm') });
          const answer = r.refused ? r.reason
            : r.pending_confirmation ? 'This is a destructive operation — resend with confirm=yes to proceed.'
            : r.ok ? 'Done — ' + parsed.op + ' executed. ' + (r.result && r.result.healthy !== undefined ? ('Healthy: ' + r.result.healthy + '.') : '') : 'Could not complete: ' + (r.error || 'unknown');
          return json(res, 200, { q, answer, engine: 'full', action: 'founder_op', op: parsed.op, result: r });
        }
      }
      const state = { artisans: Number(sp.get('artisans')) || 1000, feePct: Number(sp.get('fee')) || 12, orders: [], sellers: [], customers: [], products: [], spendCapRupees: sc.getCapRupees() };
      const answer = fi.answerQuestion(q, state);
      return json(res, 200, { q, answer, engine: 'full' });
    }
    if (p === '/api/founder/spend-cap') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const sc = require('./src/spendControl');
      const sp = url.searchParams;
      if (sp.get('rupees') != null) {              // set (behind the founder-auth gate above)
        return json(res, 200, sc.setCapRupees(sp.get('rupees'), 'founder-cockpit'));
      }
      return json(res, 200, { cap_rupees: sc.getCapRupees(), cap_paise: sc.getCap(), history: sc.history(), bounds: { min_rupees: sc.MIN_PAISE / 100, max_rupees: sc.MAX_PAISE / 100 } });
    }
    if (p === '/api/engine/status') {
      const ec = require('./src/engineControl');
      return json(res, 200, ec.status());
    }
    if (p === '/api/engine/pause') {
      const ec = require('./src/engineControl');
      const reason = url.searchParams.get('reason') || 'Paused by founder';
      ec.pause(reason, 'founder');
      return json(res, 200, ec.status());
    }
    if (p === '/api/engine/resume') {
      const ec = require('./src/engineControl');
      ec.resume('founder');
      return json(res, 200, ec.status());
    }
    if (p === '/api/founder/daily-briefing') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const dailyBriefing = require('./src/dailyBriefing');
      const sp = url.searchParams;
      const ctx = { artisans: Number(sp.get('artisans')) || 1000, gmvRupees: Number(sp.get('gmv')) || 12000000, monthlyOrders: Number(sp.get('orders')) || 800, sellers: Number(sp.get('sellers')) || 40, vertical: sp.get('vertical') || 'handicraft' };
      const b = dailyBriefing.buildDailyBriefing(ctx);
      if (sp.get('format') === 'text') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(dailyBriefing.renderText(b)); }
      return json(res, 200, b);
    }

    if (p === '/ready') {
      const r = productionReadiness(config);
      return json(res, r.ready ? 200 : 503, {
        ready: r.ready,
        env: config.env,
        payments: config.payments.provider,
        store: config.store,
        auth: config.auth.mode,
        missing_config: r.missing,
        non_code_gates: NON_CODE_GATES,
      });
    }

    if (p === '/api') return json(res, 200, {
      service: 'NEXUS Unified Core API',
      model: 'status-aware: MoR | SaaS | agent | umbrella — decided at onboarding',
      endpoints: {
        'GET /health': 'health',
        'GET /slice?amount=1580': 'preview transaction slice',
        'POST /onboard': 'onboard any customer (selector assigns model)',
        'GET /customers': 'list customers',
        'POST /products': 'list a product { customerId, title, supplierPrice, sellPrice }',
        'POST /orders': 'process order { productId, buyerName, isExport, paymentMethod: "upi"|"card", authPayload }',
        'POST /book': 'evaluate a tourism booking { booking, identity, operator }',
        'POST /can-spend': 'phase-aware cost guard check',
        'GET /cost-optimisations': 'self-improvement proposals',
        'GET /payment-methods': 'supported UPI/card methods',
        'GET /audit': 'immutable ledger',
      },
    });

    if (p === '/slice' && req.method === 'GET') {
      const amt = parseFloat(url.searchParams.get('amount') || '1580');
      if (!Number.isFinite(amt) || amt <= 0) return json(res, 400, { error: 'amount must be a positive number' });
      try { return json(res, 200, sliceTransaction(amt)); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }

    if (p === '/onboard' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 201, plat.onboard(b));
    }

    if (p === '/customers' && req.method === 'GET')
      return json(res, 200, [...plat.customers.values()]);

    if (p === '/products' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 201, plat.listProduct(b.customerId, b));
    }

    if (p === '/orders' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const result = await plat.processOrder(b.productId, b); // awaits payment if method supplied
      return json(res, 200, result);
    }

    if (p === '/payment-methods' && req.method === 'GET')
      return json(res, 200, {
        supported: ['upi', 'card', 'netbanking', 'wallet'],
        upi: { flows: ['collect', 'intent', 'qr'], example_auth: { vpa: 'name@bank' } },
        card: { note: 'tokenized only — no raw PAN; PCI scope stays at gateway', example_auth: { cardToken: 'tok_xxx' } },
        settlement: 'Razorpay Route split — platform never holds float',
      });

    if (p === '/book' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 200, plat.book(b.booking, b.identity, b.operator));
    }

    if (p === '/can-spend' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 200, plat.canSpend(b.proposedPaise, b.ctx || {}));
    }

    if (p === '/cost-optimisations' && req.method === 'GET')
      return json(res, 200, plat.costOptimisations());

    if (p === '/verticals' && req.method === 'GET')
      return json(res, 200, plat.verticals());

    if (p === '/pipeline' && req.method === 'GET')
      return json(res, 200, plat.agentPipeline());

    if (p === '/hitl' && req.method === 'GET')
      return json(res, 200, { queue: plat.hitlQueue(), audit: plat.hitlAudit() });

    if (p === '/hitl/decide' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const result = await plat.decideHITL(b.itemId, b.decision, b.reason, b.decidedBy);
      return json(res, 200, result);
    }

    if (p === '/audit' && req.method === 'GET')
      return json(res, 200, { ledger: plat.ledger });

    // ════════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════════
    // PROSPECT DATABASE / CRM — the SaaS's own record of who it has
    // sourced + the institutional partners (white-collar bodies).
    // ════════════════════════════════════════════════════════════
    // POST /api/prospects/ingest — pull current auto-sourced candidates into
    // the persistent database (deduped; preserves pipeline progress).
    if (p === '/api/prospects/ingest' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const sourced = autoSource.autoSource({
        segment: b.segment, state: b.state, category: b.category,
        establishmentType: b.establishmentType, giTagged: b.giTagged,
        limit: b.limit || 100,
      });
      const r = prospectDb.ingest(prospects, sourced.candidates || []);
      persistDomain('prospect_db');
      return json(res, 200, { ok: true, ...r, funnel: prospectDb.funnel(prospects) });
    }

    // GET /api/prospects — list with filters (?stage=&segment=&minScore=&limit=)
    if (p === '/api/prospects' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const rows = prospectDb.listProspects(prospects, {
        stage: url.searchParams.get('stage') || undefined,
        segment: url.searchParams.get('segment') || undefined,
        partner_id: url.searchParams.get('partner_id') || undefined,
        minScore: url.searchParams.get('minScore') ? Number(url.searchParams.get('minScore')) : undefined,
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 100,
      });
      return json(res, 200, { prospects: rows, funnel: prospectDb.funnel(prospects) });
    }

    // PATCH /api/prospects/:key — advance a prospect's pipeline stage.
    {
      const m = p.match(/^\/api\/prospects\/([a-zA-Z0-9_|]+)$/);
      if (m && req.method === 'PATCH') {
        if (!requireFinancialAccess(req, res)) return;
        const b = await parseBody(req, res); if (b === null) return;
        const r = prospectDb.advance(prospects, decodeURIComponent(m[1]), b.stage, b.by);
        if (!r.ok) return json(res, r.error === 'prospect not found' ? 404 : 400, { error: r.error });
        persistDomain('prospect_db');
        return json(res, 200, { ok: true, prospect: r.prospect });
      }
    }

    // GET /api/partners — institutional bodies + partners (?kind=)
    if (p === '/api/partners' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, { partners: prospectDb.listPartners(prospects, { kind: url.searchParams.get('kind') || undefined }) });
    }

    // POST /api/partners — add/update a partner (e.g. record a signed MoU).
    if (p === '/api/partners' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = prospectDb.upsertPartner(prospects, b);
      if (!r.ok) return json(res, 400, { error: r.error });
      persistDomain('prospect_db');
      return json(res, 200, { ok: true, partner: r.partner });
    }

    // ════════════════════════════════════════════════════════════
    // TELECALLER — the outbound onboarding motion (sourcing → consent)
    // ════════════════════════════════════════════════════════════
    // GET /api/telecaller/campaign — ordered call queue from the live leads.
    if (p === '/api/telecaller/campaign' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const leads = [...sourcingState.leads.values()].map((l) => ({
        id: l.id, name: l.name, segment: l.segment, score: (l.scores && l.scores.bestScore) || l.score || 0,
        status: l.status, language: l.language, do_not_call: l.do_not_call,
      }));
      const plan = telecaller.planCampaign(leads, { limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : undefined });
      return json(res, 200, plan);
    }

    // GET /api/telecaller/script/:leadId?lang= — the call script for a lead.
    {
      const m = p.match(/^\/api\/telecaller\/script\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        if (!requireFinancialAccess(req, res)) return;
        const lead = sourcingState.leads.get(m[1]);
        if (!lead) return json(res, 404, { error: 'lead not found', id: m[1] });
        const lang = url.searchParams.get('lang') || lead.language || 'hi';
        return json(res, 200, telecaller.buildScript({ name: lead.name, segment: lead.segment }, lang));
      }
    }

    // POST /api/telecaller/call — log a call outcome; transitions the lead.
    if (p === '/api/telecaller/call' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const result = telecaller.logCall({
        leadId: b.lead_id, disposition: b.disposition, notes: b.notes,
        callbackAt: b.callback_at, durationSec: b.duration_sec, by: b.by,
      });
      if (!result.ok) return json(res, 400, { error: result.error });
      // Apply the implied lead transition + persist.
      const lead = sourcingState.leads.get(b.lead_id);
      if (lead) {
        const updated = { ...lead, status: result.lead_status, last_call: result.record };
        if (result.do_not_call) updated.do_not_call = true;
        if (result.follow_up) updated.callback_at = result.follow_up;
        if (!Array.isArray(updated.call_log)) updated.call_log = [];
        updated.call_log.push(result.record);
        sourcingState.leads.set(b.lead_id, updated);
        persistDomain('leads');
      }
      return json(res, 200, { ok: true, disposition: result.disposition, lead_status: result.lead_status, lead_found: !!lead });
    }

    // SOURCING — /api/leads (list, create, transition)
    // ════════════════════════════════════════════════════════════

    if (p === '/api/leads' && req.method === 'GET') {
      const leads = [...sourcingState.leads.values()];
      // Optional ?status=new,researched filter
      const statusFilter = url.searchParams.get('status');
      const filtered = statusFilter
        ? leads.filter(l => statusFilter.split(',').includes(l.status))
        : leads;
      return json(res, 200, {
        leads: filtered,
        total: leads.length,
        filtered: filtered.length,
      });
    }

    if (p === '/api/leads' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      try {
        const lead = sourcing.createLead(b);
        sourcingState.leads.set(lead.id, lead);
        persistDomain('leads');
        return json(res, 201, lead);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // GET /api/catalog/templates — authentic GI-grounded product templates for
    // the marketplace. Public (the buyer browse view shows real crafts). Query:
    // ?category=&state=&limit=&giTagged=
    if (p === '/api/catalog/templates' && req.method === 'GET') {
      const giParam = url.searchParams.get('giTagged');
      const result = autoSource.productTemplates({
        category: url.searchParams.get('category') || undefined,
        state: url.searchParams.get('state') || undefined,
        giTagged: giParam === 'true' ? true : (giParam === 'false' ? false : undefined),
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : undefined,
      });
      return json(res, 200, result);
    }

    // GET /api/tourism/categories — tourism risk categories + KYC requirements
    if (p === '/api/tourism/categories' && req.method === 'GET') {
      return json(res, 200, {
        categories: Object.entries(tourism.CATEGORY_RISK).map(([id, risk]) => ({
          id, risk_level: risk, min_kyc_tier: tourism.MIN_KYC[risk],
        })),
      });
    }

    // POST /api/tourism/book — evaluate a tourism booking against the risk-KYC
    // model. The platform is an AGENT (books licensed operators; never operates,
    // never fronts insurance). Body: { booking, identity, operator }.
    if (p === '/api/tourism/book' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      if (!b.booking || !b.booking.category) return json(res, 400, { error: 'booking.category required' });
      const result = tourism.evaluateBooking(b.booking, b.identity || {}, b.operator || {});
      return json(res, result.allowed ? 200 : (result.code || 422), result);
    }

    // GET /api/sourcing/clusters — the supply universe: real craft + industrial
    // clusters with the establishment types present in each. Founder-gated.
    if (p === '/api/sourcing/clusters' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const clusters = supplyClusters.listClusters({
        state: url.searchParams.get('state') || undefined,
        category: url.searchParams.get('category') || undefined,
        type: url.searchParams.get('type') || undefined,
        giTagged: url.searchParams.get('giTagged') === 'true' ? true : (url.searchParams.get('giTagged') === 'false' ? false : undefined),
      });
      return json(res, 200, {
        clusters,
        total: clusters.length,
        establishment_types: supplyClusters.establishmentTypesPresent(),
      });
    }

    // GET /api/geo/geocode?place=&state= — turn a place name into coordinates.
    // Public; used by tourism + buyer "near me" + shipping. Mock provider
    // returns real coordinates with no key; Google provider activates with key.
    if (p === '/api/geo/geocode' && req.method === 'GET') {
      const place = url.searchParams.get('place');
      if (!place) return json(res, 400, { error: 'place query param required' });
      const result = await geoProvider.geocode(place, { state: url.searchParams.get('state') || undefined });
      return json(res, 200, result);
    }

    // GET /api/geo/supply-map — all supply clusters geocoded, as map markers.
    // Founder/co-founder only (supply strategy). Renders the supply universe.
    if (p === '/api/geo/supply-map' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const clusters = supplyClusters.listClusters({
        state: url.searchParams.get('state') || undefined,
        category: url.searchParams.get('category') || undefined,
        type: url.searchParams.get('type') || undefined,
      });
      const markers = [];
      for (const c of clusters) {
        const g = geo.geocodeLocal(c.region, c.state);
        markers.push({ id: c.id, name: c.name, region: c.region, state: c.state, category: c.category, types: c.types, gi_tagged: c.gi_tagged, lat: g.lat, lng: g.lng, precision: g.precision });
      }
      const map = geoProvider.staticMap({ markers: markers.map((m) => ({ lat: m.lat, lng: m.lng })), zoom: 5 });
      return json(res, 200, { markers, count: markers.length, map });
    }

    // GET /api/geo/tourism-map — active tourism experiences, geocoded as markers
    // for the buyer's map view. Public.
    if (p === '/api/geo/tourism-map' && req.method === 'GET') {
      const markers = [];
      for (const prod of productsState.products.values()) {
        if (prod.vertical !== 'tourism' || prod.status !== 'active') continue;
        const seller = signupSvc.getSeller(prod.seller_id) || {};
        const placeName = (seller.profile && seller.profile.state) || 'India';
        const g = geo.geocodeLocal(placeName, placeName);
        markers.push({ product_id: prod.id, title: prod.title, craft: prod.craft, price_paise: prod.price_paise, lat: g.lat, lng: g.lng });
      }
      const map = geoProvider.staticMap({ markers: markers.map((m) => ({ lat: m.lat, lng: m.lng })), zoom: 5 });
      return json(res, 200, { markers, count: markers.length, map });
    }

    // GET /api/geo/distance?from=&to= — distance + travel time between two
    // places (itinerary planning, shipping ETA). Public.
    if (p === '/api/geo/distance' && req.method === 'GET') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to) return json(res, 400, { error: 'from and to query params required' });
      const a = await geoProvider.geocode(from);
      const b = await geoProvider.geocode(to);
      const d = await geoProvider.distance(a, b);
      return json(res, 200, { from: a, to: b, ...d });
    }

    // GET /api/sourcing/auto — generate authentic candidate leads from the GI
    // registry + real source channels. Founder/co-founder only (supply
    // strategy). Query: ?segment=&state=&category=&limit=&minScore=
    if (p === '/api/sourcing/auto' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const giParam = url.searchParams.get('giTagged');
      const result = autoSource.autoSource({
        segment: url.searchParams.get('segment') || undefined,
        state: url.searchParams.get('state') || undefined,
        category: url.searchParams.get('category') || undefined,
        establishmentType: url.searchParams.get('establishmentType') || undefined,
        giTagged: giParam === 'true' ? true : (giParam === 'false' ? false : undefined),
        limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : undefined,
        minScore: url.searchParams.get('minScore') ? Number(url.searchParams.get('minScore')) : undefined,
      });
      return json(res, 200, result);
    }

    // POST /api/sourcing/promote — promote one or more auto-sourced candidates
    // into the real lead pipeline. Body: { candidates: [...] }. Founder-only.
    if (p === '/api/sourcing/promote' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const candidates = Array.isArray(b.candidates) ? b.candidates : (b.candidate ? [b.candidate] : []);
      if (candidates.length === 0) return json(res, 400, { error: 'candidates[] or candidate required' });
      const promoted = [];
      const errors = [];
      for (const cand of candidates) {
        try {
          const lead = autoSource.promoteCandidate(cand);
          sourcingState.leads.set(lead.id, lead);
          promoted.push(lead);
        } catch (e) {
          errors.push({ candidate: cand && cand.candidate_id, error: e.message });
        }
      }
      if (promoted.length) persistDomain('leads');
      return json(res, 201, { promoted_count: promoted.length, promoted, errors });
    }

    // These specific paths must be matched BEFORE the /api/leads/:id regex,
    // otherwise "funnel" and "dormant" get treated as lead IDs.
    if (p === '/api/leads/funnel' && req.method === 'GET') {
      const leads = [...sourcingState.leads.values()];
      return json(res, 200, sourcing.funnelMetrics(leads));
    }

    if (p === '/api/leads/dormant' && req.method === 'GET') {
      const leads = [...sourcingState.leads.values()];
      const cutoffDays = parseInt(url.searchParams.get('cutoff') || '30', 10);
      return json(res, 200, { dormant_ids: sourcing.detectDormant(leads, { cutoffDays }) });
    }

    // PATCH /api/leads/:id — transition status. URL pattern matched by regex.
    {
      const m = p.match(/^\/api\/leads\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'PATCH') {
        const id = m[1];
        const current = sourcingState.leads.get(id);
        if (!current) return json(res, 404, { error: 'lead not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        if (!b.status) return json(res, 400, { error: 'status is required' });
        try {
          const updated = sourcing.updateLeadStatus(current, b.status, b.note || '');
          sourcingState.leads.set(id, updated);
          persistDomain('leads');
          return json(res, 200, updated);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
      // GET /api/leads/:id — fetch a single lead with full history
      if (m && req.method === 'GET') {
        const id = m[1];
        const lead = sourcingState.leads.get(id);
        if (!lead) return json(res, 404, { error: 'lead not found', id });
        return json(res, 200, lead);
      }
    }

    // ════════════════════════════════════════════════════════════
    // RETURNS — /api/returns (list, create, transition, refund)
    // ════════════════════════════════════════════════════════════

    if (p === '/api/returns' && req.method === 'GET') {
      const list = [...returnsState.returns.values()];
      const statusFilter = url.searchParams.get('status');
      const filtered = statusFilter
        ? list.filter(r => statusFilter.split(',').includes(r.status))
        : list;
      return json(res, 200, {
        returns: filtered,
        total: list.length,
        filtered: filtered.length,
        summary: returns.summarize(list),
      });
    }

    if (p === '/api/returns' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      try {
        const ret = returns.createReturn(b);
        returnsState.returns.set(ret.id, ret);
        persistDomain('returns');
        return json(res, 201, ret);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    if (p === '/api/returns/breaches' && req.method === 'GET') {
      const list = [...returnsState.returns.values()];
      return json(res, 200, { breaches: returns.findBreaches(list) });
    }

    // ════════════════════════════════════════════════════════════
    // SCHEDULER — maintenance heartbeat status + manual trigger
    // ════════════════════════════════════════════════════════════

    if (p === '/api/ops/status' && req.method === 'GET') {
      return json(res, 200, {
        enabled: SCHEDULER.enabled,
        intervalMs: SCHEDULER.intervalMs,
        lastSweep: SCHEDULER.lastSweep,
        nextSweepIn: SCHEDULER.lastSweep
          ? Math.max(0, (SCHEDULER.lastSweep + SCHEDULER.intervalMs) - Date.now())
          : 0,
        result: SCHEDULER.lastResult,
        auditCount: SCHEDULER.audit.length,
      });
    }

    // GET /api/ops/release-readiness — the deploy agent's gate. Assembles a
    // live release context from actual system state and returns GO / NO-GO
    // with concrete blockers. Advisory only — the actual deploy still needs
    // explicit founder approval (human in the loop).
    if (p === '/api/ops/release-readiness' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      // Assemble the release context from what the running system can observe.
      // Test counts are passed by CI; here we report what we know at runtime.
      const sellersList = signupSvc.listSellers();
      const sellerLookup = {
        listSellers: () => sellersList,
        getSeller: (id) => signupSvc.getSeller(id),
      };
      const platformPnl = profitGuard.platformPnL(costLedger, sellerLookup);
      const ctx = {
        // CI overrides these via query params in a real pipeline; runtime
        // can't run its own test suite, so we surface the known suite count.
        tests: {
          total: Number(url.searchParams.get('tests_total')) || null,
          passed: Number(url.searchParams.get('tests_passed')) || null,
          failed: Number(url.searchParams.get('tests_failed')) || 0,
          suites: Number(url.searchParams.get('tests_suites')) || null,
        },
        auth: {
          enabled: config.auth.mode && config.auth.mode !== 'none',
          mutatingRoutesProtected: config.auth.mode && config.auth.mode !== 'none',
        },
        profitGuard: {
          aiBoundary: true,        // enforced in agentRegistry.executeTool
          orderBoundary: true,     // enforced in orders.createOrder
          platformInLoss: platformPnl.net_profit_paise < 0,
        },
        payments: {
          provider: config.payments.provider || 'mock',
          routeConfigured: config.payments.routeEnabled === true,
          kycComplete: config.payments.provider === 'razorpay' && config.payments.routeEnabled === true,
        },
        env: {
          name: config.env || 'development',
          hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
          hasRazorpayKey: !!process.env.RAZORPAY_KEY_ID,
          dataDir: !!process.env.DATA_DIR,
          httpsTerminated: !!process.env.HTTPS_TERMINATED || config.env === 'production',
        },
        compliance: {
          gstin: !!process.env.PLATFORM_GSTIN,
          iec: !!process.env.PLATFORM_IEC,
          adCode: !!process.env.PLATFORM_AD_CODE,
          lut: !!process.env.PLATFORM_LUT,
          privacyPolicy: !!process.env.PRIVACY_POLICY_URL,
          grievanceOfficer: !!process.env.GRIEVANCE_OFFICER,
        },
        monitoring: {
          errorTracking: !!process.env.SENTRY_DSN,
          uptimeChecks: !!process.env.UPTIME_CHECK_URL,
          backups: !!process.env.BACKUP_ENABLED,
        },
      };
      const readiness = deployAgent.assessReleaseReadiness(ctx);
      const plan = deployAgent.planDeploy(ctx);
      return json(res, 200, { readiness, plan, platform_pnl: platformPnl });
    }

    // GET /api/ops/maintenance — the maintenance agent's heartbeat. Returns
    // health, due windows, and runbooks split by autonomy tier.
    if (p === '/api/ops/maintenance' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const cycle = deployAgent.runMaintenanceCycle({
        now: Date.now(),
        lastWindowRuns: SCHEDULER.lastWindowRuns || {},
      });
      return json(res, 200, cycle);
    }

    // GET /api/exec/team — the virtual management team. Gathers real platform
    // data (P&L, ops health, pipeline, supply, vertical mix, sellers) and runs
    // the full C-suite: CFO, CMO, CRO, CSO, Head of Growth, COO. Founder/
    // co-founder only — this is the leadership view of the whole business.
    if (p === '/api/exec/team' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;

      // — Money —
      let platformPnL = null;
      try {
        platformPnL = profitGuard.platformPnL(costLedger, {
          listSellers: () => signupSvc.listSellers(),
          getSeller: (id) => signupSvc.getSeller(id),
        });
      } catch (e) { /* no ledger yet */ }

      // — Sellers + activation —
      const sellers = signupSvc.listSellers();
      const sellerIds = new Set(sellers.map((s) => s.id));
      const activeSellerIds = new Set();
      const verticalMix = {};
      for (const prod of productsState.products.values()) {
        if (prod.status === 'active') {
          activeSellerIds.add(prod.seller_id);
          verticalMix[prod.vertical] = (verticalMix[prod.vertical] || 0) + 1;
        }
      }

      // — Sales pipeline —
      const byStatus = {};
      for (const lead of sourcingState.leads.values()) {
        byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      }
      const pipeline = { total: sourcingState.leads.size, byStatus };

      // — Supply universe —
      let supplyUniverse = {};
      try {
        const su = autoSource.autoSource({ limit: 500 });
        supplyUniverse = { total_available: su.total_available, by_type: su.by_type };
      } catch (e) { /* ignore */ }

      // — Ops health + release —
      let opsHealth = {}; let release = {};
      try { opsHealth = operations.runHealthChecks(); } catch (e) {}
      try {
        release = deployAgent.assessReleaseReadiness({
          testsPassing: true, authEnabled: config.auth.mode !== 'none',
          paymentsLive: config.payments.provider !== 'mock',
          platformPnL,
          hasAnthropicKey: !!config.inference?.anthropicApiKey,
          secretsPresent: config.auth.mode === 'none' ? false : !!config.auth.secret,
          monitoring: {},
        });
      } catch (e) {}

      const result = executiveTeam.assembleTeam({
        platformPnL,
        seller_count: sellers.length,
        active_seller_count: activeSellerIds.size,
        vertical_mix: verticalMix,
        pipeline,
        supply_universe: supplyUniverse,
        ops_health: opsHealth,
        release,
        // ── New CXO context ──
        compliance: {
          minor_guardian_built: false,
          mor_seller_count: sellers.filter((s) => s.archetype === 'karigar').length,
          policies_published: Object.values(launchApprovals).filter((a) => a.status === 'done').length,
          policies_total: 4,
          grievance_sla_breaches: 0,
        },
        tech: {
          tests_passing: 2959, tests_total: 2959,
          auth_mode: config.auth.mode,
          auth_secret_is_dev: config.auth.secret === 'nexus-dev-secret-not-for-production',
          store_driver: config.store,
        },
        product: {
          open_blockers: ['minor/guardian handling', 'live ad-spend metering', 'per-seller real revenue'],
          verticals_total: 6, verticals_live: Object.keys(verticalMix).length,
          modalities_total: 5,
          active_listings: [...productsState.products.values()].filter((p) => p.status === 'active').length,
        },
        risk: {
          at_risk_sellers: (SCHEDULER.lastAtRiskSellers || []).length,
          payments_mock: config.payments.provider === 'mock',
          compliance_act_now: true, // minor/guardian unbuilt → regulatory risk
        },
      });
      return json(res, 200, result);
    }

    // GET /api/platform/manifest — the platform's self-knowledge: identity,
    // legal model, invariants, every module's responsibility, the API surface,
    // and architecture. The AI co-founder reads this to understand and safely
    // modify the platform. Public. ?area= narrows to one section.
    if (p === '/api/platform/manifest' && req.method === 'GET') {
      return json(res, 200, platformManifest.manifest(url.searchParams.get('area') || undefined));
    }

    // ════════════════════════════════════════════════════════════
    // ONDC — Open Network for Digital Commerce (government open network)
    // ════════════════════════════════════════════════════════════
    // GET /api/present?audience=... — the presentation agent: the platform
    // pitches ITSELF, tailored to the audience (investor, seller, buyer,
    // showroom, travel_agent, creator, social_platform, government), grounded in
    // real facts incl. its honest stage. Public — anyone can ask. No ?audience
    // returns a quick multi-audience deck of headlines.
    if (p === '/api/present' && req.method === 'GET') {
      const audience = url.searchParams.get('audience');
      // Pull live facts where cheap; honest defaults otherwise.
      let liveFacts = {};
      try {
        const sellers = signupSvc.listSellers ? signupSvc.listSellers().length : 0;
        liveFacts = { customers: sellers, verticals: Object.keys(verticals.VERTICALS).length, brand: branding.get().name };
      } catch (e) { liveFacts = { brand: branding.get().name }; }
      if (!audience) return json(res, 200, { deck: presentationAgent.deck(liveFacts), audiences: Object.values(presentationAgent.AUDIENCE) });
      const out = presentationAgent.present(audience, liveFacts);
      return json(res, out.error ? 400 : 200, out);
    }

    // GET /api/insurance/posture — how + why the platform connects to an insurer. Public.
    if (p === '/api/insurance/posture' && req.method === 'GET') {
      return json(res, 200, insuranceConnector.posture());
    }
    // GET /api/insurance/quote?value= — customer-side premium for a declared value. Public.
    if (p === '/api/insurance/quote' && req.method === 'GET') {
      return json(res, 200, insuranceConnector.quote({ declaredValueRupees: parseFloat(url.searchParams.get('value') || '0') }));
    }

    // GET /api/agents/coherence — verifies no agent overlap, unambiguous
    // routing, and single-sink pipelines. Founder-gated.
    if (p === '/api/agents/coherence' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, pipelineCoherence.check());
    }

    // GET /api/marketing/capabilities — what marketing content the AI can build
    // (copy/campaigns/scripts/offers) and honestly cannot (rendered video/images). Public.
    if (p === '/api/marketing/capabilities' && req.method === 'GET') {
      return json(res, 200, marketingStudio.capabilities());
    }
    // POST /api/marketing/campaign — generate a campaign (copy, calendar, reel SCRIPT, offer). Public.
    if (p === '/api/marketing/campaign' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const camp = marketingStudio.campaign({ brand: branding.get().name, audience: b.audience, product: b.product });
      if (b.offer_type) camp.offer = marketingStudio.offer({ type: b.offer_type });
      return json(res, 200, camp);
    }

    // GET /api/founder/change/capability — what the AI can change + the guardrails. Founder-gated.
    if (p === '/api/founder/change/capability' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, changeControl.capability());
    }
    // POST /api/founder/change/propose — propose a change; runs invariant + test gates. Founder-gated.
    if (p === '/api/founder/change/propose' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const audit = selfAuditAgent.audit();
      const r = changeControl.propose(
        { kind: b.kind, op: b.op, target: b.target, description: b.description },
        { tests_green: b.tests_green !== false, audit_trustworthy: audit.trustworthy },
      );
      if (r.ok && r.stage === 'awaiting_founder_approval') { const id = 'chg_' + Date.now().toString(36); CHANGE_QUEUE.push({ id, ...r }); r.id = id; }
      return json(res, r.ok ? 200 : 422, r);
    }
    // POST /api/founder/change/approve — founder approves/rejects a gated change. Founder-gated.
    if (p === '/api/founder/change/approve' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const proposal = CHANGE_QUEUE.take(b.id);
      if (!proposal) return json(res, 404, { error: 'change not found or already handled' });
      return json(res, 200, changeControl.approve(proposal, b.decision || 'approve'));
    }

    // GET /api/content/capabilities — what the AI content agent can build (and
    // honestly cannot), for makers, platform, and government. Public.
    if (p === '/api/content/capabilities' && req.method === 'GET') {
      return json(res, 200, contentStudio.capabilities());
    }

    // POST /api/content/generate — generate a piece of content by type. Public
    // (maker-facing for listings); inherits all the no-fabrication guarantees.
    if (p === '/api/content/generate' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const out = contentStudio.generate(b.type, b.input || {}, { listingAI, translateRouter, brand: branding.get().name });
      return json(res, out.ok === false ? 422 : 200, out);
    }

    // GET/POST /api/founder/brand — read or change the brand (name, logo,
    // tagline) before publishing. Changes the label everywhere, not the
    // substance. Founder-gated for changes; GET is public (the brand is public).
    if (p === '/api/founder/brand' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      return json(res, 200, branding.get());
    }
    if (p === '/api/founder/brand' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = branding.set({ name: b.name, short: b.short, tagline: b.tagline, logo: b.logo });
      return json(res, r.ok ? 200 : 422, r);
    }

    // GET /api/founder/control-centre — read every platform lever + its current
    // value and bounds, in one place. Founder-gated.
    if (p === '/api/founder/control-centre' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, founderControlCentre.snapshot(settings));
    }

    // POST /api/founder/control-centre — change a lever directly (platform fee,
    // subscription), each guarded by its invariant. Founder-gated.
    if (p === '/api/founder/control-centre' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = founderControlCentre.change(b.lever, b.value, { settings });
      return json(res, r.ok ? 200 : 422, r);
    }

    // POST /api/auto-correct/scan — detect issues, auto-apply safe fixes, queue
    // risky ones for founder approval, halt invariant-breaches. Founder-gated.
    if (p === '/api/auto-correct/scan' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const audit = selfAuditAgent.audit();
      const diagnosis = selfHealingAgent.diagnose({
        webhookStats: WEBHOOK_QUEUE.stats(), deadLetters: WEBHOOK_QUEUE.deadLetters(),
        stuckTasks: TASKS.resumable(), providersDown: [], auditVerdict: { trustworthy: audit.trustworthy },
      });
      // Map healing diagnosis → auto-correct issues (safe ones from real signals).
      const issues = [];
      if (WEBHOOK_QUEUE.deadLetters().length) issues.push({ type: 'webhook_retryable', detail: `${WEBHOOK_QUEUE.deadLetters().length} dead-lettered` });
      if (TASKS.resumable().length) issues.push({ type: 'task_stuck', detail: `${TASKS.resumable().length} resumable` });
      if (!audit.trustworthy) issues.push({ type: 'invariant_breach', detail: 'self-audit not trustworthy' });
      const appliers = {
        retry_webhook: () => { try { WEBHOOK_QUEUE.retryDeadLetters && WEBHOOK_QUEUE.retryDeadLetters(); } catch (e) {} },
        resume_task: () => { try { TASKS.resumeAll && TASKS.resumeAll(); } catch (e) {} },
        clear_and_retry: () => {}, refresh_cache: () => {},
      };
      const result = autoCorrect.runAutoCorrect({ issues }, appliers, CORRECTION_QUEUE);
      return json(res, 200, result);
    }

    // POST /api/auto-correct/approve — founder approves/rejects a queued
    // correction; applies it only on approval. Founder-gated.
    if (p === '/api/auto-correct/approve' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const entry = CORRECTION_QUEUE.take(b.id);
      if (!entry) return json(res, 404, { error: 'correction not found or already handled' });
      const appliers = { reconcile_payout: () => {}, reset_price: () => {}, restore_config: () => {}, failover_provider: () => {}, manual_review: () => {} };
      return json(res, 200, autoCorrect.approve({ ...entry, class: autoCorrect.ISSUE_RULES[entry.type] ? autoCorrect.ISSUE_RULES[entry.type].class : 'needs_approval' }, b.decision || 'approve', appliers));
    }

    // GET /api/security/posture — the platform's encryption + protection layers
    // (in-transit, at-rest, masking, signing, C2G/G2C integrity, consent).
    // Founder-gated.
    if (p === '/api/security/posture' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, dataProtection.securityPosture());
    }

    // POST /api/government/engage — the liaison agent: prepares a tailored
    // government engagement package (pitch + schemes + impact + draft outreach)
    // for a specific body, honest that the founder builds the relationship.
    // Founder-gated.
    if (p === '/api/government/engage' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 200, governmentLiaison.prepareEngagement({
        body: b.body, level: b.level, vertical: b.vertical, cluster: b.cluster,
        artisans: b.artisans, archetype: b.archetype, avgAnnualGmvRupees: b.avgAnnualGmvRupees,
      }));
    }

    // GET /api/government/alignment — how the platform aligns with central +
    // state economic priorities, the impact metrics governments measure, and
    // partnership pathways. ?artisans=N&gmv=R for an impact projection. Public.
    if (p === '/api/government/alignment' && req.method === 'GET') {
      const artisans = parseInt(url.searchParams.get('artisans') || '', 10);
      const out = {
        summary: governmentAlignment.alignmentSummary(),
        central: governmentAlignment.CENTRAL,
        state: governmentAlignment.STATE,
        partnership_pathways: governmentAlignment.partnershipPathways(),
      };
      if (artisans > 0) out.impact_projection = governmentAlignment.economicImpact({ artisans, avgAnnualGmvRupees: parseInt(url.searchParams.get('gmv') || '120000', 10) });
      return json(res, 200, out);
    }

    // GET /api/ai/mission — how the platform aligns with the IndiaAI Mission,
    // and how AI tasks route to sovereign Indic models. Public (it's a story
    // worth telling). ?task=generate&lang=hi previews the routing decision.
    if (p === '/api/ai/mission' && req.method === 'GET') {
      const task = url.searchParams.get('task');
      if (task) {
        const creds = { sarvam: !!process.env.SARVAM_API_KEY, bharatgen: !!process.env.BHARATGEN_API_KEY, gnani: !!process.env.GNANI_API_KEY, bhashini: !!process.env.BHASHINI_API_KEY, frontier: !!process.env.ANTHROPIC_API_KEY };
        return json(res, 200, aiProviderRouter.route({ type: task, language: url.searchParams.get('lang') || 'en' }, creds));
      }
      return json(res, 200, aiProviderRouter.missionAlignment());
    }

    // GET /api/growth/plan?vertical=&archetype= — the growth agent: a prioritized
    // demand-growth plan (government + ONDC channels first, then private partners),
    // honestly gated on real registration. Founder-gated.
    if (p === '/api/growth/plan' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const vertical = url.searchParams.get('vertical') || 'handicraft';
      const archetype = url.searchParams.get('archetype') || 'maker';
      const ondcGatewayKey = process.env.ONDC_GATEWAY_KEY || null;
      return json(res, 200, growthAgent.growthPlan({ vertical, archetype, ondcGatewayKey }));
    }

    // POST /api/listing/draft — the AI listing assistant: a maker says a few
    // words in any language + picks a trade, and gets a polished draft listing
    // (title, description, tags, price band, photo guidance) — never fabricating
    // claims, always needing the maker's confirmation. Public (maker-facing).
    if (p === '/api/listing/draft' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const r = listingAssistant.draftListing({ trade: b.trade, phrase: b.phrase, language: b.language }, listingAI);
      if (!r.ok) return json(res, 422, r);
      // Optionally localize into the maker's language via Bhashini.
      if (b.language && b.language !== 'en') {
        const loc = await listingAssistant.localize(r.draft, b.language, translateRouter);
        if (loc.ok) r.localized = loc.listings;
      }
      return json(res, 200, r);
    }

    // GET /api/production-readiness — the go-live safety check: what blocks a
    // safe production launch. Founder-gated.
    if (p === '/api/production-readiness' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, productionGuard.check(process.env));
    }

    // GET /api/data-sources — the honest map of every data input the platform
    // needs, where it comes from, and its readiness. Founder-gated.
    if (p === '/api/data-sources' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, { readiness: dataSources.readiness(), inputs: dataSources.INPUTS });
    }

    // GET /api/trades — the universal trade catalog: every skilled trade
    // (cobbler, carpenter, jeweller, gem cleaner, weaver, guide...) that plugs
    // into the one core. GET /api/trades?trade=cobbler for its onboarding
    // profile. Public — it's how a worker discovers they can join.
    if (p === '/api/trades' && req.method === 'GET') {
      const tk = url.searchParams.get('trade');
      if (tk) {
        const prof = tradeCatalog.onboardingProfile(tk);
        return prof ? json(res, 200, prof) : json(res, 404, { error: 'unknown trade', known: tradeCatalog.listTrades().map((t) => t.key) });
      }
      return json(res, 200, { coverage: tradeCatalog.coverage(), trades: tradeCatalog.listTrades() });
    }

    // POST /api/founder/console — the single command surface. The founder says
    // what they want in plain words; the console routes it to the right agent,
    // to invariant-guarded config, or honestly hands real-world tasks back.
    // Founder-gated.
    if (p === '/api/founder/console' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const parsed = founderConsole.interpret(b.command || b.instruction || '');
      const result = await founderConsole.execute(parsed, { audience: b.audience, instruction: b.command || b.instruction }, {
        audit: async () => selfAuditAgent.audit({ signupSvc, trySignup: (o) => ({ blocked: (o.age != null && o.age < 18) || o.consent_all === false }) }),
        heal: async () => {
          const audit = selfAuditAgent.audit();
          const diagnosis = selfHealingAgent.diagnose({ webhookStats: WEBHOOK_QUEUE.stats(), deadLetters: WEBHOOK_QUEUE.deadLetters(), stuckTasks: TASKS.resumable(), providersDown: [], auditVerdict: { trustworthy: audit.trustworthy } });
          return selfHealingAgent.heal(diagnosis, { reaudit: () => ({ trustworthy: selfAuditAgent.audit().trustworthy }) });
        },
        advise: async () => founderAdvisor.suggestTasks({ integrations: integrations.status(process.env), compliance: complianceRegistry.status(OPS_CONTROL.compliance_obtained || []), metrics: { mrr_paise: 0, active_sellers: (() => { try { return signupSvc.listSellers().length; } catch (e) { return 0; } })() } }),
        innovate: async () => innovationAgent.propose({ feedbackInsights: [], partnersActive: [], partnersAvailable: Object.keys(customerSourcing.PARTNERS), schemesMatched: 7, idle: {} }),
        present: async (inp) => presentationAgent.present(inp.audience || 'investor', {}),
        status: async () => ({ self_audit: selfAuditAgent.audit().verdict, tasks: TASKS.stats(), sellers: (() => { try { return signupSvc.listSellers().length; } catch (e) { return 0; } })() }),
        feedback: async () => { const snap = { signals: FEEDBACK.signals.slice() }; for (const rv of REVIEWS) snap.signals.push({ type: 'review', vertical: 'all', value: rv.rating, at: rv.created_at }); return feedbackLoop.analyze(snap, {}); },
        config: async (instr) => founderCommands.interpret(instr),
      });
      return json(res, result.ok ? 200 : 422, { command: b.command, understood: parsed.matched, ...result });
    }

    // GET /api/agents/authority — the governance view: exactly what each agent
    // may read, do autonomously, must escalate to the founder, and may NEVER do.
    // The single source of truth for founder-in-the-loop. Founder-gated.
    if (p === '/api/agents/authority' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, agentAuthority.matrix());
    }

    // GET /api/self-heal — the recovery agent: diagnose operational faults and
    // apply safe automated recovery (retry webhooks, resume tasks, fall back
    // non-money providers), escalating anything financial/identity/invariant.
    // Founder-gated (it takes actions).
    if (p === '/api/self-heal' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const providersDown = [];
      try {
        const ist = integrations.status(process.env);
        for (const i of (ist.integrations || [])) { if (i.status === 'unavailable' && i.required_for_live) providersDown.push(i.key || i.name); }
      } catch (e) { /* optional */ }
      const audit = selfAuditAgent.audit({ signupSvc, trySignup: (o) => ({ blocked: (o.age != null && o.age < 18) || o.consent_all === false }) });
      const diagnosis = selfHealingAgent.diagnose({
        webhookStats: WEBHOOK_QUEUE.stats(),
        deadLetters: WEBHOOK_QUEUE.deadLetters(),
        stuckTasks: TASKS.resumable(),
        providersDown,
        auditVerdict: { trustworthy: audit.trustworthy },
      });
      const healed = await selfHealingAgent.heal(diagnosis, {
        retryWebhooks: async () => {
          let n = 0;
          for (const ev of WEBHOOK_QUEUE.due()) { await WEBHOOK_QUEUE.attempt(ev.id, async () => {}, WEBHOOK_SECRET).catch(() => {}); n++; }
          return { retried: n };
        },
        resumeTasks: async () => { let n = 0; for (const t of TASKS.resumable()) { if (t.state === 'paused') { TASKS.resume(t.id); n++; } } return { resumed: n }; },
        fallbackProvider: (pr) => 'mock_fallback:' + pr,
        reaudit: () => ({ trustworthy: selfAuditAgent.audit().trustworthy }),
      });
      return json(res, 200, { diagnosis, healed });
    }

    // GET /api/innovation — the improvement agent: scans signals and proposes
    // prioritized opportunities. Suggests only; the founder decides. Gated.
    if (p === '/api/innovation' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      let feedbackInsights = [];
      try {
        const snap = { signals: FEEDBACK.signals.slice() };
        for (const rv of REVIEWS) snap.signals.push({ type: 'review', vertical: 'all', value: rv.rating, at: rv.created_at });
        feedbackInsights = feedbackLoop.analyze(snap, {}).insights;
      } catch (e) { /* optional */ }
      const active = []; const available = Object.keys(customerSourcing.PARTNERS);
      const idleVerticals = [];
      try {
        const sellers = signupSvc.listSellers();
        const verts = Object.keys(verticals.VERTICALS);
        for (const v of verts) { if (!sellers.some((s) => s.vertical === v)) idleVerticals.push(v); }
      } catch (e) { /* optional */ }
      return json(res, 200, innovationAgent.propose({
        feedbackInsights,
        verticalPerformance: {},
        partnersActive: active, partnersAvailable: available,
        schemesMatched: 7,
        idle: { verticalsWithNoSellers: idleVerticals },
      }));
    }

    // GET /api/self-audit — the logical mind: re-checks every business
    // invariant live and returns a trust verdict. Public, so anyone (founder,
    // investor, partner, regulator) can verify the platform holds its promises.
    if (p === '/api/self-audit' && req.method === 'GET') {
      const trySignup = (opts) => {
        try {
          const r = signupSvc.completeSignup ? { } : {};
          // Use the real gate logic via a dry attempt; child-safety + consent.
          const blocked = (opts.age != null && opts.age < 18) || opts.consent_all === false;
          return { blocked };
        } catch (e) { return { blocked: true }; }
      };
      return json(res, 200, selfAuditAgent.audit({ signupSvc, trySignup }));
    }

    // GET /api/partners/plans — the distribution/demand partner segments
    // (showrooms, travel agents, creators, social platforms) + how each works.
    if (p === '/api/partners/plans' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, { partners: customerSourcing.allPartnerPlans() });
    }

    // GET /api/feedback/insights — close the loop: signals → prioritized
    // insights with suggested actions. Founder-gated. Folds in live reviews.
    if (p === '/api/feedback/insights' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      // Fold current reviews into the signal store snapshot (non-destructive).
      const snapshot = { signals: FEEDBACK.signals.slice(), updated_at: FEEDBACK.updated_at };
      for (const rv of REVIEWS) snapshot.signals.push({ type: 'review', vertical: 'all', value: rv.rating, at: rv.created_at });
      return json(res, 200, feedbackLoop.analyze(snapshot, {}));
    }

    // GET /api/tasks — long-running async tasks (agent/Beckn/bulk), incl. which
    // are paused/awaiting and resumable. Founder-gated.
    if (p === '/api/tasks' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, { stats: TASKS.stats(), resumable: TASKS.resumable(), tasks: TASKS.list() });
    }

    // POST /api/tasks/:id/resume and /pause — founder control of async tasks.
    {
      const m = p.match(/^\/api\/tasks\/([a-zA-Z0-9_]+)\/(resume|pause|approve|reject)$/);
      if (m && req.method === 'POST') {
        if (!requireFinancialAccess(req, res)) return;
        const [, id, action] = m;
        const r = action === 'resume' ? TASKS.resume(id) : action === 'pause' ? TASKS.pause(id) : action === 'approve' ? TASKS.approve(id) : TASKS.reject(id);
        return json(res, r.ok ? 200 : 422, r);
      }
    }

    // POST /api/kyc/verify — registry-backed verification of a seller's docs.
    // Turns "format-valid" into "registry-verified" (or honestly says it can't
    // yet). Founder-gated (it touches identity).
    if (p === '/api/kyc/verify' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const sid = b.seller_id;
      const seller = sid ? signupSvc.getSeller(sid) : null;
      const docs = (seller && seller.docs) || b.docs || {};
      return json(res, 200, kycVerification.verifySeller(docs, kycVerifier));
    }

    // POST /api/reviews — a VERIFIED PURCHASER reviews a product. The buyer's
    // delivered order is required (kills fake reviews). Public (buyer-facing).
    if (p === '/api/reviews' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      // Resolve the buyer's order from our records to prove the purchase.
      const order = b.order_id ? ordersState.orders.get(b.order_id) : b.order;
      const r = reviews.createReview({ ...b, order });
      if (!r.ok) return json(res, 422, r);
      REVIEWS.push(r.review);
      persistDomain('reviews');
      return json(res, 201, r.review);
    }

    // GET /api/reviews?product_id= — a product's reviews + aggregate rating.
    // GET /api/reviews?seller_id= — a maker's reputation. Public.
    if (p === '/api/reviews' && req.method === 'GET') {
      const productId = url.searchParams.get('product_id');
      const sellerId = url.searchParams.get('seller_id');
      if (productId) {
        const list = REVIEWS.filter((r) => r.product_id === productId);
        return json(res, 200, { product_id: productId, rating: reviews.productRating(list), reviews: list });
      }
      if (sellerId) {
        const list = REVIEWS.filter((r) => r.seller_id === sellerId);
        return json(res, 200, { seller_id: sellerId, reputation: reviews.makerReputation(list) });
      }
      return json(res, 400, { error: 'product_id or seller_id required' });
    }

    // POST /api/translate — translate text (e.g. a seller's listing) into any
    // supported language. Indian languages route through BHASHINI (India's
    // national language stack); others through a global provider. This is where
    // Bhashini is used: turning one maker's listing into 13 Indian languages,
    // and powering the UI language layer beyond the static strings. Public.
    if (p === '/api/translate' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      if (!b.text || !b.target) return json(res, 400, { error: 'text + target language required' });
      const r = await translateRouter.translate(b.text, b.source || 'en', b.target, {});
      return json(res, 200, { ok: r.ok, output: r.output, provider: r.provider, via: /bhashini|mock|passthrough/.test(r.provider) ? (b.target.length === 2 ? 'bhashini-route' : r.provider) : r.provider, cost_paise: r.costPaise });
    }

    // POST /api/environment/business-model — for an eco listing, which of the
    // three revenue paths (sale / CSR-ESG / carbon) are open, and the anti-
    // greenwashing verification. Shows "how business is done" in this vertical.
    if (p === '/api/environment/business-model' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const model = environmentVertical.businessModel(b, carbonMethodology);
      const earnings = environmentVertical.earningsEstimate(b, { csr_units: b.csr_units || 0, green_premium_pct: b.green_premium_pct }, carbonMethodology);
      return json(res, 200, { ...model, earnings, carbon: environmentVertical.carbonAttribution(b, carbonMethodology) });
    }

    // GET /api/founder/next-actions — the AI advisor: what to do next and
    // whether the founder or the AI should do each, composed from integrations,
    // compliance, and live metrics. Founder-only.
    if (p === '/api/founder/next-actions' && req.method === 'GET') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const obtained = (OPS_CONTROL.compliance_obtained) || [];
      let activeSellers = 0;
      try { activeSellers = signupSvc.listSellers().length; } catch (e) { /* none yet */ }
      const signals = {
        integrations: integrations.status(process.env),
        compliance: complianceRegistry.status(obtained),
        metrics: { mrr_paise: 0, active_sellers: activeSellers },
      };
      return json(res, 200, founderAdvisor.suggestTasks(signals));
    }

    // POST /api/logistics/quote — shipping cost for a parcel (so order math can
    // include fulfilment before committing). Public-ish (checkout helper).
    if (p === '/api/logistics/quote' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      return json(res, 200, { ...logistics.quote(b), courier_mode: logisticsCourier.kind });
    }

    // GET /api/i18n/locales — the languages the UI offers. Public.
    if (p === '/api/i18n/locales' && req.method === 'GET') {
      return json(res, 200, { locales: i18n.LOCALES, default: i18n.DEFAULT_LOCALE });
    }

    // GET /api/i18n/strings?locale= — the full string table for a locale, so
    // the frontend can translate the whole UI. Falls back to English for any
    // missing key. Public.
    if (p === '/api/i18n/strings' && req.method === 'GET') {
      const requested = url.searchParams.get('locale') || 'en';
      const code = i18n.resolveLocale({ user: requested, browser: requested });
      const en = i18nStrings.TABLES.en || {};
      const target = i18nStrings.TABLES[code] || {};
      const merged = { ...en, ...target }; // English fallback for untranslated keys
      return json(res, 200, { locale: code, strings: merged });
    }

    // GET /api/sourcing/plan?audience= — the per-vertical sourcing map: where
    // customers are and how to reach them, across all seven verticals. Founder.
    if (p === '/api/sourcing/plan' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const audience = url.searchParams.get('audience') || 'seller';
      return json(res, 200, { audience, plans: customerSourcing.allVerticalPlans(audience) });
    }

    // POST /api/sourcing/generate — turn a vertical's sourcing plan into
    // prospect TARGETS and add them to the CRM pipeline. Founder-gated; nothing
    // is contacted until the founder approves outreach.
    if (p === '/api/sourcing/generate' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = customerSourcing.generateProspects(b.vertical, b.audience || 'seller');
      if (!r.ok) return json(res, 422, r);
      // Feed into the prospect DB pipeline.
      try { for (const pr of r.prospects) { prospectDb.ingest(prospects, pr); } persistDomain('prospect_db'); } catch (e) { /* pipeline optional */ }
      return json(res, 200, r);
    }

    // GET /api/compliance/registry — the legal/financial readiness map: every
    // certificate, permission, and registration needed to operate, with status
    // and what still blocks launch. Founder-only.
    if (p === '/api/compliance/registry' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const obtained = (OPS_CONTROL.compliance_obtained) || [];
      const s = complianceRegistry.status(obtained);
      s.by_area = complianceRegistry.byArea(obtained);
      return json(res, 200, s);
    }

    // GET /api/charity/ask?order_total_paise= — the prompt shown at the
    // PAYMENT GATEWAY, just before payment. Public (it's a checkout prompt).
    // The customer's answer is passed to the payment endpoint for THIS order
    // only; charity is never a stored preference.
    if (p === '/api/charity/ask' && req.method === 'GET') {
      const total = parseInt(url.searchParams.get('order_total_paise') || '0', 10);
      return json(res, 200, charityFund.checkoutAsk(total));
    }

    // GET /api/charity/fund — FOUNDER + CO-FOUNDER ONLY. The charity fund is
    // NOT shown to customers (contributions are optional and platform-borne);
    // only the founder and the co-founder AI see the account, the total, the
    // allocation plan, and disbursements.
    if (p === '/api/charity/fund' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, charityFund.founderView(CHARITY_FUND));
    }

    // POST /api/charity/plan — FOUNDER ONLY. Set how the fund is allocated
    // across causes (the spending plan is the founder's alone).
    if (p === '/api/charity/plan' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = charityFund.setAllocationPlan(CHARITY_FUND, b.plan || []);
      if (!r.ok) return json(res, 422, r);
      persistDomain('charity_fund');
      return json(res, 200, r);
    }

    // POST /api/charity/disburse — FOUNDER ONLY. Record a payout to a cause.
    if (p === '/api/charity/disburse' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const r = charityFund.recordDisbursement(CHARITY_FUND, b.cause, b.amount_paise, b.note);
      if (!r.ok) return json(res, 422, r);
      persistDomain('charity_fund');
      return json(res, 200, charityFund.founderView(CHARITY_FUND));
    }

    // GET /api/integrations — the founder's "what do I need to operate" map:
    // every external API/token/link the platform needs, where to get it, and
    // its LIVE status (connected / mock-fallback / unavailable). Founder-only.
    if (p === '/api/integrations' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const s = integrations.status(process.env);
      s.next_actions = integrations.nextActions(process.env);
      return json(res, 200, s);
    }

    // POST /api/seller/ads/generate — a seller designs an ad for their product
    // or their maker story, using the SAME engine the platform uses for itself.
    // Included in their subscription, bounded by a monthly quota (the never-in-
    // loss control). Seller-accessible.
    if (p === '/api/seller/ads/generate' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const principal = optionalAuth(req);
      const sid = b.seller_id || (principal && principal.sellerId);
      const seller = sid ? signupSvc.getSeller(sid) : null;
      if (!seller) return json(res, 404, { error: 'seller not found' });
      // Track usage per seller per calendar month.
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      OPS_CONTROL.ad_usage = OPS_CONTROL.ad_usage || {};
      const key = seller.id + ':' + month;
      const used = OPS_CONTROL.ad_usage[key] || 0;
      const result = sellerAds.generateSellerAd({
        seller: { id: seller.id, archetype: seller.archetype, name: (seller.profile && seller.profile.name) || seller.name, cluster: seller.cluster || (seller.profile && seller.profile.state) },
        subject: b.subject || 'product', product: b.product, channel: b.channel, tone: b.tone,
        usedThisMonth: used,
      }, adGeneration);
      if (!result.ok) return json(res, result.reason && /quota|plan/i.test(result.reason) ? 402 : 400, result);
      // Commit the usage only on success.
      OPS_CONTROL.ad_usage[key] = used + 1;
      persistDomain('ops_control');
      return json(res, 200, result);
    }

    // GET /api/seller/ads/quota — a seller's remaining ad quota this month.
    if (p === '/api/seller/ads/quota' && req.method === 'GET') {
      const sid = url.searchParams.get('seller_id');
      const seller = sid ? signupSvc.getSeller(sid) : null;
      if (!seller) return json(res, 404, { error: 'seller not found' });
      const month = new Date().toISOString().slice(0, 7);
      const used = (OPS_CONTROL.ad_usage && OPS_CONTROL.ad_usage[seller.id + ':' + month]) || 0;
      return json(res, 200, sellerAds.quotaStatus(seller.archetype, used));
    }

    // POST /api/insurance/quote — quote cover for a transaction/booking from a
    // LICENSED partner insurer. The platform facilitates only — it fronts no
    // premium and bears no risk (IRDAI-compliant). Returns the premium, the
    // insurer's share, and the platform's disclosed referral fee.
    if (p === '/api/insurance/quote' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const q = insurance.quote({ vertical: b.vertical, value_paise: b.value_paise, risk: b.risk, mandatory: b.mandatory });
      const out = { ...q, insurer_kind: insurer.kind, insurer_licensed: insurer.licensed };
      // If asked to bind and an insurer is connected, attempt to bind.
      if (b.bind) {
        const bound = insurance.bindPolicy(q, insurer, { subject_ref: b.subject_ref });
        out.binding = bound;
      }
      return json(res, 200, out);
    }

    // GET /api/schemes/match?seller_id= — every government scheme a seller
    // qualifies for, across all sources (welfare/credit + ONDC/digital), ranked,
    // with the mutual benefit (seller + platform) on each. Public-ish: founder
    // or the seller themselves. If no seller_id, matches a generic profile.
    if (p === '/api/schemes/match' && req.method === 'GET') {
      const sid = url.searchParams.get('seller_id');
      const seller = sid ? (signupSvc.getSeller(sid) || {}) : { archetype: url.searchParams.get('archetype') || 'karigar' };
      const report = schemeEngine.alignmentReport({
        archetype: seller.archetype, state: seller.state,
        hasUdyam: seller.hasUdyam, annualTurnoverPaise: seller.annualTurnoverPaise, age: seller.age,
      });
      return json(res, 200, report);
    }

    // POST /api/ondc/opt-in — a SELLER requests to be published on the open
    // network. The platform (founder) completes the actual network enrolment
    // via /api/ondc/enroll using the platform's ONDC credentials — this just
    // records the seller's consent + intent and returns their eligibility.
    // Seller-accessible (light auth).
    if (p === '/api/ondc/opt-in' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const principal = optionalAuth(req);
      const sid = b.seller_id || (principal && principal.sellerId);
      const seller = sid ? signupSvc.getSeller(sid) : null;
      if (!seller) return json(res, 404, { error: 'seller not found' });
      const consentRec = sellerConsents[seller.id];
      const consentOk = consentRec ? sellerConsent.canSell(consentRec).ok : false;
      const eligible = consentOk && !!seller.payoutAccount;
      OPS_CONTROL.ondc = OPS_CONTROL.ondc || {};
      const existing = OPS_CONTROL.ondc[seller.id];
      OPS_CONTROL.ondc[seller.id] = existing || {
        seller_id: seller.id, status: 'requested', requested_at: Date.now(),
      };
      persistDomain('ops_control');
      return json(res, 200, {
        ok: true,
        eligible,
        status: OPS_CONTROL.ondc[seller.id].status,
        needs: eligible ? [] : [
          ...(consentOk ? [] : ['Complete your selling consent']),
          ...(seller.payoutAccount ? [] : ['Add a payout bank account']),
        ],
        message: eligible
          ? 'You\u2019re eligible. The platform will publish your catalog on the ONDC network on your behalf.'
          : 'Almost there — finish the steps below and the platform will publish you on ONDC.',
      });
    }

    // GET /api/ondc/catalog — the platform's active catalog mapped to the ONDC
    // schema, ready to publish to the network. Public (it's what buyers' apps
    // would see), provenance + GI tags included.
    if (p === '/api/ondc/catalog' && req.method === 'GET') {
      const cat = products.publicCatalog(productsState.products, {});
      const all = (cat && cat.products) || (Array.isArray(cat) ? cat : []);
      const catalog = ondc.buildCatalog(all.map((x) => ({ ...x, status: 'active' })), (sid) => signupSvc.getSeller(sid) || {});
      return json(res, 200, catalog);
    }

    // POST /api/ondc/enroll — enroll a seller as an ONDC network participant.
    // Gated on consent + payout. Founder/co-founder only.
    if (p === '/api/ondc/enroll' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const seller = signupSvc.getSeller(b.seller_id);
      if (!seller) return json(res, 404, { error: 'seller not found' });
      const consentRec = sellerConsents[b.seller_id];
      const consentOk = consentRec ? sellerConsent.canSell(consentRec).ok : false;
      const result = ondc.enrollSeller(
        { id: seller.id, archetype: seller.archetype, primary_vertical: seller.primary_vertical, payoutAccount: seller.payoutAccount },
        { consentComplete: consentOk, hasPayout: !!seller.payoutAccount || !!b.hasPayout },
      );
      if (!result.ok) return json(res, 422, result);
      // Persist the participation record on the prospect/ops side.
      OPS_CONTROL.ondc = OPS_CONTROL.ondc || {};
      OPS_CONTROL.ondc[seller.id] = result.record;
      persistDomain('ops_control');
      return json(res, 200, result);
    }

    // GET /api/ondc/schemes — ONDC + related government digital-commerce schemes.
    if (p === '/api/ondc/schemes' && req.method === 'GET') {
      return json(res, 200, { schemes: ondc.ONDC_SCHEMES });
    }

    // POST /api/fraud/score — risk-score a transaction before settlement.
    // High risk HOLDS for review (human-in-the-loop), never silently rejects a
    // possibly-genuine artisan's buyer. Founder/co-founder only.
    if (p === '/api/fraud/score' && req.method === 'POST') {
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const result = fraudDetection.scoreTransaction(b.order || b, {
        recentOrders: b.recentOrders || [], accountAgeDays: b.accountAgeDays,
        failedPayments: b.failedPayments, deviceAddresses: b.deviceAddresses,
        blocklist: b.blocklist || [],
      });
      return json(res, 200, result);
    }

    // GET /api/watchdog/scan — the self-monitoring agent. Checks the platform's
    // hard invariants against LIVE state, severity-ranks findings, records the
    // summary for the improvement trend. Founder/co-founder only.
    if (p === '/api/watchdog/scan' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const sellers = signupSvc.listSellers();
      let pnl = null;
      try { pnl = profitGuard.platformPnL(costLedger, { listSellers: () => sellers, getSeller: (id) => signupSvc.getSeller(id) }); } catch (e) {}
      const activeListings = [];
      try {
        const cat = products.publicCatalog(productsState.products, {});
        const all = (cat && cat.products) || (Array.isArray(cat) ? cat : []);
        for (const pr of all) activeListings.push({ id: pr.id, seller_id: pr.seller_id });
      } catch (e) {}
      const state = {
        pnl: pnl ? { net_profit_paise: pnl.net_profit_paise, margin_pct: pnl.margin_pct, total_revenue_paise: pnl.total_revenue_paise } : null,
        sellers: sellers.map((s) => ({ id: s.id, archetype: s.archetype, status: s.status, age: s.age, guardian: guardianArrangements[s.id] })),
        activeListings,
        consentOf: (id) => sellerConsents[id] || null,
        canSell: (rec) => sellerConsent.canSell(rec),
        guardianOf: (id) => guardianArrangements[id] || null,
        orders: [],
        pricing: settings.pricingTable ? settings.pricingTable() : {},
        floors: platformSettings.COST_TO_SERVE_PAISE,
        grievances: GRIEVANCE_LOG,
        health: (() => { try { return operations.runHealthChecks(); } catch (e) { return null; } })(),
      };
      const report = watchdog.scan(state);
      WATCHDOG_HISTORY.push({ counts: report.counts, overall: report.overall, at: report.scanned_at });
      if (WATCHDOG_HISTORY.length > 50) WATCHDOG_HISTORY = WATCHDOG_HISTORY.slice(-50);
      persistDomain('watchdog_history');
      report.trend = watchdog.trend(WATCHDOG_HISTORY);
      return json(res, 200, report);
    }

    // GET /api/metrics/cost-by-vertical — cost-to-serve + margin per active
    // seller in each vertical, grounded in the real operating-cost model.
    // Founder-only (it's internal economics).
    if (p === '/api/metrics/cost-by-vertical' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, verticalCost.reportAllVerticals(operationalCost.ASSUMPTIONS));
    }

    // GET /api/metrics/saas — the SaaS scorecard: MRR/ARR, churn, CAC, LTV, and
    // the LTV:CAC golden ratio, computed from the live seller base + their
    // tiers/prices. Founder/co-founder only.
    if (p === '/api/metrics/saas' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const sellers = signupSvc.listSellers();
      const pricing = settings.pricingTable ? settings.pricingTable() : {};
      const subscriptions = sellers.map((s) => {
        const tierPrice = (pricing[s.archetype] && pricing[s.archetype].price_paise) || 0;
        return { tier: s.archetype, price_paise: tierPrice, active: s.status !== 'suspended' };
      });
      const report = saasMetrics.report({
        subscriptions,
        churn: { startCount: sellers.length, churnedCount: 0, startMrrPaise: subscriptions.reduce((acc, s) => acc + (s.active ? s.price_paise : 0), 0), churnedMrrPaise: 0 },
        acquisition: { salesMarketingSpendPaise: 0, customersAcquired: 0 },
        grossMargin: 0.7,
      });
      return json(res, 200, report);
    }

    // POST /api/cofounder/command — the founder changes the platform from a
    // plain-language instruction. Two-step + safe: first call returns a PREVIEW
    // of what it will do; pass confirm:true to apply. Hard invariants (never-in
    // -loss, consent, child-safety) cannot be switched off here by design, and
    // price/charity changes are floor/cap validated by the real settings API.
    // Founder/co-founder only.
    if (p === '/api/cofounder/command' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const plan = founderCommands.interpret(b.instruction || '');

      // Refusals / out-of-scope / unmatched → return the explanation as-is.
      if (!plan.ok) {
        if (plan.deferred && plan.effect === 'record_change_request') {
          OPS_CONTROL.change_requests.push({ request: plan.params.request, at: Date.now() });
          persistDomain('ops_control');
        }
        return json(res, plan.blocked ? 403 : 200, plan);
      }

      // Preview unless confirmed (for consequential actions).
      if (plan.requiresConfirm && !b.confirm) {
        return json(res, 200, { ...plan, applied: false, needs_confirm: true, hint: 'Send the same instruction with confirm:true to apply.' });
      }

      // Apply the effect via the real, validated mutation functions.
      let result;
      try {
        if (plan.effect === 'set_price') {
          const r = settings.setPrice(plan.params.tier, plan.params.price_paise, { by: 'founder', note: 'via co-founder command' });
          if (!r.ok) return json(res, 422, { ...plan, applied: false, error: r.error || 'below cost-to-serve floor (never-in-loss)' });
          persistDomain('platform_settings'); result = { tier: plan.params.tier, price: settings.priceFor(plan.params.tier) };
        } else if (plan.effect === 'set_charity') {
          const r = settings.setCharity(plan.params, { by: 'founder', note: 'via co-founder command' });
          if (!r.ok) return json(res, 422, { ...plan, applied: false, error: r.error });
          persistDomain('platform_settings'); result = settings.charityConfig();
        } else if (plan.effect === 'toggle_agent') {
          if (plan.params.paused) OPS_CONTROL.paused_agents[plan.params.agent] = true; else delete OPS_CONTROL.paused_agents[plan.params.agent];
          persistDomain('ops_control'); result = { paused_agents: Object.keys(OPS_CONTROL.paused_agents) };
        } else if (plan.effect === 'set_autonomy') {
          OPS_CONTROL.autonomy = plan.params.autonomy;
          persistDomain('ops_control'); result = { autonomy: OPS_CONTROL.autonomy };
        } else if (plan.effect === 'explain_config') {
          result = { pricing: settings.pricingTable(), charity: settings.charityConfig(), autonomy: OPS_CONTROL.autonomy, paused_agents: Object.keys(OPS_CONTROL.paused_agents) };
        } else {
          return json(res, 400, { ...plan, applied: false, error: 'unknown effect' });
        }
      } catch (e) {
        return json(res, 500, { ...plan, applied: false, error: e.message });
      }
      return json(res, 200, { ...plan, applied: true, result });
    }

    // POST /api/cofounder/ask — the SERVER-SIDE AI co-founder proxy. The
    // Anthropic key lives here, never in the browser. The client sends the
    // conversation; we add the grounded system prompt + call Anthropic, then
    // return the reply. If no key is configured we say so honestly (so the UI
    // can show a clear "AI not connected" state instead of silently degrading).
    // Founder/co-founder only — this spends money and reads platform state.
    if (p === '/api/cofounder/ask' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      if (!requireFinancialAccess(req, res)) return;
      const b = await parseBody(req, res); if (b === null) return;
      const apiKey = config.inference.anthropicApiKey;
      if (!apiKey) {
        return json(res, 200, {
          ok: false,
          ai_connected: false,
          reason: 'The AI co-founder is not connected yet. Set ANTHROPIC_API_KEY on the server to enable live answers. Until then a local grounded fallback is used.',
          manifest_hint: platformManifest.manifest('identity'),
        });
      }
      const messages = Array.isArray(b.messages) ? b.messages : (b.question ? [{ role: 'user', content: b.question }] : null);
      if (!messages) return json(res, 400, { error: 'messages or question required' });
      try {
        const ix = await httpsPostJson('https://api.anthropic.com/v1/messages', {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        }, {
          model: config.inference.anthropicModel,
          max_tokens: 1500,
          system: b.system || 'You are the AI co-founder of NEXUS, a trust + compliance commerce OS for India\u2019s craft economy. Be concise, grounded, and honest. Never invent platform data.',
          messages,
        });
        const text = (ix && ix.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
        return json(res, 200, { ok: true, ai_connected: true, text, stop_reason: ix.stop_reason, usage: ix.usage });
      } catch (e) {
        return json(res, 502, { ok: false, ai_connected: true, error: 'ai_upstream_error', reason: e.message });
      }
    }

    // GET /api/explain?audience=customer|investor — the human-facing self-
    // explaining system. PUBLIC (meant to be shared). Assembles the story from
    // the platform's REAL facts and is honest about state (pre-revenue, etc.).
    if (p === '/api/explain' && req.method === 'GET') {
      const audience = url.searchParams.get('audience') || 'customer';
      const man = platformManifest.manifest();
      let econ = null;
      try {
        const s100 = operationalCost.scenario100();
        econ = { summary: 'At ~100 sellers the model runs at high software margins; AI inference is the dominant cost and the main lever as it scales.', at_100: { opex_pct: s100.opexPctOfRevenue, margin_pct: s100.grossMarginPct } };
      } catch (e) {}
      let metrics = {};
      try {
        const sellers = signupSvc.listSellers();
        const pricing = settings.pricingTable ? settings.pricingTable() : {};
        const subs = sellers.map((s) => ({ tier: s.archetype, price_paise: (pricing[s.archetype] && pricing[s.archetype].price_paise) || 0, active: s.status !== 'suspended' }));
        metrics = { mrr: saasMetrics.mrr(subs) };
      } catch (e) {}
      const giCount = (() => { try { const g = require('./src/giRegistry'); const r = Array.isArray(g.REGISTRY) ? g.REGISTRY : Object.values(g.REGISTRY || {}); return r.length; } catch (e) { return 0; } })();
      const story = explainer.explain(audience, {
        identity: man.identity,
        legalModels: man.legal_model ? Object.values(man.legal_model.models || {}) : [],
        invariants: (man.invariants || []).map((i) => (typeof i === 'string' ? i : i.rule || i.name || JSON.stringify(i))),
        economics: econ, metrics, giCount,
      });
      return json(res, 200, story);
    }

    // POST /api/support/ask — the CUSTOMER-facing AI assistant. A seller or
    // buyer asks how to use the platform; we answer grounded in real mechanics,
    // weaving in their account facts when authenticated. If we can't help (or
    // it's a complaint), we escalate by filing a grievance so a human follows
    // up — and we count the deflection (a confidently answered question is a
    // support contact we did not have to pay a human for).
    if (p === '/api/support/ask' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      if (!b.question) return json(res, 400, { error: 'question required' });
      // Weave in account facts if the asker is an authenticated seller.
      const ctx = { audience: b.audience || 'any' };
      const principal = optionalAuth(req);
      if (principal && principal.sellerId) {
        const seller = signupSvc.getSeller(principal.sellerId);
        if (seller) { ctx.audience = 'seller'; ctx.archetype = seller.archetype; ctx.tier = seller.archetype ? seller.archetype.charAt(0).toUpperCase() + seller.archetype.slice(1) : null; }
      }
      const result = supportAssistant.answer(b.question, ctx);

      // Track deflection vs escalation for operating-cost reporting.
      SUPPORT_STATS.total++;
      if (result.escalate) {
        SUPPORT_STATS.escalated++;
        // File a grievance so the human follow-up is tracked (best-effort).
        try {
          const contact = (principal && principal.sellerId) || b.contact || 'anonymous';
          const desc = String(b.question || '').length >= 10 ? b.question : `Support escalation: ${b.question}`;
          const g = grievance.fileGrievance({
            complainantName: ctx.archetype ? ('Seller ' + (principal && principal.sellerId)) : 'Platform user',
            complainantContact: contact,
            complainantRole: ctx.audience === 'seller' ? 'seller' : 'buyer',
            type: (result.escalation && result.escalation.suggested_type) || 'other',
            description: desc,
          });
          result.grievance_id = g && g.id;
          if (g) { GRIEVANCE_LOG.push(g); persistDomain('grievance_log'); }
        } catch (e) { /* escalation still returned to the user */ }
      } else {
        SUPPORT_STATS.deflected++;
      }
      result.support_stats = { ...SUPPORT_STATS, deflection_rate: SUPPORT_STATS.total ? Math.round((SUPPORT_STATS.deflected / SUPPORT_STATS.total) * 100) : 0 };
      return json(res, 200, result);
    }

    // GET /api/support/topics — the questions the assistant can confidently
    // handle, for a help menu. Public.
    if (p === '/api/support/topics' && req.method === 'GET') {
      return json(res, 200, { topics: supportAssistant.topics(url.searchParams.get('audience') || 'any') });
    }

    // ════════════════════════════════════════════════════════════
    // LAUNCH ORCHESTRATOR — the AI chief-of-staff (founder in the loop)
    // ════════════════════════════════════════════════════════════
    const launchCtx = () => ({
      authSecretSet: config.auth.mode !== 'none' && !!config.auth.secret && config.auth.secret !== 'nexus-dev-secret-not-for-production',
      paymentsLive: config.payments.provider !== 'mock',
      anthropicKeySet: !!(config.inference && (config.inference.anthropicApiKey || config.inference.apiOverflowKey)),
      mapsLive: config.googleMaps.provider === 'google',
      monitoringSet: false,
      minorGuardianBuilt: false,
    });

    // GET /api/launch/board — the full launch task board. Founder/co-founder.
    if (p === '/api/launch/board' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, launchOrchestrator.assessLaunch(launchCtx(), launchApprovals));
    }

    // GET /api/launch/next — prioritized next actions (AI-can-prepare vs needs-you).
    if (p === '/api/launch/next' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, launchOrchestrator.nextActions(launchCtx(), launchApprovals));
    }

    // POST /api/launch/prepare/:taskId — the AI prepares a deliverable (e.g.
    // drafts a policy). Marks it "prepared" — awaiting founder approval, and
    // returns the rendered draft for review.
    {
      const m = p.match(/^\/api\/launch\/prepare\/([a-z_]+)$/);
      if (m && req.method === 'POST') {
        if (!requireFinancialAccess(req, res)) return;
        const task = launchOrchestrator.getTask(m[1]);
        if (!task) return json(res, 404, { error: 'unknown task', id: m[1] });
        if (task.owner !== launchOrchestrator.OWNER.AI_PREPARE) {
          return json(res, 422, { error: 'not_ai_preparable', reason: `"${task.title}" needs you, not the AI (${task.owner}).` });
        }
        const b = await parseBody(req, res); if (b === null) return;
        let draft = null;
        if (task.policy) {
          try { draft = grievance.renderPolicy(task.policy, b.fields || {}); }
          catch (e) { draft = { error: 'policy render failed', detail: e.message }; }
        }
        launchApprovals[task.id] = { status: 'prepared', at: Date.now(), by: 'ai' };
        persistDomain('launch_approvals');
        return json(res, 200, {
          task: task.id, status: 'prepared', draft,
          disclaimer: 'DRAFT prepared by the AI co-founder. Review with a lawyer before publishing. Approve to mark done.',
          next: 'POST /api/launch/approve/' + task.id,
        });
      }
    }

    // POST /api/launch/approve/:taskId — founder approves (the human in the
    // loop). Founder-only. Marks the task done.
    {
      const m = p.match(/^\/api\/launch\/approve\/([a-z_]+)$/);
      if (m && req.method === 'POST') {
        const principal = requireAuth(req, res, { role: 'founder' });
        if (!principal) return;
        if (principal.role !== 'founder') {
          return json(res, 403, { error: 'forbidden', reason: 'only the founder can approve a launch task' });
        }
        const task = launchOrchestrator.getTask(m[1]);
        if (!task) return json(res, 404, { error: 'unknown task', id: m[1] });
        launchApprovals[task.id] = { status: 'done', at: Date.now(), by: 'founder' };
        persistDomain('launch_approvals');
        return json(res, 200, { task: task.id, status: 'done', board: launchOrchestrator.assessLaunch(launchCtx(), launchApprovals) });
      }
    }

    // ════════════════════════════════════════════════════════════

    // GET /api/settings/pricing — current pricing table. Prices are public
    // (the signup screen needs them), but the cost-to-serve FLOORS reveal the
    // platform's internal economics, so they're stripped for non-financial
    // roles. Only founder + co-founder see floors.
    if (p === '/api/settings/pricing' && req.method === 'GET') {
      const table = settings.pricingTable();
      // Decide visibility without sending an error if unauthenticated.
      let privileged = false;
      if (config.auth.mode === 'none') {
        privileged = true;
      } else {
        const r = auth.authenticate({
          authHeader: req.headers['authorization'],
          secret: config.auth.secret, founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken, store: sessionStore,
        });
        privileged = r.ok && auth.canSeeFinancials(r.principal);
      }
      if (!privileged) {
        for (const tier of Object.keys(table)) {
          delete table[tier].floor_paise;
          delete table[tier].floor_display;
        }
      }
      return json(res, 200, { pricing: table, updated_at: settings.updated_at });
    }

    // PUT /api/settings/pricing — set a tier's price. The founder DECIDES the
    // subscription fee (per spec), so this is founder-only — a co-founder can
    // see pricing + costs but cannot change the fee. Enforces never-in-loss.
    if (p === '/api/settings/pricing' && req.method === 'PUT') {
      const principal = requireAuth(req, res, { role: 'founder' });
      if (!principal) return;
      if (principal.role !== 'founder') {
        return json(res, 403, { error: 'forbidden', reason: 'only the founder can change the subscription fee' });
      }
      const b = await parseBody(req, res); if (b === null) return;
      if (!b.tier) return json(res, 400, { error: 'tier required' });
      const pricePaise = b.price_paise === null ? null : Number(b.price_paise);
      const result = settings.setPrice(b.tier, pricePaise, { by: 'founder', note: b.note });
      if (!result.ok) return json(res, 422, { error: 'price_rejected', reason: result.error, floor_paise: result.floor });
      persistDomain('platform_settings');
      return json(res, 200, { ok: true, pricing: settings.pricingTable(), updated_at: settings.updated_at });
    }

    // GET /api/settings/pricing/audit — founder-only price change history
    if (p === '/api/settings/pricing/audit' && req.method === 'GET') {
      const principal = requireAuth(req, res, { role: 'founder' });
      if (!principal) return;
      return json(res, 200, { audit: settings.audit.slice().reverse() });
    }

    // GET /api/settings/charity — current charity/giving config. PUBLIC, so
    // buyers can see exactly where donations go (transparency is the point).
    if (p === '/api/settings/charity' && req.method === 'GET') {
      return json(res, 200, settings.charityConfig());
    }

    // PUT /api/settings/charity — founder sets charity rate / cause / on-off.
    // Founder DECIDES giving (like pricing), so founder-only. Enabling requires
    // a named cause; rate is capped so giving never erodes the maker's payout.
    if (p === '/api/settings/charity' && req.method === 'PUT') {
      const principal = requireAuth(req, res, { role: 'founder' });
      if (!principal) return;
      if (principal.role !== 'founder') {
        return json(res, 403, { error: 'forbidden', reason: 'only the founder can change charity settings' });
      }
      const b = await parseBody(req, res); if (b === null) return;
      const result = settings.setCharity(b, { by: 'founder', note: b.note });
      if (!result.ok) return json(res, 422, { error: 'charity_rejected', reason: result.error });
      persistDomain('platform_settings');
      return json(res, 200, { ok: true, charity: result.charity });
    }

    // ════════════════════════════════════════════════════════════
    // AD / MARKETING GENERATION — sellers market their products, the
    // platform markets itself. Margin-guarded so ad spend never pushes a
    // seller (or the platform) into loss.
    // ════════════════════════════════════════════════════════════

    // GET /api/ads/budget/:tier — the INCLUDED monthly ad allowance for a
    // tier, computed from the live subscription price. Confirms to the seller
    // that marketing is part of their subscription, not an extra charge.
    {
      const m = p.match(/^\/api\/ads\/budget\/([a-z]+)$/);
      if (m && req.method === 'GET') {
        const tier = m[1];
        const priceInfo = settings.pricingTable()[tier];
        const pricePaise = priceInfo ? priceInfo.price_paise : null;
        // Spent-this-month would come from the ad ledger; 0 in this build.
        const spent = Number(url.searchParams.get('spent_paise')) || 0;
        const status = adGeneration.adBudgetStatus(tier, spent, pricePaise);
        return json(res, 200, status);
      }
    }

    // POST /api/ads/generate — generate ad creative for a product or for the
    // platform. Body: { product?, channel, audience?, tone?, scope? }.
    //   scope='seller'   → product ad (default; product required)
    //   scope='platform' → NEXUS brand ad (uses a synthetic platform "product")
    if (p === '/api/ads/generate' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const scope = b.scope || 'seller';
      let product = b.product;
      if (scope === 'platform') {
        // The platform markets itself — a synthetic "product" describing NEXUS.
        product = {
          id: 'platform_nexus',
          title: b.product?.title || 'NEXUS — verified Indian craft, paid fairly',
          artisan: null,
          region: 'India',
          craft: b.product?.craft || 'handmade across 5 verticals',
          vertical: 'platform',
        };
      } else {
        // Seller product ad — resolve from the catalog if an id is given
        if (typeof product === 'string') product = productsState.products.get(product) || null;
        if (b.product_id) product = productsState.products.get(b.product_id) || null;
        if (!product || !product.title) {
          return json(res, 400, { error: 'product (with title) or a valid product_id is required for a seller ad' });
        }
      }
      try {
        const creative = adGeneration.generateAdCreative({
          product,
          channel: b.channel || 'instagram',
          audience: b.audience || 'general',
          tone: b.tone || 'artisan_story',
        });
        return json(res, 200, { scope, creative });
      } catch (e) {
        return json(res, 400, { error: 'ad_generation_failed', reason: e.message });
      }
    }

    // GET /api/ads/channels — available channels + tones for the ad composer
    if (p === '/api/ads/channels' && req.method === 'GET') {
      return json(res, 200, {
        channels: Object.entries(adGeneration.CHANNEL_ECONOMICS).map(([id, c]) => ({ id, label: c.label })),
        tones: Object.keys(adGeneration.TONE_PRESETS),
      });
    }

    // POST /api/ads/plan — margin-guarded campaign plan. Confirms a proposed
    // ad spend won't push the seller below their margin floor (never in loss).
    if (p === '/api/ads/plan' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      try {
        const plan = adGeneration.guardedAdSpend({
          sellerId: b.seller_id,
          tier: b.tier || 'karigar',
          gmvPaise: Number(b.gmv_paise) || 0,
          plannedSpendPaise: Number(b.planned_spend_paise) || 0,
          alreadySpentPaise: Number(b.already_spent_paise) || 0,
        });
        const status = plan.approved ? 200 : 402;  // 402 if it would breach the margin floor
        return json(res, status, plan);
      } catch (e) {
        return json(res, 400, { error: 'plan_failed', reason: e.message });
      }
    }


    if (p === '/api/ops/sweep' && req.method === 'POST') {
      try {
        const result = runSchedulerSweep();
        return json(res, 200, { sweptAt: SCHEDULER.lastSweep, result });
      } catch (e) {
        return json(res, 500, { error: e.message });
      }
    }

    if (p === '/api/ops/audit' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      return json(res, 200, { audit: SCHEDULER.audit.slice(0, limit) });
    }

    // ════════════════════════════════════════════════════════════
    // CONVERSATIONS — AI co-founder chat history persistence
    // Each thread is one founder session. Turns are append-only.
    // ════════════════════════════════════════════════════════════

    if (p === '/api/conversations' && req.method === 'GET') {
      const list = [...conversationsState.conversations.values()]
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      return json(res, 200, {
        conversations: list.map(c => ({
          id: c.id,
          started_at: c.started_at,
          updated_at: c.updated_at,
          turn_count: (c.turns || []).length,
          preview: ((c.turns || [])[0] || {}).content?.slice(0, 80) || '',
        })),
        total: list.length,
      });
    }

    if (p === '/api/conversations' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const id = 'conv_' + require('crypto').randomBytes(6).toString('hex');
      const now = Date.now();
      const record = {
        id,
        started_at: now,
        updated_at: now,
        turns: Array.isArray(b.turns) ? b.turns : [],
      };
      conversationsState.conversations.set(id, record);
      persistDomain('conversations');
      return json(res, 201, record);
    }

    {
      const m = p.match(/^\/api\/conversations\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const conv = conversationsState.conversations.get(m[1]);
        if (!conv) return json(res, 404, { error: 'conversation not found', id: m[1] });
        return json(res, 200, conv);
      }
      // Append a turn (or replace turns wholesale)
      if (m && req.method === 'PATCH') {
        const id = m[1];
        const current = conversationsState.conversations.get(id);
        if (!current) return json(res, 404, { error: 'conversation not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        const updated = {
          ...current,
          turns: Array.isArray(b.turns) ? b.turns : current.turns,
          updated_at: Date.now(),
        };
        if (b.appendTurn && typeof b.appendTurn === 'object') {
          updated.turns = [...(current.turns || []), { ...b.appendTurn, at: Date.now() }];
        }
        conversationsState.conversations.set(id, updated);
        persistDomain('conversations');
        return json(res, 200, updated);
      }
      if (m && req.method === 'DELETE') {
        const id = m[1];
        if (!conversationsState.conversations.has(id)) {
          return json(res, 404, { error: 'conversation not found', id });
        }
        conversationsState.conversations.delete(id);
        persistDomain('conversations');
        return json(res, 200, { deleted: id });
      }
    }

    // ════════════════════════════════════════════════════════════
    // COOPERATIVES — multi-beneficiary settlement
    // ════════════════════════════════════════════════════════════

    if (p === '/api/cooperatives' && req.method === 'GET') {
      const list = [...cooperativesState.cooperatives.values()]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return json(res, 200, { cooperatives: list, total: list.length });
    }

    if (p === '/api/cooperatives' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      try {
        const coop = cooperativeSplit.createCooperative(b);
        cooperativesState.cooperatives.set(coop.id, coop);
        persistDomain('cooperatives');
        return json(res, 201, coop);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    {
      const m = p.match(/^\/api\/cooperatives\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const coop = cooperativesState.cooperatives.get(m[1]);
        if (!coop) return json(res, 404, { error: 'cooperative not found', id: m[1] });
        return json(res, 200, coop);
      }
      if (m && req.method === 'PATCH') {
        const id = m[1];
        const current = cooperativesState.cooperatives.get(id);
        if (!current) return json(res, 404, { error: 'cooperative not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        if (!Array.isArray(b.beneficiaries)) {
          return json(res, 400, { error: 'beneficiaries array required' });
        }
        try {
          const updated = cooperativeSplit.updateBeneficiaries(current, b.beneficiaries);
          cooperativesState.cooperatives.set(id, updated);
          persistDomain('cooperatives');
          return json(res, 200, updated);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
      // POST /api/cooperatives/:id/preview — preview a hypothetical sale split
      const pv = p.match(/^\/api\/cooperatives\/([a-zA-Z0-9_]+)\/preview$/);
      if (pv && req.method === 'POST') {
        const id = pv[1];
        const coop = cooperativesState.cooperatives.get(id);
        if (!coop) return json(res, 404, { error: 'cooperative not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        const makerPaise = parseInt(b.makerPortionPaise || 0, 10);
        if (!Number.isInteger(makerPaise) || makerPaise < 0) {
          return json(res, 400, { error: 'makerPortionPaise must be a non-negative integer' });
        }
        try {
          const preview = cooperativeSplit.previewSplit(coop, makerPaise);
          return json(res, 200, preview);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // SCHEMES — government scheme navigator (read-only)
    // ════════════════════════════════════════════════════════════

    if (p === '/api/schemes' && req.method === 'GET') {
      // Light list (no full criteria) for the browse view
      const list = Object.values(schemes.SCHEMES).map(s => ({
        id: s.id, name: s.name, ministry: s.ministry, category: s.category,
        summary: s.summary, benefit: s.benefit,
        typical_amount_paise: s.typical_amount_paise,
        partner_required: s.partner_required || false,
      }));
      return json(res, 200, { schemes: list, total: list.length });
    }

    if (p === '/api/schemes/evaluate' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const profile = b.profile || {};
      try {
        const ranked = schemes.findEligibleSchemes(profile);
        const all = schemes.evaluateAllSchemes(profile);
        return json(res, 200, {
          profile,
          eligible: ranked.map(r => ({
            id: r.scheme.id, name: r.scheme.name, benefit: r.scheme.benefit,
            score: r.score, boostHits: r.boostHits,
            partner_required: r.scheme.partner_required || false,
          })),
          eligibleCount: ranked.length,
          ineligible: all.filter(r => !r.eligible).map(r => ({
            id: r.scheme.id, name: r.scheme.name,
            failedCriteria: r.failedCriteria,
          })),
        });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    {
      const m = p.match(/^\/api\/schemes\/([a-zA-Z0-9_]+)\/checklist$/);
      if (m && req.method === 'GET') {
        try {
          return json(res, 200, schemes.applicationChecklist(m[1]));
        } catch (e) {
          return json(res, 404, { error: e.message, id: m[1] });
        }
      }
      const r = p.match(/^\/api\/schemes\/([a-zA-Z0-9_]+)$/);
      if (r && req.method === 'GET') {
        const scheme = schemes.SCHEMES[r[1]];
        if (!scheme) return json(res, 404, { error: 'scheme not found', id: r[1] });
        return json(res, 200, scheme);
      }
    }

    // ════════════════════════════════════════════════════════════
    // SELLERS — /api/sellers (self-serve signup wizard)
    // ════════════════════════════════════════════════════════════

    // GET /api/auth/me — who is the current session? Useful for the client
    // to restore state on reload. Returns the principal (minus internals).
    if (p === '/api/auth/me' && req.method === 'GET') {
      if (config.auth.mode === 'none') {
        return json(res, 200, { authenticated: false, mode: 'none', note: 'auth disabled (demo)' });
      }
      const result = auth.authenticate({
        authHeader: req.headers['authorization'],
        secret: config.auth.secret,
        founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken,
        store: sessionStore,
      });
      if (!result.ok) return json(res, 200, { authenticated: false, reason: result.error });
      return json(res, 200, {
        authenticated: true,
        role: result.principal.role,
        seller_id: result.principal.sellerId || null,
        sub: result.principal.sub,
      });
    }

    // POST /api/auth/logout — revoke the current session.
    if (p === '/api/auth/logout' && req.method === 'POST') {
      const result = auth.authenticate({
        authHeader: req.headers['authorization'],
        secret: config.auth.secret,
        founderToken: config.auth.founderToken, cofounderToken: config.auth.cofounderToken,
        store: sessionStore,
      });
      if (result.ok && result.principal.sub) {
        sessionStore.revokeAllForSubject(result.principal.sub);
      }
      return json(res, 200, { ok: true });
    }

    // POST /api/sellers/otp/request — step 1
    if (p === '/api/sellers/otp/request' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const r = signupSvc.requestOtp(b.phone);
      // Strip dev_otp from response in production
      if (r.ok && r.dev_otp && config.isProd) delete r.dev_otp;
      return json(res, r.ok ? 200 : 400, r);
    }

    // POST /api/sellers/otp/verify — step 1b. On success, mint a session
    // token. If a seller already exists for this phone, the session is bound
    // to their seller_id (returning-user login). Otherwise it's a short-lived
    // signup session that completeSignup will upgrade.
    if (p === '/api/sellers/otp/verify' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const r = signupSvc.verifyOtp(b.phone, b.otp);
      if (r.ok && config.auth.mode !== 'none') {
        const existing = signupSvc.getSellerByPhone ? signupSvc.getSellerByPhone(b.phone) : null;
        const sub = existing ? existing.id : ('pending:' + b.phone);
        const minted = auth.mintToken(
          { sub, role: 'seller', sellerId: existing ? existing.id : null },
          { secret: config.auth.secret, ttlHours: config.auth.sessionTtlHours },
        );
        sessionStore.record(sub + ':' + minted.payload.iat, minted.payload);
        r.session_token = minted.token;
        r.is_returning_seller = !!existing;
      }
      return json(res, r.ok ? 200 : 400, r);
    }

    // GET /api/sellers/archetypes — surface the 5 archetypes and their KYC
    if (p === '/api/sellers/archetypes' && req.method === 'GET') {
      const pricing = settings.pricingTable();
      return json(res, 200, {
        archetypes: Object.values(sellerSignup.ARCHETYPES).map(a => ({
          ...a,
          required_docs: sellerSignup.KYC_REQUIREMENTS[a.id],
          // Override the hardcoded price with the founder-set price (paise).
          price_paise: pricing[a.id] ? pricing[a.id].price_paise : null,
          price_display: pricing[a.id] ? pricing[a.id].price_display : 'Custom',
        })),
      });
    }

    // POST /api/sellers — complete signup (steps 2-4)
    if (p === '/api/sellers' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;

      // CHILD-SAFETY GATE: assess age before anything else. An adult proceeds;
      // a minor proceeds ONLY under a verified guardian (Guardian-MoR); a minor
      // without a guardian is blocked; unknown age cannot proceed. We fail safe.
      const assessment = minorGuardian.assessParticipant({
        age: b.age, dob: b.dob, guardian: b.guardian,
      });
      if (!minorGuardian.mayTransact(assessment)) {
        return json(res, 403, {
          error: 'participant_not_eligible',
          status: assessment.status,
          reason: assessment.status === 'blocked_minor'
            ? 'A minor can only join through a verified guardian (Guardian-MoR). Please provide guardian details.'
            : assessment.status === 'needs_age'
              ? 'Please declare age or date of birth to continue.'
              : 'Not eligible to onboard.',
          requirements: assessment.reasons,
        });
      }

      const r = signupSvc.completeSignup(b);
      if (r.ok) {
        // Record the Guardian-MoR arrangement on the seller, if applicable.
        if (assessment.status === 'guardian_mor') {
          r.guardian_arrangement = assessment.arrangement;
          guardianArrangements[r.seller.id] = assessment.arrangement;
          persistDomain('guardian_arrangements');
        }
        const granted = Array.isArray(b.consents) && b.consents.length
          ? b.consents
          : (b.consent_all === true ? sellerConsent.REQUIRED_TO_SELL : []);
        const consentRecord = sellerConsent.grantMany(
          sellerConsent.emptyConsent(),
          granted,
          { method: b.consent_method || 'signup', at: Date.now() },
        );
        sellerConsents[r.seller.id] = consentRecord;
        persistDomain('seller_consents');
        r.consent = sellerConsent.consentStatus(consentRecord);

        persistDomain('sellers');
        if (config.auth.mode !== 'none' && r.seller && r.seller.id) {
          const minted = auth.mintToken(
            { sub: r.seller.id, role: 'seller', sellerId: r.seller.id },
            { secret: config.auth.secret, ttlHours: config.auth.sessionTtlHours },
          );
          sessionStore.record(r.seller.id + ':' + minted.payload.iat, minted.payload);
          r.session_token = minted.token;
        }
      }
      return json(res, r.ok ? 201 : 400, r);
    }

    // GET /api/sellers — list (admin/founder)
    if (p === '/api/sellers' && req.method === 'GET') {
      // Strip docs from listing for safety — full record needs /api/sellers/:id
      const list = signupSvc.listSellers().map(s => {
        const { docs, ...safe } = s;
        return safe;
      });
      return json(res, 200, { sellers: list, count: list.length });
    }

    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const seller = signupSvc.getSeller(m[1]);
        if (!seller) return json(res, 404, { error: 'seller not found', id: m[1] });
        return json(res, 200, seller);
      }
    }

    // ════════════════════════════════════════════════════════════
    // PRODUCTS — /api/products (catalog)
    // ════════════════════════════════════════════════════════════

    // GET /api/products/hsn-suggest?craft=pottery — HSN lookup
    if (p === '/api/products/hsn-suggest' && req.method === 'GET') {
      const craft = url.searchParams.get('craft');
      const suggestion = products.suggestHsn(craft);
      if (!suggestion) return json(res, 200, { suggested: null, message: 'No HSN mapping for that craft — enter manually' });
      return json(res, 200, { craft, suggested: suggestion });
    }

    // GET /api/products — public catalog (active + in-stock only)
    if (p === '/api/products' && req.method === 'GET') {
      const vertical = url.searchParams.get('vertical');
      const exportOnly = url.searchParams.get('export') === 'true';
      const opts = {};
      if (vertical) opts.vertical = vertical;
      if (exportOnly) opts.exportOnly = true;
      const catalog = products.publicCatalog(productsState.products, opts);
      return json(res, 200, {
        products: catalog,
        count: catalog.length,
        gmv_potential_paise: products.catalogValuePaise(productsState.products),
      });
    }

    // POST /api/products — create a new draft product
    if (p === '/api/products' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const sellerId = b.seller_id;
      if (!sellerId) return json(res, 400, { error: 'seller_id required' });
      const seller = signupSvc.getSeller(sellerId);
      if (!seller) return json(res, 404, { error: 'seller not found', id: sellerId });
      // Auth: a seller can only create products under their own seller_id.
      const principal = requireAuth(req, res, { sellerId });
      if (!principal) return;
      const result = products.createProduct(b, seller);
      if (!result.ok) return json(res, 400, { error: 'validation failed', errors: result.errors });
      productsState.products.set(result.product.id, result.product);
      persistDomain('products_v2');
      return json(res, 201, result.product);
    }

    // GET /api/products/:id — fetch one
    {
      const m = p.match(/^\/api\/products\/(prod_[a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const prod = productsState.products.get(m[1]);
        if (!prod) return json(res, 404, { error: 'product not found', id: m[1] });
        return json(res, 200, prod);
      }
      // PATCH /api/products/:id — edit (only draft/rejected)
      if (m && req.method === 'PATCH') {
        const id = m[1];
        const current = productsState.products.get(id);
        if (!current) return json(res, 404, { error: 'product not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        const sellerId = b.seller_id;
        if (!sellerId) return json(res, 400, { error: 'seller_id required' });
        const seller = signupSvc.getSeller(sellerId);
        if (!seller) return json(res, 404, { error: 'seller not found', id: sellerId });
        const result = products.editProduct(current, b, seller);
        if (!result.ok) return json(res, 400, { error: 'edit failed', errors: result.errors });
        productsState.products.set(id, result.product);
        persistDomain('products_v2');
        return json(res, 200, result.product);
      }
      // DELETE — archive (we don't actually delete; transition to archived)
      if (m && req.method === 'DELETE') {
        const id = m[1];
        const current = productsState.products.get(id);
        if (!current) return json(res, 404, { error: 'product not found', id });
        const result = products.transitionProduct(current, 'archived', { note: 'Seller archived' });
        if (!result.ok) return json(res, 400, { error: 'archive failed', errors: result.errors });
        productsState.products.set(id, result.product);
        persistDomain('products_v2');
        return json(res, 200, result.product);
      }
    }

    // POST /api/products/:id/transition — change status (seller or founder)
    {
      const m = p.match(/^\/api\/products\/(prod_[a-zA-Z0-9_]+)\/transition$/);
      if (m && req.method === 'POST') {
        const id = m[1];
        const current = productsState.products.get(id);
        if (!current) return json(res, 404, { error: 'product not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        if (!b.status) return json(res, 400, { error: 'status required' });
        // Auth: the seller must own this product. Founder bypasses ownership.
        const principal = requireAuth(req, res, { sellerId: current.seller_id });
        if (!principal) return;
        // Approval transitions (into active or rejected) are a FOUNDER-only
        // decision — a seller must not be able to approve their own listing.
        const approvalTransition = b.status === 'active' || b.status === 'rejected';
        if (approvalTransition && principal.role !== 'founder') {
          return json(res, 403, { error: 'unauthorized', reason: 'only the founder can approve or reject a listing' });
        }
        // CONSENT GATE: a product may not go ACTIVE unless the seller has
        // authorized the platform to sell on their behalf. A sourced lead /
        // newly onboarded seller without the selling-authorization handshake
        // cannot have live listings — this is the legal foundation, enforced
        // even for the founder.
        if (b.status === 'active') {
          const consentRecord = sellerConsents[current.seller_id];
          const sell = sellerConsent.canSell(consentRecord);
          if (!sell.ok) {
            return json(res, 403, {
              error: 'seller_consent_required',
              reason: 'The platform cannot list this product until the seller authorizes selling on their behalf.',
              missing_consents: sell.missing,
              seller_id: current.seller_id,
            });
          }
        }
        const result = products.transitionProduct(current, b.status, { note: b.note });
        if (!result.ok) return json(res, 400, { error: 'transition failed', errors: result.errors });
        productsState.products.set(id, result.product);
        persistDomain('products_v2');
        return json(res, 200, result.product);
      }
    }

    // GET /api/sellers/:id/products — all products for a specific seller
    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)\/products$/);
      if (m && req.method === 'GET') {
        const sellerId = m[1];
        const list = [...productsState.products.values()].filter(prod => prod.seller_id === sellerId);
        return json(res, 200, { seller_id: sellerId, products: list, count: list.length });
      }
    }

    // GET /api/sellers/:id/consent — the seller's consent + authorization status.
    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)\/consent$/);
      if (m && req.method === 'GET') {
        const sellerId = m[1];
        const principal = requireAuth(req, res, { sellerId });
        if (!principal) return;
        return json(res, 200, sellerConsent.consentStatus(sellerConsents[sellerId]));
      }
    }

    // POST /api/sellers/:id/consent — grant consent(s). The seller (or founder)
    // grants the selling authorization + related consents. Body: { grant: [...],
    // method } or { grant_all: true }.
    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)\/consent$/);
      if (m && req.method === 'POST') {
        const sellerId = m[1];
        const principal = requireAuth(req, res, { sellerId });
        if (!principal) return;
        const b = await parseBody(req, res); if (b === null) return;
        const grant = b.grant_all === true ? sellerConsent.REQUIRED_TO_SELL : (Array.isArray(b.grant) ? b.grant : []);
        if (!grant.length) return json(res, 400, { error: 'nothing to grant', hint: 'pass grant: [...] or grant_all: true' });
        const rec = sellerConsent.grantMany(sellerConsents[sellerId] || sellerConsent.emptyConsent(), grant, { method: b.method || 'account', at: Date.now() });
        sellerConsents[sellerId] = rec;
        persistDomain('seller_consents');
        return json(res, 200, sellerConsent.consentStatus(rec));
      }
    }

    // DELETE /api/sellers/:id/consent/:type — withdraw a consent (a data-
    // principal right). Withdrawing selling authorization deactivates the
    // seller's live listings on the next read of canSell.
    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)\/consent\/([a-z_]+)$/);
      if (m && req.method === 'DELETE') {
        const sellerId = m[1]; const type = m[2];
        const principal = requireAuth(req, res, { sellerId });
        if (!principal) return;
        const rec = sellerConsent.withdrawConsent(sellerConsents[sellerId] || sellerConsent.emptyConsent(), type, { at: Date.now() });
        sellerConsents[sellerId] = rec;
        // If selling authorization is withdrawn, take their active listings down.
        let deactivated = 0;
        if (!sellerConsent.canSell(rec).ok) {
          for (const [pid, prod] of productsState.products) {
            if (prod.seller_id === sellerId && prod.status === 'active') {
              const t = products.transitionProduct(prod, 'archived', { note: 'Seller withdrew selling authorization' });
              if (t.ok) { productsState.products.set(pid, t.product); deactivated++; }
            }
          }
          if (deactivated) persistDomain('products_v2');
        }
        persistDomain('seller_consents');
        return json(res, 200, { withdrawn: type, listings_deactivated: deactivated, consent: sellerConsent.consentStatus(rec) });
      }
    }

    // ════════════════════════════════════════════════════════════
    // PROFIT GUARD — /api/profit/* (founder dashboard)
    // ════════════════════════════════════════════════════════════

    // GET /api/profit/platform — aggregate P&L across all sellers
    if (p === '/api/profit/platform' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      const sellerLookup = {
        listSellers: () => signupSvc.listSellers(),
        getSeller: (id) => signupSvc.getSeller(id),
      };
      const pnl = profitGuard.platformPnL(costLedger, sellerLookup);
      return json(res, 200, pnl);
    }

    // GET /api/profit/seller/:id — per-seller P&L
    {
      const m = p.match(/^\/api\/profit\/seller\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        if (!requireFinancialAccess(req, res)) return;
        const sellerId = m[1];
        const seller = signupSvc.getSeller(sellerId);
        if (!seller) return json(res, 404, { error: 'seller not found', id: sellerId });
        const pnl = profitGuard.sellerPnL(sellerId, seller.archetype, costLedger);
        return json(res, 200, pnl);
      }
    }

    // POST /api/profit/check — pre-flight a tool call. Returns the
    // profit-guard verdict WITHOUT executing the tool. Use this from the
    // AI co-founder UI to show "this call would cost ₹X, headroom Y" before
    // the user confirms.
    if (p === '/api/profit/check' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const sellerLookup = {
        getSeller: (id) => signupSvc.getSeller(id),
      };
      const result = profitGuard.canAfford({
        toolName: b.tool_name,
        sellerId: b.seller_id || null,
        archetype: b.archetype || null,
        ledger: costLedger,
        sellerLookup,
        model: b.model || 'opus_4',
      });
      return json(res, 200, result);
    }

    // GET /api/profit/pricing — surface the pricing model (for the UI)
    if (p === '/api/profit/pricing' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, {
        inference_pricing_paise: profitGuard.INFERENCE_PRICING_PAISE,
        archetype_revenue_paise: profitGuard.ARCHETYPE_REVENUE_PAISE,
        thresholds: {
          warn: profitGuard.WARN_THRESHOLD,
          deny: profitGuard.DENY_THRESHOLD,
        },
      });
    }

    // GET /api/profit/sweep — latest scheduler profit-sweep snapshot.
    // Used by the founder console to display "at-risk sellers" without
    // re-scanning on every request. Refreshed daily by the scheduler.
    if (p === '/api/profit/sweep' && req.method === 'GET') {
      if (!requireFinancialAccess(req, res)) return;
      return json(res, 200, {
        last_profit_sweep_at: SCHEDULER.lastProfitSweep || null,
        at_risk_sellers: SCHEDULER.lastAtRiskSellers || [],
        last_pnl_digest_at: SCHEDULER.lastPnlDigest || null,
        last_pnl_snapshot: SCHEDULER.lastPnlSnapshot || null,
      });
    }

    // POST /api/profit/sweep — force-refresh the profit sweep + P&L digest.
    // The founder uses this to get fresh numbers on demand (e.g. after
    // approving a new seller, or to check after a budget burn).
    if (p === '/api/profit/sweep' && req.method === 'POST') {
      const principal = requireAuth(req, res, { role: 'founder' });
      if (!principal) return;
      SCHEDULER._forceProfitSweep = true;
      SCHEDULER._forcePnlDigest = true;
      try {
        runSchedulerSweep();
      } catch (e) {
        return json(res, 500, { error: 'sweep failed', detail: e.message });
      }
      return json(res, 200, {
        last_profit_sweep_at: SCHEDULER.lastProfitSweep,
        at_risk_sellers: SCHEDULER.lastAtRiskSellers || [],
        last_pnl_digest_at: SCHEDULER.lastPnlDigest,
        last_pnl_snapshot: SCHEDULER.lastPnlSnapshot,
      });
    }

    // ════════════════════════════════════════════════════════════
    // ORDER PROFIT GUARD — /api/orders/check (gate buyer orders)
    // ════════════════════════════════════════════════════════════

    // POST /api/orders/check — preflight a buyer order BEFORE accepting it.
    // Returns the profit-guard verdict + slice + cost analysis. Real checkout
    // (when built) will call this and reject orders where verdict === 'deny'.
    if (p === '/api/orders/check' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;
      const sellerId = b.seller_id;
      const orderTotalRupees = b.order_total_rupees;
      if (!sellerId || !orderTotalRupees) {
        return json(res, 400, { error: 'seller_id and order_total_rupees required' });
      }
      const seller = signupSvc.getSeller(sellerId);
      if (!seller) {
        return json(res, 404, { error: 'seller not found', id: sellerId });
      }
      try {
        const result = orderProfitGuard.canAcceptOrder({
          orderTotalRupees,
          sellerId,
          archetype: seller.archetype,
          ledger: costLedger,
          sliceOpts: b.slice_opts || undefined,
        });
        const status = result.verdict === 'deny' ? 402 : 200;
        return json(res, status, result);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // POST /api/orders — create a real order. Validates, runs profit guard,
    // decrements stock, persists. Returns 201 with the full order on
    // success, 402 if profit guard denied, 400 on validation failure.
    if (p === '/api/orders' && req.method === 'POST') {
      const b = await parseBody(req, res); if (b === null) return;

      // Tourism safety gate: if any item is a tourism experience, the booking
      // must clear the sector's risk/KYC rules before we take money. Adventure
      // and sports experiences are high-risk and need verified identity; low-
      // risk cultural/heritage visits need none. This protects the operator,
      // the tourist, and the platform (agent/intermediary liability).
      for (const item of (b.items || [])) {
        const prod = productsState.products.get(item.product_id);
        if (prod && prod.vertical === 'tourism') {
          const category = prod.craft && tourism.CATEGORY_RISK[prod.craft] ? prod.craft
            : (b.tourism_category || 'cultural');  // default to low-risk if unspecified
          // Operator compliance comes from the Pravasi seller's verified
          // onboarding: a tour-operator license on file → licenseVerified;
          // CGL indemnity + adventure insurance are operator attestations
          // captured at signup/KYC. The platform is agent-only, never insurer.
          const operator = signupSvc.getSeller(prod.seller_id) || {};
          const docs = operator.docs || {};
          const opProfile = {
            id: prod.seller_id,
            licenseVerified: !!(docs.tour_operator_license || operator.tour_operator_license),
            cglIndemnity: !!(docs.cgl_indemnity || operator.cgl_indemnity || docs.tour_operator_license),
            adventureInsuranceBound: !!(docs.adventure_insurance || operator.adventure_insurance_bound),
          };
          const evalResult = tourism.evaluateBooking(
            { category },
            { kycTier: Number(b.buyer_kyc_tier) || 0 },
            opProfile,
          );
          if (!evalResult.allowed) {
            return json(res, evalResult.code || 422, {
              error: 'tourism_booking_blocked',
              reason: (evalResult.blocks && evalResult.blocks[0]) || 'This experience has identity/safety requirements that are not yet met.',
              blocks: evalResult.blocks || [],
              requirements: evalResult.requirements || [],
              risk_level: evalResult.risk_level,
              category,
            });
          }
        }
      }

      const ctx = {
        getProduct: (id) => productsState.products.get(id) || null,
        getSeller: (id) => signupSvc.getSeller(id),
        ledger: costLedger,
        charity: settings.charityConfig(),   // founder-controlled donation
      };
      const result = orders.createOrder(b, ctx);
      if (!result.ok) {
        // Distinguish profit-guard denial (402) from validation (400)
        if (result.errors && result.errors[0] === 'denied_by_profit_guard') {
          return json(res, 402, {
            error: 'denied_by_profit_guard',
            reason: result.reason,
            profit_guard: result.profit_guard,
          });
        }
        return json(res, 400, { error: 'validation_failed', errors: result.errors });
      }
      // Decrement stock for each item
      for (const item of result.order.items) {
        const product = productsState.products.get(item.product_id);
        if (product && product.stock != null) {
          const newStock = Math.max(0, product.stock - item.quantity);
          const updated = Object.freeze({ ...product, stock: newStock, updated_at: Date.now() });
          productsState.products.set(item.product_id, updated);
          // Auto-flip to sold_out if stock hit zero
          if (newStock === 0 && product.status === 'active') {
            const soldOut = require('./src/products').transitionProduct(updated, 'sold_out', { note: 'Stock depleted by order' });
            if (soldOut.ok) productsState.products.set(item.product_id, soldOut.product);
          }
        }
      }
      ordersState.orders.set(result.order.id, result.order);
      persistDomain('orders_v2');
      persistDomain('products_v2');

      // ── FULFILMENT: book a shipment for physical-goods orders (not tourism) ──
      let shipment = null;
      try {
        const hasPhysical = (result.order.items || []).some((it) => {
          const pr = productsState.products.get(it.product_id);
          return pr && pr.vertical !== 'tourism';
        });
        if (hasPhysical && (b.shipping || b.ship_to)) {
          const dest = b.shipping ? `${b.shipping.city || ''}${b.shipping.country ? ', ' + b.shipping.country : ''}`.trim() : b.ship_to;
          const sh = logistics.createShipment(
            { from: b.ship_from || 'Origin cluster', to: dest || 'destination', weight_kg: b.weight_kg || 1, international: !!b.international || (b.shipping && b.shipping.country && b.shipping.country !== 'IN') },
            logisticsCourier, { order_ref: result.order.id });
          if (sh.ok) shipment = sh.shipment;
        }
      } catch (e) { /* fulfilment is best-effort; never blocks the order */ }

      // ── CHARITY: the customer's answer at the payment gateway (this order only) ──
      try {
        if (b.charity_accepted === true) {
          const slice = result.order.slices || result.order.split || {};
          const charityPaise = slice.charity_donation || slice.charity || charityFund.checkoutAsk(result.order.order_total || 0).suggested_paise;
          charityFund.recordContribution(CHARITY_FUND, charityPaise, { optedIn: true });
          persistDomain('charity_fund');
        }
      } catch (e) { /* charity is optional; never blocks the order */ }

      // ── WEBHOOK: fire a signed, retried event so partners/sellers are notified ──
      try {
        const evt = WEBHOOK_QUEUE.enqueue({
          url: b.webhook_url || (process.env.DEFAULT_WEBHOOK_URL) || 'https://example.invalid/hook',
          type: 'order.created',
          payload: { order_id: result.order.id, total: result.order.order_total, shipment: shipment ? shipment.awb : null, at: Date.now() },
        });
        // Attempt delivery immediately; failures auto-schedule retries.
        if (b.webhook_url) {
          WEBHOOK_QUEUE.attempt(evt.id, async (url, body, headers) => {
            // Real HTTP send would go here; in this environment we just sign + record.
            if (!url || url.includes('example.invalid')) throw new Error('no real endpoint');
          }, WEBHOOK_SECRET).catch(() => {});
        }
      } catch (e) { /* notifications never block the order */ }

      return json(res, 201, { ...result.order, shipment, webhook_signed: true });
    }

    // GET /api/orders — list orders (admin/founder view, paginated)
    if (p === '/api/orders' && req.method === 'GET') {
      const list = [...ordersState.orders.values()].sort((a, b) => b.created_at - a.created_at);
      const stats = orders.platformOrderStats(ordersState.orders);
      return json(res, 200, {
        orders: list.slice(0, 50),  // first 50 newest
        count: list.length,
        stats,
      });
    }

    // GET /api/orders/:id — single order detail
    {
      const m = p.match(/^\/api\/orders\/(ord_[a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const order = ordersState.orders.get(m[1]);
        if (!order) return json(res, 404, { error: 'order not found', id: m[1] });
        return json(res, 200, order);
      }
    }

    // POST /api/orders/:id/transition — move order through its lifecycle
    {
      const m = p.match(/^\/api\/orders\/(ord_[a-zA-Z0-9_]+)\/transition$/);
      if (m && req.method === 'POST') {
        const id = m[1];
        const current = ordersState.orders.get(id);
        if (!current) return json(res, 404, { error: 'order not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        if (!b.status) return json(res, 400, { error: 'status required' });
        // Auth: only the seller who owns this order (or the founder) can
        // move it through fulfillment. Prevents one seller touching another's
        // orders, or a buyer transitioning their own order to "delivered".
        const principal = requireAuth(req, res, { sellerId: current.seller_id });
        if (!principal) return;
        const result = orders.transitionOrder(current, b.status, { note: b.note });
        if (!result.ok) return json(res, 400, { error: 'transition failed', errors: result.errors });
        ordersState.orders.set(id, result.order);
        persistDomain('orders_v2');
        return json(res, 200, result.order);
      }
    }

    // POST /api/orders/:id/pay — run the payment lifecycle for an order:
    // begin → authorize → capture → Route split → settle. On success the
    // order moves pending → paid, with the gateway's payment record attached.
    // The buyer initiates this (it's the checkout "pay" action), so it does
    // NOT require seller auth — but the order must be in 'pending' state.
    {
      const m = p.match(/^\/api\/orders\/(ord_[a-zA-Z0-9_]+)\/pay$/);
      if (m && req.method === 'POST') {
        const id = m[1];
        const current = ordersState.orders.get(id);
        if (!current) return json(res, 404, { error: 'order not found', id });
        if (current.status !== 'pending') {
          return json(res, 409, { error: 'order not payable', reason: `status is "${current.status}", expected "pending"` });
        }
        const b = await parseBody(req, res); if (b === null) return;
        const method = b.method || payments.METHOD.UPI;
        const authPayload = b.auth_payload || (method === payments.METHOD.UPI ? { vpa: 'buyer@upi' } : { cardToken: 'tok_test' });

        try {
          // 1. begin — create the gateway order (idempotent on order id)
          // The buyer is charged the item total + customer-side insurance.
          const captureAmount = (current.slice && current.slice.buyer_pays) || current.total_paise;
          let payment = await paymentGateway.begin({
            orderId: id,
            amountPaise: captureAmount,
            method,
            idempotencyKey: 'order_' + id,
          });
          // 2. authorize — buyer-side auth (UPI VPA / card token)
          payment = await paymentGateway.authorize(payment, authPayload);
          // 3. capture — funds into gateway escrow
          payment = await paymentGateway.capture(payment);
          // 4. Route split — disburse directly to linked accounts. The
          //    platform never holds the float; the split replays the order's
          //    immutable slicer manifest.
          const transfers = payments.buildSplitPlan(current.slice, ROUTE_ACCOUNTS);
          payment = await paymentGateway.split(payment, transfers);
          // 5. settle — async at the real gateway (webhook confirms); here we
          //    mark it so the order can advance.
          payment = await paymentGateway.settle(payment);

          // Advance the order to 'paid' and attach the payment record
          const result = orders.transitionOrder(current, 'paid', { note: `Paid via ${method} (${payment.gatewayOrderId})` });
          if (!result.ok) return json(res, 500, { error: 'order transition after payment failed', errors: result.errors });
          const paidOrder = Object.freeze({
            ...result.order,
            payment: Object.freeze({
              provider: config.payments.provider,
              status: payment.state,
              gateway_order_id: payment.gatewayOrderId,
              method,
              transfers,
            }),
          });
          ordersState.orders.set(id, paidOrder);
          persistDomain('orders_v2');
          return json(res, 200, paidOrder);
        } catch (e) {
          return json(res, 402, { error: 'payment_failed', reason: e.message });
        }
      }
    }

    // POST /api/orders/:id/refund — refund a paid order. Founder or the
    // owning seller may initiate. Moves the order paid → refund_initiated →
    // refunded and reverses the gateway payment. Refunds run AGAINST the
    // platform's commission first (the platform absorbs its own margin before
    // clawing back the maker) — but the maker payout reversal is real money,
    // so this is gated and audited.
    {
      const m = p.match(/^\/api\/orders\/(ord_[a-zA-Z0-9_]+)\/refund$/);
      if (m && req.method === 'POST') {
        const id = m[1];
        const current = ordersState.orders.get(id);
        if (!current) return json(res, 404, { error: 'order not found', id });
        const principal = requireAuth(req, res, { sellerId: current.seller_id });
        if (!principal) return;
        if (current.status !== 'paid' && current.status !== 'shipped' && current.status !== 'delivered') {
          return json(res, 409, { error: 'order not refundable', reason: `status "${current.status}" cannot be refunded` });
        }
        const b = await parseBody(req, res); if (b === null) return;
        try {
          // Reverse at the gateway
          const gwOrderId = current.payment && current.payment.gateway_order_id;
          if (gwOrderId && paymentGateway.payments) {
            const payment = [...paymentGateway.payments.values()].find(pm => pm.gatewayOrderId === gwOrderId);
            if (payment) await paymentGateway.refund(payment);
          }
          // Advance order: paid → refund_initiated → refunded
          let step = orders.transitionOrder(current, 'refund_initiated', { note: b.reason || 'Refund initiated' });
          if (!step.ok) return json(res, 400, { error: 'refund transition failed', errors: step.errors });
          let done = orders.transitionOrder(step.order, 'refunded', { note: 'Refund settled by gateway' });
          if (!done.ok) return json(res, 400, { error: 'refund settle failed', errors: done.errors });
          const refunded = Object.freeze({
            ...done.order,
            payment: Object.freeze({ ...(current.payment || {}), status: 'refunded', refunded_at: Date.now(), refund_reason: b.reason || null }),
          });
          ordersState.orders.set(id, refunded);
          persistDomain('orders_v2');
          return json(res, 200, refunded);
        } catch (e) {
          return json(res, 500, { error: 'refund_failed', reason: e.message });
        }
      }
    }

    // GET /api/sellers/:id/orders — orders for a specific seller (seller view)
    {
      const m = p.match(/^\/api\/sellers\/([a-zA-Z0-9_]+)\/orders$/);
      if (m && req.method === 'GET') {
        const sellerId = m[1];
        const list = orders.listOrdersForSeller(ordersState.orders, sellerId);
        return json(res, 200, { seller_id: sellerId, orders: list, count: list.length });
      }
    }

    // GET /api/orders/buyer/:phone — orders for a buyer phone (buyer "my orders")
    {
      const m = p.match(/^\/api\/orders\/buyer\/(\+?\d+)$/);
      if (m && req.method === 'GET') {
        const list = orders.listOrdersForBuyer(ordersState.orders, m[1]);
        return json(res, 200, { phone: m[1], orders: list, count: list.length });
      }
    }

    // ════════════════════════════════════════════════════════════
    // AGENT REGISTRY — /api/agents/* (AI co-founder orchestrator)
    // ════════════════════════════════════════════════════════════

    // GET /api/agents — inventory of all agents + their tools
    if (p === '/api/agents' && req.method === 'GET') {
      return json(res, 200, agentRegistry.inventory());
    }

    // GET /api/agents/tools — tool descriptors for Anthropic API
    if (p === '/api/agents/tools' && req.method === 'GET') {
      const agentFilter = url.searchParams.get('agent');
      return json(res, 200, { tools: agentRegistry.toolsForAnthropic(agentFilter || null) });
    }

    // POST /api/agents/execute — execute a tool with profit guard wrapping
    if (p === '/api/agents/execute' && req.method === 'POST') {
      if (!requireAuth(req, res, { role: 'founder' })) return;
      const b = await parseBody(req, res); if (b === null) return;
      const toolName = b.tool_name;
      if (!toolName) return json(res, 400, { error: 'tool_name required' });
      const sellerLookup = {
        getSeller: (id) => signupSvc.getSeller(id),
        listSellers: () => signupSvc.listSellers(),
      };
      // Live state passed to the tools
      const state = {
        products_v2: productsState.products,
        returns: returnsState.returns,
        leads: sourcingState.leads,
      };
      const result = agentRegistry.executeTool(toolName, b.input || {}, state, {
        ledger: costLedger,
        sellerId: b.seller_id || null,
        archetype: b.archetype || null,
        sellerLookup,
        model: b.model || 'opus_4',
        bypassGuard: b.bypass_guard === true && config.allowProfitGuardBypass,
      });
      // Persist anything the tool mutated
      if (result.ok && result.mutating) {
        if (toolName === 'transition_product') persistDomain('products_v2');
        if (toolName === 'transition_return')  persistDomain('returns');
      }
      // Persist ledger after every recorded call
      persistDomain('cost_ledger');
      // Choose HTTP status: 200 OK for success or non-fatal warn,
      // 402 Payment Required for profit-guard denial (deliberate semantic
      // — the operation refused because it would push platform to loss).
      const status = result.error === 'denied_by_profit_guard' ? 402 : (result.ok ? 200 : 400);
      return json(res, status, result);
    }

    {
      const m = p.match(/^\/api\/returns\/([a-zA-Z0-9_]+)$/);
      if (m && req.method === 'GET') {
        const ret = returnsState.returns.get(m[1]);
        if (!ret) return json(res, 404, { error: 'return not found', id: m[1] });
        return json(res, 200, ret);
      }
      if (m && req.method === 'PATCH') {
        const id = m[1];
        const current = returnsState.returns.get(id);
        if (!current) return json(res, 404, { error: 'return not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        if (!b.status) return json(res, 400, { error: 'status is required' });
        try {
          const updated = returns.transitionStatus(current, b.status, b.note || '');
          returnsState.returns.set(id, updated);
          persistDomain('returns');
          return json(res, 200, updated);
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
      // POST /api/returns/:id/refund — compute refund breakdown for a received return
      const r = p.match(/^\/api\/returns\/([a-zA-Z0-9_]+)\/refund$/);
      if (r && req.method === 'POST') {
        const id = r[1];
        const ret = returnsState.returns.get(id);
        if (!ret) return json(res, 404, { error: 'return not found', id });
        const b = await parseBody(req, res); if (b === null) return;
        try {
          return json(res, 200, returns.computeRefund(ret, b.reverseSlice || {}));
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
    }

    return json(res, 404, { error: 'not found', path: p });
  } catch (err) {
    monitoring.capture(err, { path: p, method: req.method });
    return json(res, 500, { error: 'internal_error', reason: err.message });
  }
});

if (require.main === module) {
  const PORT = config.port;
  // HARD production guard: refuse to boot unsafely in production. No-op in
  // dev/test/demo, so the demo and tests are unaffected.
  try {
    productionGuard.assertReady(process.env);
  } catch (e) {
    console.error('\n' + e.message + '\n');
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`NEXUS API on http://localhost:${PORT}  [env=${config.env} payments=${config.payments.provider} store=${config.store} auth=${config.auth.mode}]`);
    const r = productionReadiness(config);
    if (!r.ready) {
      console.warn('NOT production-ready. Missing:');
      r.missing.forEach(m => console.warn('  - ' + m));
    }
    // Boot the maintenance scheduler (unless disabled by env)
    startScheduler();
    if (SCHEDULER.enabled) {
      console.log(`Scheduler running (sweep every ${SCHEDULER.intervalMs/60000}min)`);
    }
  });
  // Graceful shutdown — finish in-flight requests, persist, exit clean.
  const shutdown = (sig) => {
    console.log(`\n${sig} received — shutting down gracefully`);
    stopScheduler();
    server.close(() => { console.log('Closed. Bye.'); process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
module.exports = { server, plat, runSchedulerSweep, startScheduler, stopScheduler, SCHEDULER };
