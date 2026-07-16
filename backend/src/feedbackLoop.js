'use strict';

/**
 * feedbackLoop.js
 *
 * A platform that doesn't learn from what happens decays. This closes the loop:
 * it ingests signals from across the system — buyer reviews, returns, disputes,
 * seller sentiment, watchdog findings — and turns them into prioritized,
 * actionable insights, so problems surface early and what's working compounds.
 *
 *   signal → aggregate → insight (with a suggested action) → (founder/AI acts) → measure again
 *
 * The insight is the valuable part: not "here are 200 data points," but "returns
 * on vertical X are climbing — look here." Pure + dependency-free.
 */

const SIGNAL = Object.freeze({
  REVIEW: 'review', RETURN: 'return', DISPUTE: 'dispute',
  SELLER_SENTIMENT: 'seller_sentiment', WATCHDOG: 'watchdog', BUYER_NPS: 'buyer_nps',
});

const SEVERITY = Object.freeze({ POSITIVE: 'positive', NEUTRAL: 'neutral', WATCH: 'watch', CRITICAL: 'critical' });

function emptyState() { return { signals: [], updated_at: null }; }

/** record — ingest one signal. */
function record(state, signal, now = Date.now()) {
  if (!signal || !signal.type) return state;
  state.signals.push({ type: signal.type, vertical: signal.vertical || 'all', value: signal.value, ref: signal.ref || null, at: now });
  state.updated_at = now;
  return state;
}

/**
 * analyze — turn the raw signals into insights. Looks for trends that matter:
 * rising returns/disputes, falling ratings, negative seller sentiment.
 * @returns { insights[], health }
 */
function analyze(state, opts = {}) {
  const sig = state.signals || [];
  const insights = [];
  const byVertical = {};
  for (const s of sig) {
    const v = (byVertical[s.vertical] = byVertical[s.vertical] || { review: [], return: 0, dispute: 0, sentiment: [] });
    if (s.type === SIGNAL.REVIEW) v.review.push(s.value);
    else if (s.type === SIGNAL.RETURN) v.return += 1;
    else if (s.type === SIGNAL.DISPUTE) v.dispute += 1;
    else if (s.type === SIGNAL.SELLER_SENTIMENT) v.sentiment.push(s.value);
  }

  for (const [vertical, d] of Object.entries(byVertical)) {
    const orders = Math.max(1, (opts.orders_by_vertical && opts.orders_by_vertical[vertical]) || d.return + d.dispute + d.review.length);
    const returnRate = d.return / orders;
    const avgReview = d.review.length ? d.review.reduce((a, b) => a + b, 0) / d.review.length : null;
    const avgSentiment = d.sentiment.length ? d.sentiment.reduce((a, b) => a + b, 0) / d.sentiment.length : null;

    if (returnRate > 0.15) {
      insights.push({ vertical, severity: SEVERITY.CRITICAL, signal: 'returns', metric: Math.round(returnRate * 100) + '% return rate',
        action: `Investigate quality/expectations in ${vertical} — high returns erode margin and trust.`, who: 'founder' });
    } else if (returnRate > 0.08) {
      insights.push({ vertical, severity: SEVERITY.WATCH, signal: 'returns', metric: Math.round(returnRate * 100) + '% return rate',
        action: `Watch returns in ${vertical}; the AI can flag the worst-reviewed listings.`, who: 'ai' });
    }
    if (d.dispute >= 3) {
      insights.push({ vertical, severity: SEVERITY.WATCH, signal: 'disputes', metric: d.dispute + ' disputes',
        action: `Review dispute causes in ${vertical}; tighten listing accuracy.`, who: 'ai' });
    }
    if (avgReview != null && avgReview < 3.5) {
      insights.push({ vertical, severity: SEVERITY.WATCH, signal: 'ratings', metric: 'avg rating ' + Math.round(avgReview * 10) / 10,
        action: `Ratings below par in ${vertical} — coach the low-rated makers.`, who: 'ai' });
    } else if (avgReview != null && avgReview >= 4.5 && d.review.length >= 5) {
      insights.push({ vertical, severity: SEVERITY.POSITIVE, signal: 'ratings', metric: 'avg rating ' + Math.round(avgReview * 10) / 10,
        action: `${vertical} is delighting buyers — double down on sourcing here.`, who: 'ai' });
    }
    if (avgSentiment != null && avgSentiment < 3) {
      insights.push({ vertical, severity: SEVERITY.WATCH, signal: 'seller_sentiment', metric: 'seller sentiment ' + Math.round(avgSentiment * 10) / 10,
        action: `Makers in ${vertical} are unhappy — find out why before they churn.`, who: 'founder' });
    }
  }

  insights.sort((a, b) => {
    const rank = { critical: 0, watch: 1, neutral: 2, positive: 3 };
    return rank[a.severity] - rank[b.severity];
  });
  const worst = insights.find((i) => i.severity === SEVERITY.CRITICAL) ? SEVERITY.CRITICAL
    : insights.find((i) => i.severity === SEVERITY.WATCH) ? SEVERITY.WATCH : SEVERITY.POSITIVE;
  return {
    insights,
    health: { overall: insights.length ? worst : SEVERITY.NEUTRAL, signal_count: sig.length, insight_count: insights.length },
    headline: insights.length ? `${insights.length} insight(s) from ${sig.length} signals — worst: ${worst}.` : 'No signals yet — the loop will surface insights as activity grows.',
  };
}

module.exports = { SIGNAL, SEVERITY, emptyState, record, analyze };
