'use strict';

/**
 * integrations.js
 *
 * The platform cannot sign up for its own API keys — those need a human, a
 * payment method, and KYC under the founder's identity. But it CAN do the next
 * best thing: know exactly what it needs to operate, where to get each one,
 * which are already connected, and which still block a live launch. This is the
 * founder's single source of truth for "what must I reach for to operate."
 *
 * Each integration is grounded in a credential the code actually reads. For
 * each one: what it powers, the env var(s), the link to obtain it, whether it's
 * REQUIRED before going live, and whether the platform falls back to a safe
 * MOCK without it (so dev/demo keeps working). The status is computed from the
 * live environment — nothing is assumed connected.
 *
 * Pure + dependency-free; the server passes `process.env` in.
 */

const CATEGORY = Object.freeze({
  PAYMENTS: 'payments', AI: 'ai', MAPS: 'maps', NETWORK: 'network',
  INSURANCE: 'insurance', SECURITY: 'security', COMPLIANCE: 'compliance',
  LANGUAGE: 'language', INFRA: 'infra',
});

// The registry. `env` lists the env var(s) that must ALL be present for this to
// count as connected. `link` is where the founder obtains it.
const INTEGRATIONS = Object.freeze([
  {
    id: 'razorpay', name: 'Razorpay (payments + Route split-settlement)', category: CATEGORY.PAYMENTS,
    powers: 'Collecting buyer payments and splitting the maker payout straight to their bank (T+2). The platform holds zero float.',
    env: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'], also: ['RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_ROUTE_ENABLED'],
    link: 'https://dashboard.razorpay.com/signup', required_for_live: true, has_mock: true,
    note: 'Route requires activation + linked accounts for each settlement party.',
  },
  {
    id: 'anthropic', name: 'Anthropic API (the AI co-founder + agents)', category: CATEGORY.AI,
    powers: 'Every AI capability: the co-founder, the 6 agents, ad generation, support, listing drafts.',
    env: ['ANTHROPIC_API_KEY'], link: 'https://console.anthropic.com/settings/keys',
    required_for_live: true, has_mock: true,
    note: 'Without it, AI features return an honest "not connected" rather than failing.',
  },
  {
    id: 'auth_secret', name: 'Auth secret + founder token', category: CATEGORY.SECURITY,
    powers: 'Signing login sessions and gating founder-only endpoints. Dev uses a default; production MUST set a strong random secret.',
    env: ['AUTH_SECRET'], also: ['FOUNDER_TOKEN', 'COFOUNDER_TOKEN'],
    link: 'Generate: openssl rand -hex 32', required_for_live: true, has_mock: true,
    note: 'The single most important production secret. Never ship the dev default.',
  },
  {
    id: 'google_maps', name: 'Google Maps API', category: CATEGORY.MAPS,
    powers: 'Cluster geocoding, tourism place lookups, logistics distance.',
    env: ['GOOGLE_MAPS_API_KEY'], link: 'https://console.cloud.google.com/google/maps-apis',
    required_for_live: false, has_mock: true,
  },
  {
    id: 'ondc', name: 'ONDC subscriber credentials', category: CATEGORY.NETWORK,
    powers: 'Publishing the catalog to the national open network so buyers on any app can discover it.',
    env: ['ONDC_SUBSCRIBER_ID', 'ONDC_SIGNING_KEY'], link: 'https://portal.ondc.org',
    required_for_live: false, has_mock: true,
    note: 'Requires registry registration + signing keys. Optional at launch, high-value soon after.',
  },
  {
    id: 'insurer', name: 'Licensed insurer partner API', category: CATEGORY.INSURANCE,
    powers: 'Binding transit / high-value / experience cover. The platform facilitates only — never bears risk.',
    env: ['INSURER_API_KEY', 'INSURER_ID'], link: 'Partner with an IRDAI-licensed insurer or registered insurtech',
    required_for_live: false, has_mock: true,
    note: 'Needed before offering real cover; mock quotes work for demo.',
  },
  {
    id: 'bhashini', name: 'Bhashini (Indic translation)', category: CATEGORY.LANGUAGE,
    powers: 'Translating the platform + listings across 13 Indian languages, for low-literacy sellers.',
    env: ['BHASHINI_API_KEY'], link: 'https://bhashini.gov.in', required_for_live: false, has_mock: true,
  },
  {
    id: 'gstin', name: 'Platform GSTIN + tax registration', category: CATEGORY.COMPLIANCE,
    powers: 'Collecting TCS (Sec 52 CGST) and issuing compliant invoices as Merchant of Record.',
    env: ['PLATFORM_GSTIN'], also: ['PLATFORM_IEC', 'PLATFORM_LUT'],
    link: 'https://www.gst.gov.in (register the platform entity)', required_for_live: true, has_mock: false,
    note: 'No safe mock — real tax compliance requires a real GSTIN. Founder + CA task.',
  },
  {
    id: 'database', name: 'Postgres database', category: CATEGORY.INFRA,
    powers: 'Durable, concurrent storage of money records before high write volume. File store is fine for a pilot only.',
    env: ['DATABASE_URL'], link: 'Any managed Postgres (Neon, Supabase, RDS)',
    required_for_live: false, has_mock: true,
    note: 'Required before SCALE, not before a pilot. The store interface is ready for the swap.',
  },
  {
    id: 'monitoring', name: 'Error monitoring (Sentry) + uptime', category: CATEGORY.INFRA,
    powers: 'Catching production errors and watching uptime.',
    env: ['SENTRY_DSN'], also: ['UPTIME_CHECK_URL'], link: 'https://sentry.io',
    required_for_live: false, has_mock: true,
  },
]);

function _present(env, keys) { return keys.every((k) => env[k] && String(env[k]).trim() !== ''); }

/**
 * status — compute the live state of every integration from the environment.
 * @returns { integrations[], summary }
 */
function status(env = {}) {
  const integrations = INTEGRATIONS.map((it) => {
    const connected = _present(env, it.env);
    return {
      id: it.id, name: it.name, category: it.category, powers: it.powers,
      env: it.env, link: it.link, note: it.note || null,
      required_for_live: it.required_for_live, has_mock: it.has_mock,
      connected,
      // What the platform does RIGHT NOW without it.
      current_mode: connected ? 'live' : (it.has_mock ? 'mock_fallback' : 'unavailable'),
    };
  });
  const required = integrations.filter((i) => i.required_for_live);
  const requiredMissing = required.filter((i) => !i.connected);
  const optional = integrations.filter((i) => !i.required_for_live);
  return {
    integrations,
    summary: {
      total: integrations.length,
      connected: integrations.filter((i) => i.connected).length,
      required_total: required.length,
      required_connected: required.filter((i) => i.connected).length,
      blocking_live_launch: requiredMissing.map((i) => ({ id: i.id, name: i.name, link: i.link })),
      live_ready: requiredMissing.length === 0,
      optional_connected: optional.filter((i) => i.connected).length,
      optional_total: optional.length,
      headline: requiredMissing.length === 0
        ? 'All required integrations are connected — the platform can operate live.'
        : `${requiredMissing.length} required integration(s) still needed before going live.`,
    },
  };
}

/**
 * nextActions — the founder's prioritized to-do: the required-but-missing
 * integrations first, each with where to get it.
 */
function nextActions(env = {}) {
  const s = status(env);
  return s.integrations
    .filter((i) => !i.connected)
    .sort((a, b) => (b.required_for_live - a.required_for_live))
    .map((i) => ({
      do: `Connect ${i.name}`,
      why: i.powers,
      where: i.link,
      env_vars: i.env,
      priority: i.required_for_live ? 'required_for_live' : 'optional',
      until_then: i.has_mock ? 'Running on a safe mock.' : 'This capability is unavailable until connected.',
    }));
}

module.exports = { CATEGORY, INTEGRATIONS, status, nextActions };
