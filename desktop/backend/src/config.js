/**
 * NEXUS — Configuration layer.
 * Single source of truth for runtime config. Reads environment variables,
 * falls back to safe development defaults. This is the seam where the system
 * switches between mock (pilot/dev) and live (production) without code changes.
 */

'use strict';

const env = process.env;
const bool = (v, d = false) => v === undefined ? d : /^(1|true|yes|on)$/i.test(v);
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

const config = {
  // ── Runtime ──
  env: env.NODE_ENV || 'development',
  port: int(env.PORT, 4100),
  isProd: (env.NODE_ENV === 'production'),

  // ── Profit guard ──
  // The platform refuses to operate at a loss. The guard wraps every AI
  // co-founder tool call. Bypass is for genuine platform emergencies only
  // (e.g. compliance call during a regulatory audit). Off by default.
  allowProfitGuardBypass: bool(env.ALLOW_PROFIT_GUARD_BYPASS, false),

  // ── Persistence ──
  // 'file' (default, pilot-grade) or 'postgres' (production). When postgres,
  // DATABASE_URL must be set; the store adapter swaps at one seam.
  store: env.STORE_DRIVER || 'file',
  databaseUrl: env.DATABASE_URL || null,
  dataDir: env.DATA_DIR || './data',

  // ── Payments ──
  // 'mock' (default, no real money) or 'razorpay' (live Route split-settlement).
  // Live requires the keys below; the gateway adapter swaps at one seam.
  payments: {
    provider: env.PAYMENTS_PROVIDER || 'mock',
    razorpayKeyId: env.RAZORPAY_KEY_ID || null,
    razorpayKeySecret: env.RAZORPAY_KEY_SECRET || null,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || null,
    routeEnabled: bool(env.RAZORPAY_ROUTE_ENABLED, false),
  },

  // ── Maps / geolocation (tourism, supply map, logistics) ──
  // 'mock' (default; real coordinates, no network) or 'google' (live Google
  // Maps Platform — Geocoding, Places, Distance Matrix, Static Maps).
  googleMaps: {
    provider: env.GOOGLE_MAPS_API_KEY ? 'google' : 'mock',
    apiKey: env.GOOGLE_MAPS_API_KEY || null,
  },

  // ── AI inference (cost engine routing) ──
  inference: {
    bhashiniEnabled: bool(env.BHASHINI_ENABLED, false),
    bhashiniApiKey: env.BHASHINI_API_KEY || null,
    selfHostedGpuUrl: env.GPU_INFERENCE_URL || null,
    apiOverflowKey: env.LLM_API_KEY || null,
    // The Anthropic key for the AI co-founder proxy. Held SERVER-side only —
    // never shipped to the browser. The co-founder chat works only when set.
    anthropicApiKey: env.ANTHROPIC_API_KEY || null,
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    apiMonthlyCapPaise: int(env.API_MONTHLY_CAP_PAISE, 3000000), // ₹30k
  },

  // ── Auth ──
  // 'none' (demo role-switch) or 'session' (real HMAC session login).
  // Production must be 'session'. In dev we default the secret so login works
  // out of the box; production MUST set AUTH_SECRET to a strong random value.
  auth: {
    mode: env.AUTH_MODE || (env.NODE_ENV === 'production' ? 'none' : 'session'),
    secret: env.AUTH_SECRET || (env.NODE_ENV === 'production' ? null : 'nexus-dev-secret-not-for-production'),
    founderToken: env.FOUNDER_TOKEN || (env.NODE_ENV === 'production' ? null : 'dev-founder-token'),
    cofounderToken: env.COFOUNDER_TOKEN || (env.NODE_ENV === 'production' ? null : 'dev-cofounder-token'),
    jwtSecret: env.JWT_SECRET || null,
    sessionTtlHours: int(env.SESSION_TTL_HOURS, 24),
  },

  // ── Founder-in-the-loop thresholds (no-code: editable via env or admin) ──
  hitl: {
    financeGatePaise: int(env.HITL_FINANCE_GATE_PAISE, 20000000),   // ₹2L
    onboardingGatePaise: int(env.HITL_ONBOARDING_GATE_PAISE, 5000000), // ₹50k
    logisticsGatePaise: int(env.HITL_LOGISTICS_GATE_PAISE, 10000000),  // ₹1L
    twoPersonGatePaise: int(env.HITL_TWO_PERSON_GATE_PAISE, 5000000),  // ₹50k
  },

  // ── Cost engine ──
  cost: {
    revenueFloorPaise: int(env.COST_REVENUE_FLOOR_PAISE, 10000000), // ₹1L/mo
    phase0CarveoutPaise: int(env.COST_PHASE0_CARVEOUT_PAISE, 20000000), // ₹2L
    ceilingPct: parseFloat(env.COST_CEILING_PCT || '0.02'),
  },
};

/**
 * Production readiness check. Returns the list of missing requirements so a
 * deploy can fail fast and loudly rather than silently running in mock mode.
 */
function productionReadiness(c = config) {
  const missing = [];
  if (c.isProd) {
    if (c.payments.provider === 'mock') missing.push('PAYMENTS_PROVIDER is still "mock" — set to "razorpay" with live keys');
    if (c.payments.provider === 'razorpay' && !c.payments.razorpayKeyId) missing.push('RAZORPAY_KEY_ID missing');
    if (c.payments.provider === 'razorpay' && !c.payments.razorpayKeySecret) missing.push('RAZORPAY_KEY_SECRET missing');
    if (c.payments.provider === 'razorpay' && !c.payments.webhookSecret) missing.push('RAZORPAY_WEBHOOK_SECRET missing');
    if (c.store === 'file') missing.push('STORE_DRIVER is "file" — set to "postgres" with DATABASE_URL for production scale');
    if (c.store === 'postgres' && !c.databaseUrl) missing.push('DATABASE_URL missing');
    if (c.auth.mode === 'none') missing.push('AUTH_MODE is "none" — set to "session" with AUTH_SECRET; the role switch is demo-only');
    if (c.auth.mode === 'session' && !c.auth.secret) missing.push('AUTH_SECRET missing (required for session auth)');
    if (c.auth.mode === 'jwt' && !c.auth.jwtSecret) missing.push('JWT_SECRET missing');
  }
  return { ready: missing.length === 0, missing };
}

/** Non-code gates that must be cleared before processing real money. */
const NON_CODE_GATES = [
  // Payments and money
  'Razorpay Route account approved + KYC-verified linked accounts per merchant',
  'CA sign-off on the Merchant-of-Record float and working-capital flow',
  'Payments lawyer sign-off on MoR seller-of-record structure + FEMA export chain',

  // Regulatory officers and policies (Consumer Protection 2020, IT Rules 2021, DPDP 2023)
  'Grievance Officer appointed, contact details published on the site',
  'Nodal Officer appointed (IT Rules 2021); contact published',
  'Data Protection Officer designated under DPDP 2023',
  'Returns, refunds, privacy, terms, grievance policies drafted and reviewed by counsel',

  // Verification provider credentials
  'DigiLocker / NSDL / GSTN / DGFT / RBI provider credentials provisioned',
  'Biometric face-match provider engaged (IDfy or HyperVerge)',

  // Indic + integration credentials
  'IRP (e-invoicing) and Bhashini API credentials provisioned',

  // Banking
  'Authorized Dealer Category-I bank engaged (FEMA inward remittance)',
  'EEFC foreign-currency account opened',

  // Business registration
  'Company incorporated, PAN, TAN, GSTIN, IEC, AD Code, LUT in place',
  'RCMC from relevant Export Promotion Council (EPCH / GJEPC etc.)',
];

module.exports = { config, productionReadiness, NON_CODE_GATES };
