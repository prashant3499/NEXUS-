'use strict';

/**
 * governmentAlignment.js
 *
 * An economist's view: where this platform sits in India's economic policy
 * architecture, for BOTH the central government and regional (state)
 * governments — and the impact metrics each level actually cares about.
 *
 * The core economic thesis: India's craft/skilled economy is large, informal,
 * and underserved. Formalising it — bringing undocumented artisans into the
 * tax net, the banking system, and export markets — is a shared priority of
 * almost every economic ministry. This platform lowers the government's *cost*
 * of that formalisation: it does the onboarding, compliance, and payment rails
 * that the state struggles to do at the last mile. That makes it natural public
 * economic infrastructure, and a credible PPP / scheme-delivery partner.
 *
 * Honest framing: the impact figures here are POLICY-GRADE PROJECTIONS from
 * transparent per-artisan assumptions — useful for a grant application or an
 * MoU, but not validated outcomes. Real numbers come only from a pilot.
 *
 * Pure + dependency-free.
 */

// ── CENTRAL government economic alignment ──
const CENTRAL = Object.freeze([
  { priority: 'Formalisation of the informal economy', vehicle: 'GST / Udyam / digital records', fit: 'MoR brings undocumented artisans into the formal + tax net without forcing them to register first.' },
  { priority: 'Non-farm rural livelihoods', vehicle: 'Ministry of Textiles, KVIC, PM Vishwakarma', fit: 'Sustains and raises artisan incomes — craft is a top rural employer after agriculture.' },
  { priority: 'Exports & forex', vehicle: 'EPCH, DGFT, IEC', fit: 'Enables compliant craft export for makers who could never handle EXIM paperwork alone.' },
  { priority: 'Financial inclusion', vehicle: 'Jan Dhan, UPI, Account Aggregator', fit: 'Routes verified digital payments to artisans\u2019 bank accounts; transaction history can unlock credit.' },
  { priority: 'Vocal for Local / Atmanirbhar Bharat', vehicle: 'Make in India', fit: 'A trust rail for genuinely Indian-made, provenance-verified goods.' },
  { priority: 'GI / cultural-IP protection', vehicle: 'GI Registry (CGPDTM)', fit: 'Verifies GI authorised-user status, protecting regional cultural-economic value.' },
  { priority: 'Digital public infrastructure', vehicle: 'ONDC, Bhashini, Aadhaar, IndiaAI', fit: 'Native to the DPI stack; portable reputation rides ONDC.' },
  { priority: "Women's economic empowerment", vehicle: 'DAY-NRLM, SHG missions', fit: 'Much craft labour is women + SHGs; the platform formalises and grows their earnings.' },
]);

// ── STATE / REGIONAL government alignment ──
const STATE = Object.freeze([
  { program: 'ODOP (One District One Product)', body: 'State industries / DIC', fit: 'Digitises and markets a district\u2019s signature craft; the platform is a ready ODOP commerce + provenance rail.' },
  { program: 'State Handloom & Handicraft Boards', body: 'State textile/handicraft dept', fit: 'Onboards board-registered artisans; supplies state emporiums with verified stock.' },
  { program: 'State SHG / livelihood missions', body: 'e.g. Kudumbashree (KL), JEEViKA (BR), state NRLM cells', fit: 'Bulk-onboards women\u2019s SHGs; cooperative payout splits fit SHG structures.' },
  { program: 'District Industries Centres (DIC)', body: 'District administration', fit: 'Last-mile artisan identification + scheme delivery at the cluster level.' },
  { program: 'State Emporiums & Craft Melas', body: 'State handicraft corporations', fit: 'Verified supply + provenance for emporiums, Dilli Haat, and state fairs.' },
  { program: 'State Tourism Boards', body: 'State tourism dept', fit: 'Safety-verified craft experiences + workshops as tourism products.' },
  { program: 'Regional GI clusters', body: 'GI authorised-user bodies', fit: 'Protects and markets GI crafts (Banarasi, Kutch, blue pottery, Pochampally\u2026) with verified provenance.' },
]);

/**
 * economicImpact — policy-grade projection of the outcomes governments measure,
 * from transparent per-artisan assumptions. @param scale { artisans, avgAnnualGmvRupees }
 */
function economicImpact(scale = {}) {
  const artisans = scale.artisans || 1000;
  const avgGmv = scale.avgAnnualGmvRupees || 120000; // ₹10k/mo avg, conservative
  const gmv = artisans * avgGmv;
  // Assumptions (transparent, conservative):
  const womenShare = 0.55;          // craft labour skews female
  const exportShare = 0.15;         // share of GMV exportable
  const incomeUpliftShare = 0.20;   // income raised vs prior informal selling
  const effectiveTaxRate = 0.02;    // TCS/GST into exchequer on GMV (blended)
  return {
    scale: { artisans, avg_annual_gmv_rupees: avgGmv },
    formalisation: { artisans_formalised: artisans, note: 'Brought into formal/digital + tax-visible economy without prior registration.' },
    livelihoods: { livelihoods_supported: artisans, women_artisans_est: Math.round(artisans * womenShare), income_uplift_rupees_est: Math.round(gmv * incomeUpliftShare) },
    exchequer: { gmv_rupees: gmv, tax_to_exchequer_rupees_est: Math.round(gmv * effectiveTaxRate), note: 'TCS/GST collected + remitted by the platform as MoR.' },
    exports: { export_gmv_rupees_est: Math.round(gmv * exportShare), note: 'Forex from craft exports the makers could not have done alone.' },
    financial_inclusion: { bank_accounts_activated_est: artisans, note: 'Verified digital payouts; transaction history can unlock formal credit.' },
    disclaimer: 'POLICY-GRADE PROJECTION from stated assumptions — for grant/MoU framing, not a validated result. A pilot replaces these with real figures.',
  };
}

/** partnershipPathways — how government can engage, by mechanism. */
function partnershipPathways() {
  return [
    { mechanism: 'Scheme-delivery rail', desc: 'Be the last-mile rail that delivers PM Vishwakarma / NRLM / MSME benefits + onboards beneficiaries — the state\u2019s hardest, costliest step.' },
    { mechanism: 'State ODOP / SHG adoption', desc: 'A state adopts the platform for a district cluster or its SHG mission; per-state partnership or co-branded deployment.' },
    { mechanism: 'PPP / viability-gap support', desc: 'Public co-funding of artisan onboarding, since the platform reduces the state\u2019s formalisation cost-per-artisan.' },
    { mechanism: 'IndiaAI / Startup financing', desc: 'Eligible as a responsible-AI, DPI-native startup for IndiaAI startup support + subsidised compute.' },
    { mechanism: 'Measurement partner', desc: 'Supply formalisation / livelihood / export dashboards governments need to evidence scheme outcomes.' },
  ];
}

function alignmentSummary() {
  return {
    thesis: 'NEXUS lowers the government\u2019s cost of formalising the informal craft economy — onboarding, compliance, and payment rails the state struggles to deliver at the last mile.',
    central_priorities: CENTRAL.length,
    state_programs: STATE.length,
    strongest_pitch: 'To a state: "Adopt this for your ODOP/SHG cluster and we formalise your artisans, route payments to their banks, enable exports, and hand you the outcome dashboard — at a fraction of doing it yourself."',
    honest_note: 'Alignment is a powerful funding + credibility tailwind, not proof of demand. It helps a government fund the pilot; it does not replace it.',
  };
}

module.exports = { CENTRAL, STATE, economicImpact, partnershipPathways, alignmentSummary };
