'use strict';

/**
 * governmentLiaisonAgent.js
 *
 * "Do we need an agent to connect with government?" Yes — but with an honest
 * boundary, because connecting with government is partly something software
 * cannot do.
 *
 * WHAT THIS AGENT CAN DO (and does well):
 *   • Match the platform/cluster to the RIGHT government body + schemes.
 *   • Assemble a tailored engagement package for a specific body: the pitch in
 *     that body's language (a state ODOP cell hears something different from a
 *     central ministry or TRIFED), the eligible schemes + application
 *     checklists, the economic-impact projection they measure on, and a draft
 *     outreach note.
 *   • Track the engagement pipeline by stage.
 *
 * WHAT IT CANNOT DO (and must never pretend to):
 *   • Build the relationship. Government partnerships are human, relational,
 *     slow, and political. No agent attends the meeting, earns the official's
 *     trust, negotiates the MoU, or gets the sign-off. The FOUNDER does that.
 *   • Submit real applications or sign anything — those need real credentials
 *     and a real human.
 *
 * So this is a government-engagement PREPARATION + TRACKING agent, not an
 * autonomous "connect with government" agent. It hands the founder a ready
 * briefcase; the founder walks into the room. Consistent with every agent here:
 * it prepares and routes; the human acts.
 *
 * Composes governmentAlignment + schemes. Pure + dependency-free.
 */

const gov = require('./governmentAlignment');
const schemes = require('./schemes');

const BODY_TYPE = Object.freeze({ CENTRAL_MINISTRY: 'central_ministry', STATE_DEPT: 'state_dept', AGENCY: 'agency' });

// Pipeline stages — what the agent can advance vs what needs the founder.
const STAGES = Object.freeze(['identified', 'package_prepared', 'outreach_drafted', 'contacted', 'meeting', 'proposal_mou', 'live']);
const AGENT_CAN_REACH = 'outreach_drafted'; // everything up to & including this; beyond is human

/**
 * prepareEngagement — assemble a tailored package for a specific government body.
 * @param ctx { body, bodyType, level: 'central'|'state', vertical, cluster,
 *              artisans, archetype }
 */
function prepareEngagement(ctx = {}) {
  const level = ctx.level === 'central' ? 'central' : 'state';
  const vertical = ctx.vertical || 'handicraft';
  const artisans = ctx.artisans || 500;

  // The right alignment points for this level.
  const alignment = level === 'central' ? gov.CENTRAL : gov.STATE;

  // Eligible schemes for the maker profile (the carrot for the body + artisans).
  let eligible = [];
  try {
    eligible = (schemes.findEligibleSchemes ? schemes.findEligibleSchemes({ archetype: ctx.archetype || 'karigar', vertical, hasUdyam: false }) : []) || [];
  } catch (e) { eligible = []; }

  // The impact numbers this body measures on.
  const impact = gov.economicImpact({ artisans, avgAnnualGmvRupees: ctx.avgAnnualGmvRupees || 120000 });

  // The pitch, framed for the body.
  const pitch = level === 'central'
    ? `To ${ctx.body || 'the ministry'}: NEXUS formalises informal artisans into the tax + banking + export system without forcing prior registration — lowering the state's cost of formalisation. At ${artisans} artisans: ${impact.formalisation.artisans_formalised} formalised, ~${impact.livelihoods.women_artisans_est} women supported, ~₹${impact.exchequer.tax_to_exchequer_rupees_est.toLocaleString('en-IN')} to the exchequer, ~₹${impact.exports.export_gmv_rupees_est.toLocaleString('en-IN')} export GMV.`
    : `To ${ctx.body || 'the state department'}: adopt NEXUS for your ${ctx.cluster || 'district cluster'} / SHG mission — we onboard your artisans, route payments to their banks, enable verified provenance + exports, and hand you the outcome dashboard, at a fraction of doing it in-house.`;

  return {
    body: ctx.body || (level === 'central' ? 'Central ministry' : 'State department'),
    level,
    vertical,
    pitch,
    alignment_points: alignment.slice(0, 4),
    eligible_schemes: eligible.map((s) => ({ id: s.id || s.scheme || s, name: s.name || s.id || s })),
    impact_projection: impact,
    draft_outreach: `Subject: Formalising ${ctx.cluster || vertical} artisans \u2014 a ready rail for ${ctx.body || 'your programme'}\n\nRespected Sir/Madam,\n\nWe operate a trust & compliance platform that brings undocumented artisans into the formal economy \u2014 verified, paid to their bank, compliant \u2014 carrying the tax/legal weight ourselves. For your ${ctx.cluster || vertical} cluster this means measurable formalisation, livelihoods, and export outcomes (projection attached). We would value 20 minutes to explore a pilot.\n\n[Founder name] \u00b7 [contact]`,
    who_does_what: {
      agent_prepared: ['matched the body + schemes', 'framed the pitch', 'built the impact projection', 'drafted the outreach'],
      founder_must_do: ['send it from a real identity', 'build the relationship', 'attend meetings', 'negotiate + sign the MoU', 'submit real applications with credentials'],
    },
    honest_note: 'This is a ready briefcase, not a relationship. The agent cannot connect with government on its own \u2014 it prepares; you walk into the room. Government partnerships are human, slow, and earned.',
  };
}

/** advance — move a pipeline item, honest about who can advance it. */
function advance(currentStage) {
  const idx = STAGES.indexOf(currentStage);
  if (idx < 0) return { ok: false, reason: `Unknown stage: ${currentStage}` };
  const next = STAGES[idx + 1] || null;
  if (!next) return { ok: true, stage: currentStage, done: true, note: 'Live partnership.' };
  const reachIdx = STAGES.indexOf(AGENT_CAN_REACH);
  const who = idx < reachIdx ? 'agent_can_advance' : 'founder';
  return { ok: true, from: currentStage, to: next, who, note: who === 'founder' ? 'Beyond drafting, only the founder can advance a government relationship.' : 'The agent can prepare this step.' };
}

module.exports = { BODY_TYPE, STAGES, AGENT_CAN_REACH, prepareEngagement, advance };
