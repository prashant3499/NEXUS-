'use strict';
/**
 * researchAgent — the R&D agent: researches and holds operational intelligence the engine
 * and founder need (export logistics, infrastructure, policy). Ships seeded with verified
 * Rajasthan ICD (Inland Container Depot / dry port) intelligence — the customs-clearance
 * backbone for NEXUS exports from Jaipur — and accepts new findings at runtime.
 */
const sanitize = require('./sanitize');

const KB = {
  export_logistics_rajasthan: {
    title: 'Rajasthan export logistics — ICDs (dry ports) & air cargo',
    updated: '2026-07',
    summary: 'ICDs let NEXUS clear export customs INLAND: stuff + clear at the ICD, rail the sealed container to a seaport, load the vessel — cheaper and faster than trucking uncleaned cargo to port, and it avoids port congestion.',
    facts: [
      { f: 'Jaipur has 2 ICDs (CONCOR + RAJSICO), a Foreign Post Office, 2 Air Cargo Complexes and an international airport — NEXUS\'s home clearance options.', src: 'rajasthancustoms.gov.in' },
      { f: 'Jodhpur has 3 ICDs: Thar Dry Port (India\'s FIRST private ICD, 2001), CONCOR and RAJSICO — western Rajasthan\'s handicraft/furniture export hub.', src: 'rajasthancustoms.gov.in' },
      { f: 'ICD Kota and ICD Bhiwadi also operate; Bhiwadi serves the industrial north; new ICDs proposed at Bhiwadi & Sirohi expansions.', src: 'rajasthancustoms.gov.in' },
      { f: 'Thar Dry Port rail distances: Mundra 628 km, Pipavav 779 km, JNPT ~990 km — Mundra is the natural gateway for Rajasthan craft exports.', src: 'thethardryport.com' },
      { f: 'ICD services: customs clearance on-site (ICES/EDI), FCL/LCL consolidation, container stuffing, bonded warehousing, rail+road multimodal to port.', src: 'industry' },
      { f: 'Small-parcel path: the Foreign Post Office (Jaipur) + air cargo complexes suit low-weight, high-value craft (jewellery, gems, textiles) — courier/postal export before container volumes.', src: 'rajasthancustoms.gov.in' },
    ],
    nexus_use: 'Route: maker → NEXUS consolidation → LCL at ICD Jaipur/Jodhpur (customs cleared inland) → rail to Mundra → vessel. For small orders: FPO/air cargo Jaipur. Marble sculpture (heavy) → FCL via ICD Jodhpur/Thar → Mundra.',
  },
  cluster_development_rajasthan: {
    title: 'Rajasthan Integrated Cluster Development Scheme (ICDS)',
    updated: '2026-07',
    summary: 'State scheme (notified 2 Jan 2025, valid to 31 Mar 2029) to upgrade handicraft, handloom and MSME clusters: skills, quality, raw-material banks, e-commerce marketing, and Common Facility Centres.',
    facts: [
      { f: 'Four components: (I) soft interventions for artisans/weavers + raw-material bank + e-commerce/social-media market development; (II) CFC support with state assistance up to Rs 10 crore (grant up to Rs 8 crore, ~80%); (III) infrastructure for existing/greenfield clusters in non-RIICO areas; (IV) special incentives.', src: 'istart.rajasthan.gov.in policy PDF' },
      { f: 'Implementation vehicle: an SPV (partnership/trust/society/co-operative/producer company) of at least 10 artisans holding registered artisan ID cards.', src: 'policy' },
      { f: 'Application route: DSR-cum-DPR to the General Manager, District Industries & Commerce Centre (DICC); approval by the Project Approval Committee under the Commissioner, Industries & Commerce.', src: 'policy' },
      { f: 'Jan 2026: ~Rs 58 crore in grants approved across 10 projects / 10 clusters in 9 districts (~Rs 69 crore total); CFCs in Bharatpur, Hanumangarh, Phalodi, Kotputli-Behror, Balotra, Dausa and Jaipur; 300+ artisans to be trained.', src: 'KNN India, Jan 2026' },
      { f: 'E-commerce component: eligible artisan needs an artisan ID card and is supported into online selling; exposure-visit grants up to Rs 2 lakh per cluster.', src: 'policy summaries' },
    ],
    nexus_use: 'NEXUS as the e-commerce/market-development partner for ICDS clusters: help a cluster form its 10-artisan SPV, apply via GM DICC, and plug NEXUS in as the consent-gated online sales + provenance + export channel the scheme explicitly funds. CFC districts (Jaipur, Dausa, Balotra...) are warm pilot targets.',
  }
,
  payments_rails: {
    title: 'Payments & payout rails (India)', updated: '2026-07',
    summary: 'Razorpay: ~2% + 18% GST per transaction, no setup/AMC; Route enables split settlement to makers; payouts cost Rs 2-10. Webhooks must be HMAC-verified; every charge/payout must pass the idempotency guard.',
    facts: [
      { f: 'Split-at-gateway (Razorpay Route) keeps NEXUS at zero float — money never sits with the platform.', src: 'engine design' },
      { f: 'Real gross after gateway costs is ~9-10%, not the headline 12% — hold pricing discipline.', src: 'cost model' },
    ],
    nexus_use: 'Wire idempotency.js into live charge/payout calls; verify webhook HMAC; reconcile payments vs payouts daily.',
  },
  kyc_verification_stack: {
    title: 'KYC & verification stack', updated: '2026-07',
    summary: 'DigiLocker/Aadhaar e-KYC needs requester approval (entity required). API Setu offers free PAN/GSTIN verification for partner businesses. e-Shram formalisation only with worker consent.',
    facts: [
      { f: 'Verify partner BUSINESSES (GSTIN/PAN) free via API Setu — no personal data or consent needed.', src: 'apisetu.gov.in' },
      { f: 'Individual KYC (DigiLocker) is the launch gate alongside payments — apply once the entity exists.', src: 'engine readiness' },
    ],
    nexus_use: 'Sequence: entity -> API Setu registration -> DigiLocker requester application -> KYC live.',
  },
  launch_tech_stack: {
    title: 'Launch tech stack (buy, do not build)', updated: '2026-07',
    summary: 'P0 integrations: Clerk/OTP auth, managed Postgres (Neon/Supabase), Razorpay live, Gupshup/Twilio WhatsApp + Resend email, Sentry/Better Stack monitoring, Cloudflare WAF/CDN, GitHub Actions CI, Render auto-deploy.',
    facts: [
      { f: 'Every gap in SAAS-BENCHMARK is an integration, not an invention — total pilot infra cost ~Rs 0-2,500/mo on free tiers.', src: 'benchmark' },
    ],
    nexus_use: 'Work the P0 list top-down; each is env-config against an existing seam in the engine.',
  }
};

const RESEARCH_DOMAINS = [
  'export_logistics (ICDs, ports, air cargo, FPO)', 'government_schemes (central + state, e.g. Rajasthan ICDS)',
  'payments_rails', 'kyc_verification', 'launch_tech_stack', 'market_and_pricing', 'competitors',
  'legal_trademark_compliance', 'cluster_intelligence (GI/ODOP)', 'ai_providers (Krutrim/Sarvam/Anthropic)',
];
function domains() { return RESEARCH_DOMAINS; }

const _findings = [];

function topics() { return Object.keys(KB).map((k) => ({ id: k, title: KB[k].title, updated: KB[k].updated })); }

function research(query) {
  const q = sanitize.sanitizeString(query, 200).toLowerCase();
  const hits = [];
  Object.keys(KB).forEach((k) => {
    const t = KB[k];
    const hay = (k + ' ' + t.title + ' ' + t.summary + ' ' + t.facts.map((x) => x.f).join(' ')).toLowerCase();
    if (!q || q.split(/\s+/).some((w) => w.length > 2 && hay.indexOf(w) >= 0)) hits.push({ topic: k, title: t.title, summary: t.summary, facts: t.facts, nexus_use: t.nexus_use });
  });
  const extra = _findings.filter((x) => !q || (x.topic + ' ' + x.finding).toLowerCase().indexOf(q.split(/\s+/)[0] || '') >= 0);
  return { query: q, matched: hits.length, results: hits, runtime_findings: extra, note: hits.length ? undefined : 'No match in the knowledge base — add a finding or run live research at deploy (web connectors).' };
}

function addFinding(input) {
  input = input || {};
  const entry = { id: 'rf_' + Date.now().toString(36), topic: sanitize.sanitizeString(input.topic, 80) || 'general', finding: sanitize.sanitizeString(input.finding, 1000), src: sanitize.sanitizeString(input.src, 200) || 'founder', at: new Date().toISOString() };
  if (!entry.finding) return { ok: false, error: 'finding text required' };
  _findings.push(entry);
  return { ok: true, entry };
}

function reset() { _findings.length = 0; }

module.exports = { KB, topics, research, addFinding, reset, domains, RESEARCH_DOMAINS };
