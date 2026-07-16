'use strict';

/**
 * founderAdvisor.js
 *
 * "The AI assistant should always know and suggest what to do and how — and
 * whether the founder does it or the AI does it."
 *
 * This composes the platform's own signals — the watchdog findings, the
 * integrations map, the compliance registry, and live metrics — into a single
 * prioritized next-actions list. For each action it says:
 *   • WHAT to do and WHY,
 *   • WHO should do it: the AI (it can act within its autonomy) or the FOUNDER
 *     (it needs a human — money, identity, legal, or a consequential decision),
 *   • HOW (the concrete next step or link).
 *
 * The split is the important part: anything legal/financial/identity or
 * irreversible is the FOUNDER's; routine operational work the AI proposes to do
 * itself (still surfaced, founder-in-the-loop). Pure + dependency-free.
 */

const DOER = Object.freeze({ FOUNDER: 'founder', AI: 'ai' });

/**
 * suggestTasks — build the prioritized next-action list from platform signals.
 * @param {object} signals
 *   - watchdog     { findings:[{severity, area, message}] }   (optional)
 *   - integrations { summary:{ blocking_live_launch:[{name,link}] } } (optional)
 *   - compliance   { summary:{ still_blocking_launch:[{name,issuer}] } } (optional)
 *   - metrics      { mrr_paise, active_sellers }              (optional)
 */
function suggestTasks(signals = {}) {
  const tasks = [];

  // 1) Watchdog criticals first — operational, often AI-actionable.
  const findings = (signals.watchdog && signals.watchdog.findings) || [];
  for (const f of findings) {
    if (f.severity === 'critical' || f.severity === 'watch') {
      tasks.push({
        priority: f.severity === 'critical' ? 1 : 3,
        what: `Resolve: ${f.message}`,
        why: `Watchdog flagged a ${f.severity} issue in ${f.area}.`,
        who: f.area === 'solvency' || f.area === 'payout' ? DOER.FOUNDER : DOER.AI,
        how: f.area === 'solvency' ? 'Review pricing/costs; the AI can draft options, you approve.' : 'The AI can action this under its autonomy; confirm if asked.',
      });
    }
  }

  // 2) Launch-blocking LEGAL/FINANCIAL — always the founder's (human-only).
  const compBlock = (signals.compliance && signals.compliance.summary && signals.compliance.summary.still_blocking_launch) || [];
  for (const c of compBlock) {
    tasks.push({
      priority: 2,
      what: `Obtain: ${c.name}`,
      why: `Legally required before launch (issuer: ${c.issuer}).`,
      who: DOER.FOUNDER,
      how: 'Founder + CA/lawyer task — the AI cannot obtain a registration for you, but can prepare documents and track status.',
    });
  }

  // 3) Missing required integrations — founder provides the credential, AI uses it.
  const intBlock = (signals.integrations && signals.integrations.summary && signals.integrations.summary.blocking_live_launch) || [];
  for (const i of intBlock) {
    tasks.push({
      priority: 2,
      what: `Connect: ${i.name}`,
      why: 'A required integration is on a mock until connected.',
      who: DOER.FOUNDER,
      how: `Get the credential (${i.link}) and set it; the AI then operates it automatically.`,
    });
  }

  // 4) Growth — AI-proposable once the platform is live.
  const mrr = (signals.metrics && signals.metrics.mrr_paise) || 0;
  const sellers = (signals.metrics && signals.metrics.active_sellers) || 0;
  if (sellers === 0) {
    tasks.push({ priority: 4, what: 'Source the first sellers', why: 'No active sellers yet — the platform needs supply.', who: DOER.AI, how: 'The AI can generate per-vertical sourcing targets; you approve outreach.' });
  } else if (mrr === 0) {
    tasks.push({ priority: 4, what: 'Convert sellers to first paid sale', why: 'Sellers onboarded but no revenue.', who: DOER.AI, how: 'The AI can run activation campaigns + scheme matching; you set the budget.' });
  }

  tasks.sort((a, b) => a.priority - b.priority);
  return {
    tasks,
    counts: { total: tasks.length, founder: tasks.filter((t) => t.who === DOER.FOUNDER).length, ai: tasks.filter((t) => t.who === DOER.AI).length },
    headline: tasks.length
      ? `${tasks.length} suggested action(s): ${tasks.filter((t) => t.who === 'founder').length} need you, ${tasks.filter((t) => t.who === 'ai').length} the AI can drive.`
      : 'Nothing pressing — the platform is healthy. The AI will keep watching.',
  };
}

module.exports = { DOER, suggestTasks };
