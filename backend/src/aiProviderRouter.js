'use strict';

/**
 * aiProviderRouter.js
 *
 * Aligns the platform's AI with India's national AI mission — and makes it
 * better for the makers it serves.
 *
 * India's IndiaAI Mission (₹10,372 cr, MeitY) has stood up sovereign,
 * multilingual foundation models — Sarvam, BharatGen (IIT-Bombay), Gnani (voice)
 * and others — trained on Indian datasets and languages, plus subsidised
 * national GPU compute for startups, the AIKosh datasets platform, and a
 * "Safe & Trusted AI" pillar. A platform whose core users are non-literate,
 * Indian-language artisans should prefer those models for Indian-language work:
 * they handle Indian languages and context better, keep data within national
 * borders, are mission-aligned, and can run on subsidised sovereign compute.
 *
 * This router chooses the right provider PER TASK and PER LANGUAGE:
 *   • Indian-language generation/voice  → prefer a sovereign Indian model
 *     (Sarvam / BharatGen / Gnani), then fall back.
 *   • Translation across Indian langs   → Bhashini (the national DPI), already
 *     wired in translateRouter.
 *   • English / complex reasoning / code → a frontier general model.
 * Every provider is an honest SEAM: mock now, real on a key. The router never
 * pretends a model is connected when it is not.
 *
 * This is the "AI for All" application the mission explicitly targets:
 * inclusive, multilingual, responsible AI for the informal economy.
 *
 * Pure + dependency-free.
 */

// Indian languages where a sovereign multilingual model is preferred.
const INDIC = ['hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur'];

// Provider registry — sovereign Indian models first for Indic work. Each is a
// seam: `live` only when a credential is present.
const PROVIDERS = Object.freeze({
  sarvam:    { label: 'Sarvam AI (sovereign, Indic LLM)', kind: 'indian_sovereign', strengths: ['indic_text', 'voice'], mission_aligned: true },
  bharatgen: { label: 'BharatGen (IIT-Bombay, sovereign multimodal)', kind: 'indian_sovereign', strengths: ['indic_text', 'multimodal'], mission_aligned: true },
  gnani:     { label: 'Gnani AI (sovereign voice-first)', kind: 'indian_sovereign', strengths: ['voice', 'indic_text'], mission_aligned: true },
  bhashini:  { label: 'Bhashini (national translation DPI)', kind: 'national_dpi', strengths: ['translation'], mission_aligned: true },
  frontier:  { label: 'Frontier general model', kind: 'general', strengths: ['reasoning', 'code', 'english'], mission_aligned: false },
});

/**
 * route — pick the provider chain for a task.
 * @param task { type: 'generate'|'translate'|'voice'|'reason'|'code', language }
 * @param creds { sarvam, bharatgen, gnani, bhashini, frontier } truthy = connected
 * @returns { primary, fallbacks[], rationale, live }
 */
function route(task = {}, creds = {}) {
  const lang = task.language || 'en';
  const isIndic = INDIC.includes(lang);
  let order;

  if (task.type === 'translate') {
    order = ['bhashini', 'frontier'];
  } else if (task.type === 'voice') {
    order = isIndic ? ['gnani', 'sarvam', 'frontier'] : ['frontier'];
  } else if (task.type === 'generate' && isIndic) {
    // Indian-language listing/description → sovereign Indic models first.
    order = ['sarvam', 'bharatgen', 'frontier'];
  } else if (task.type === 'reason' || task.type === 'code') {
    order = ['frontier']; // complex reasoning/code → frontier general model
  } else {
    order = isIndic ? ['sarvam', 'frontier'] : ['frontier'];
  }

  const primary = order[0];
  const live = !!creds[primary];
  return {
    task: task.type || 'generate',
    language: lang,
    primary,
    primary_label: PROVIDERS[primary].label,
    fallbacks: order.slice(1),
    chain: order,
    mission_aligned: PROVIDERS[primary].mission_aligned,
    live,
    rationale: isIndic && PROVIDERS[primary].kind === 'indian_sovereign'
      ? `${lang} is an Indian language → prefer a sovereign Indic model (better language handling, data stays in India, IndiaAI-aligned). Falls back if not yet connected.`
      : task.type === 'translate'
      ? 'Translation routes to Bhashini, the national language DPI.'
      : 'English/complex task → frontier general model.',
    note: live ? null : `${PROVIDERS[primary].label} is a seam — connect a key to go live; until then it falls back to ${order.find((p) => creds[p]) || 'mock'}.`,
  };
}

/** missionAlignment — how the platform maps onto the IndiaAI Mission pillars. */
function missionAlignment() {
  return {
    mission: 'IndiaAI Mission (MeitY, ₹10,372 cr)',
    pillars: [
      { pillar: 'Application Development', fit: 'A real AI-for-All application: inclusive commerce for non-literate, Indian-language artisans.' },
      { pillar: 'Foundation Models (Innovation Centre)', fit: 'Consumes sovereign Indic models (Sarvam/BharatGen/Gnani) for listings + voice.' },
      { pillar: 'Compute Capacity', fit: 'Can run inference on subsidised national GPU compute available to Indian startups.' },
      { pillar: 'Datasets Platform (AIKosh)', fit: 'Can use AIKosh non-personal datasets; could contribute anonymised craft-language data.' },
      { pillar: 'Safe & Trusted AI', fit: 'Invariants, self-audit, anti-greenwashing, consent + child-safety, and no-fabrication = responsible-AI by construction.' },
      { pillar: 'FutureSkills / Startup Financing', fit: 'Eligible for IndiaAI startup support; upskills artisans into digital commerce.' },
    ],
    dpi_stack: ['Bhashini (language)', 'ONDC (commerce)', 'DigiLocker/Aadhaar (identity)', 'UPI (payments)'],
    summary: 'NEXUS is a near-textbook IndiaAI "People + Progress" application: sovereign-model-ready, built on India\u2019s DPI, responsible by design, serving inclusive economic growth.',
  };
}

module.exports = { INDIC, PROVIDERS, route, missionAlignment };
