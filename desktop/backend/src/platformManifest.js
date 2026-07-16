'use strict';

/**
 * platformManifest.js
 *
 * The platform's self-knowledge. So the AI co-founder genuinely understands
 * what it is operating — architecture, every module's responsibility, the API
 * surface, the legal model, and the invariants it must never violate — this
 * module describes the whole system in a structured, queryable form.
 *
 * The AI co-founder reads this to answer "how does X work?", to locate the
 * right module before proposing a change, and to check a proposed change
 * against the invariants. It is generated from a single source of truth here,
 * kept honest by a test that cross-checks it against the actual src/ tree.
 */

const IDENTITY = Object.freeze({
  name: 'NEXUS',
  tagline: 'Trust + compliance operating system for India\u2019s craft economy.',
  one_liner: 'A weaver who cannot read, with no GST number, sells to a buyer abroad \u2014 verified, compliant, paid to her bank in two days \u2014 carrying zero legal liability.',
  founder_model: 'Solo founder, Jaipur. 2% opex ceiling. No-code control. Self-improving with a human in the loop.',
  prime_directive: 'The platform is NEVER in loss \u2014 enforced at the AI-tool, order, pricing, and deploy boundaries (HTTP 402/422).',
});

// The status-aware legal core — the heart of the product.
const LEGAL_MODEL = Object.freeze({
  summary: 'The platform\u2019s legal relationship adapts to each seller\u2019s documentation status.',
  models: {
    merchant_of_record: 'Undocumented artisan (Karigar): the platform sells AS the merchant, files GST, the artisan keeps the maker share and carries zero liability.',
    saas_subscription: 'Registered business/exporter (Vyapari/Niryatak): sells on their own GSTIN; the platform provides tooling + compliance.',
    agent_intermediary: 'Tourism operator (Pravasi): the platform books only, never operates or insures.',
    cooperative_umbrella: 'Producer group (Sansthan): umbrella billing across many makers.',
    guardian_mor: 'A minor with a verified guardian: Merchant-of-Record under guardian authorization.',
    blocked: 'A minor without a guardian: blocked \u2014 cannot transact.',
  },
  tax: 'TCS (Section 52 CGST) is the platform\u2019s obligation; GST on commission computed at source in the slicer.',
  float: 'The platform never holds float \u2014 Razorpay Route split-settlement routes the maker\u2019s share directly to their bank (T+2).',
});

// Invariants the AI co-founder must preserve in any modification.
const INVARIANTS = Object.freeze([
  'Never-in-loss: no transaction, price, or AI action may put the platform in loss (402/422 at the boundary).',
  'Consent-before-sale: a product cannot go active until the seller grants selling authorization + required consents.',
  'Authenticity: auto-sourcing is grounded in real GI tags + real clusters; never fabricate a producer\u2019s name, phone, or email.',
  'Child safety: minors require a verified guardian (Guardian-MoR) or are blocked.',
  'Founder-in-the-loop: the AI prepares + recommends; consequential actions (pricing, go-live, approvals) need founder approval.',
  'Financial visibility is gated: cost/margin/pricing-floor data is founder + co-founder only.',
  'Maker-first settlement: the maker\u2019s payout is never eroded by commission, fees, or charity.',
]);

// Module responsibilities — the map the AI uses to find the right place to work.
const MODULES = Object.freeze({
  slicer: 'Splits every transaction to the paise: maker payout, commission, GST, gateway fee, TCS, charity. Source of financial truth.',
  payments: 'Payment lifecycle (authorize\u2192capture\u2192route-split\u2192settle\u2192refund). Provider-agnostic via a seam.',
  razorpayProvider: 'Live Razorpay adapter; activates with keys, falls back to a mock.',
  orders: 'Order creation + lifecycle; drives the slicer; runs the tourism safety gate; applies founder charity config.',
  products: 'Product CRUD + status machine (draft\u2192pending_review\u2192active\u2192\u2026). Any seller may list any vertical.',
  sellerSignup: 'OTP signup + archetype + KYC requirements per archetype.',
  sellerConsent: 'The legal gate: selling authorization + consents required before a product can go live; supports withdrawal.',
  auth: 'HMAC session tokens; roles buyer/seller/founder/cofounder; financial-access gating.',
  profitGuard: 'Cost ledger + canAfford + platform/seller P&L. Enforces never-in-loss on AI spend.',
  unitEconomics: 'Per-tier economics + cost-to-serve.',
  operationalCost: 'Opex modelling against the 2% ceiling.',
  costEngine: 'Routes AI inference to the cheapest capable model within budget.',
  sourcing: 'Lead pipeline + scoring + real enumeration channels.',
  autoSource: 'Authentic candidate generation from the GI registry + supply clusters (artisans\u2026exporters\u2026tourism).',
  supplyClusters: 'Real Indian craft + industrial clusters and the establishment types in each.',
  giRegistry: 'The 54 real GI-tagged crafts with regions + categories.',
  geo: 'Maps/geo seam: mock coordinates (no key) or Google Maps (with key) for tourism + supply + logistics.',
  tourism: 'Tourism risk/KYC model: category risk + operator-licence/insurance gating.',
  tourismIntelligence: 'Tourism demand + seasonality signals.',
  adGeneration: 'Marketing copy + channel economics + per-tier included ad budget; margin-guarded spend.',
  grievance: 'Grievance lifecycle + SLA + DPDP consent purposes + policy templates (privacy/terms/returns/grievance).',
  docVerification: 'Document/KYC verification seam.',
  executiveTeam: 'Virtual C-suite (10 roles) synthesizing real data into role assessments + cross-functional tensions.',
  launchOrchestrator: 'AI chief-of-staff: the launch/operate task board, what the AI can prepare vs founder decisions, HITL approval.',
  deployAgent: 'Release-readiness checks + deploy plan + maintenance cycle.',
  operations: 'Health checks + runbooks + autonomy levels.',
  platformSettings: 'Founder-controlled subscription pricing (never below cost-to-serve) + charity config.',
  schemes: 'Government scheme eligibility (ODOP, MSME, export incentives\u2026).',
  cooperativeSplit: 'Splits cooperative earnings across member makers.',
  i18n: 'Localization + Bhashini translation seam for Indian languages.',
  config: 'Environment-driven config: auth, payments, maps, inference.',
  store: 'File-backed persistence (interface abstracts a future Postgres).',
});

// API surface grouped by area (high-level; not exhaustive of every query param).
const API_AREAS = Object.freeze({
  sellers: ['POST /api/sellers/otp/request', 'POST /api/sellers/otp/verify', 'POST /api/sellers', 'GET /api/sellers', 'GET /api/sellers/:id/consent', 'POST /api/sellers/:id/consent', 'DELETE /api/sellers/:id/consent/:type'],
  products: ['POST /api/products', 'GET /api/products', 'POST /api/products/:id/transition (active gated by consent)', 'GET /api/sellers/:id/products'],
  orders: ['POST /api/orders (tourism safety gate + charity)', 'POST /api/orders/:id/pay', 'POST /api/orders/:id/refund', 'GET /api/orders/...'],
  sourcing: ['GET /api/sourcing/auto', 'POST /api/sourcing/promote', 'GET /api/sourcing/clusters', 'GET /api/catalog/templates'],
  geo: ['GET /api/geo/geocode', 'GET /api/geo/distance', 'GET /api/geo/supply-map', 'GET /api/geo/tourism-map'],
  leadership: ['GET /api/exec/team', 'GET /api/launch/board', 'GET /api/launch/next', 'POST /api/launch/prepare/:task', 'POST /api/launch/approve/:task'],
  money: ['GET /api/profit/* (financial-gated)', 'GET /api/settings/pricing', 'PUT /api/settings/pricing', 'GET/PUT /api/settings/charity'],
  marketing: ['POST /api/ads/generate', 'GET /api/ads/channels', 'POST /api/ads/plan', 'GET /api/ads/budget/:tier'],
  platform: ['GET /api/platform/manifest', 'GET /health', 'GET /ready'],
});

const ARCHITECTURE = Object.freeze({
  backend: 'Node.js, zero runtime dependencies. Single server.js routes ~80 endpoints. File-backed store with a clean interface.',
  frontend: 'Single-file SPA (public/index.html) with role views (buyer/seller/founder/cofounder), an AI co-founder chat, and a service worker for offline + auto-update.',
  testing: 'Test-first: 50+ suites covering modules, the SPA wiring, and live API routes. CI runs them on Node 20 + 22.',
  extensibility: 'Provider seams (payments, maps, inference, doc-verification) flip from mock to live with credentials \u2014 no engine changes.',
});

/** The full manifest. `area` optionally narrows to one section. */
function manifest(area) {
  const full = {
    identity: IDENTITY,
    legal_model: LEGAL_MODEL,
    invariants: INVARIANTS,
    modules: MODULES,
    api_areas: API_AREAS,
    architecture: ARCHITECTURE,
    module_count: Object.keys(MODULES).length,
    generated_at: Date.now(),
  };
  if (area && full[area] !== undefined) return { [area]: full[area] };
  return full;
}

/** Look up what a single module does (for "how does X work?"). */
function describeModule(name) {
  return MODULES[name] || null;
}

/** Check a proposed change against the invariants (returns the relevant ones). */
function relevantInvariants(keywords = []) {
  const ks = keywords.map((k) => String(k).toLowerCase());
  return INVARIANTS.filter((inv) => ks.some((k) => inv.toLowerCase().includes(k)));
}

module.exports = {
  IDENTITY, LEGAL_MODEL, INVARIANTS, MODULES, API_AREAS, ARCHITECTURE,
  manifest, describeModule, relevantInvariants,
};
