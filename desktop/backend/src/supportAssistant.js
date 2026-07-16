'use strict';

/**
 * supportAssistant.js
 *
 * The customer-facing AI assistant. The founder has a co-founder assistant;
 * the platform's CUSTOMERS — artisans, sellers, buyers — need their own. Most
 * of them are first-time users, many low-literacy, many on a phone in a
 * language other than English. They will have the same few hundred questions:
 * "when do I get paid?", "how do I list?", "what is my tier?", "is my craft
 * verified?", "how do returns work?".
 *
 * This assistant answers those questions GROUNDED in the platform's real
 * mechanics (never invented), pulls in the asker's own account facts when
 * available, and ESCALATES to a human grievance when it cannot help or when
 * the message is a complaint. Every confidently-answered question is a support
 * contact deflected — which is a real operating-cost saving for a 2%-opex SaaS.
 *
 * It is deterministic and dependency-free: intent is matched by keyword
 * scoring over a curated knowledge base. A live LLM can layer on top later for
 * phrasing, but the FACTS come from here so answers are always correct.
 */

const AUDIENCE = Object.freeze({ SELLER: 'seller', BUYER: 'buyer', ANY: 'any' });

// Curated, grounded knowledge base. Each entry: an intent, the audience, the
// keywords that match it, and an answer builder (so account facts can be
// woven in). Answers state ONLY what the platform actually does.
const KNOWLEDGE = [
  {
    id: 'payout_timing', audience: AUDIENCE.SELLER,
    keywords: ['paid', 'payment', 'payout', 'settle', 'settlement', 'money', 'bank', 'when', 'receive', 'kab', 'paisa'],
    answer: () => 'You are paid directly to your registered bank account about two days (T+2) after the buyer pays. The platform never holds your money — at the moment a sale is captured, your share is split out and routed straight to your bank. There is no 30-day wait.',
  },
  {
    id: 'commission', audience: AUDIENCE.SELLER,
    keywords: ['commission', 'cut', 'fee', 'charge', 'percent', 'percentage', 'how much', 'deduct', 'take'],
    answer: (ctx) => `The platform earns a published commission on each sale${ctx.tier ? ` for your ${ctx.tier} tier` : ''} plus your subscription. There are no hidden fees, no per-listing charges, and no surprise "marketing" deductions. Every transaction is split to the paise and is auditable — you can see exactly what you receive before you confirm.`,
  },
  {
    id: 'how_to_list', audience: AUDIENCE.SELLER,
    keywords: ['list', 'add', 'upload', 'sell', 'product', 'create', 'photo', 'item', 'banao', 'kaise'],
    answer: () => 'To list a product: open Sell, tap Add product, and add a photo with a short description — you can speak it in your own language and the assistant turns it into a listing. Set a price and stock, then submit for review. Once approved it goes live. You must have completed your consent + selling authorization at signup before a listing can go live.',
  },
  {
    id: 'kyc_verification', audience: AUDIENCE.SELLER,
    keywords: ['kyc', 'verify', 'verification', 'aadhaar', 'pan', 'gst', 'gstin', 'document', 'documents', 'identity'],
    answer: (ctx) => `Verification depends on your seller type${ctx.archetype ? ` (you are ${ctx.archetype})` : ''}. An individual artisan needs only a phone and Aadhaar — no GST number required, because the platform sells as Merchant of Record on your behalf and handles the tax. A registered business adds GST/PAN; an exporter adds IEC; a tourism operator adds their licence.`,
  },
  {
    id: 'gi_verification', audience: AUDIENCE.SELLER,
    keywords: ['gi', 'geographical', 'authentic', 'genuine', 'tag', 'origin', 'provenance', 'real', 'verified'],
    answer: () => 'If your craft has a Geographical Indication (GI) tag — like Banarasi silk or Pochampally ikat — the platform can show buyers a verified origin trail, which lets your work command a fair price. If it is not GI-tagged, it can still be listed with a verified cluster origin. Authenticity is what lets buyers trust and pay more.',
  },
  {
    id: 'tiers_pricing', audience: AUDIENCE.SELLER,
    keywords: ['tier', 'plan', 'subscription', 'pricing', 'price', 'cost', 'karigar', 'vyapari', 'niryatak', 'pravasi', 'sansthan', 'upgrade'],
    answer: (ctx) => `There are five seller types, each with its own plan: Karigar (individual artisan), Vyapari (registered business), Niryatak (exporter), Pravasi (tourism), and Sansthan (cooperative).${ctx.tier ? ` You are on ${ctx.tier}.` : ''} The platform makes money only when you do — pricing is set fairly and you can see it on the Pricing page.`,
  },
  {
    id: 'returns', audience: AUDIENCE.ANY,
    keywords: ['return', 'refund', 'cancel', 'wrong', 'damaged', 'broken', 'send back', 'money back'],
    answer: () => 'Non-perishable, non-customised products can be returned within 7 days of delivery if they are in original condition. Approved refunds are processed within 7 working days to the original payment method. Customised items, perishables, and tourism bookings follow their own stated policies.',
  },
  {
    id: 'payout_security', audience: AUDIENCE.SELLER,
    keywords: ['safe', 'trust', 'scam', 'fraud', 'secure', 'guarantee', 'risk', 'hold'],
    answer: () => 'Your payout is structurally protected: the platform never holds your float, so it cannot disappear with your money. Settlement is split automatically by the payment gateway directly to your bank. Commission and any donation are taken from the platform/buyer side — never carved out of your maker payment.',
  },
  {
    id: 'tourism_booking', audience: AUDIENCE.ANY,
    keywords: ['tour', 'tourism', 'experience', 'hotel', 'homestay', 'booking', 'guide', 'event', 'trip', 'workshop'],
    answer: () => 'Tourism experiences — workshops, heritage walks, stays, events — are booked through licensed operators. Low-risk experiences need no special verification; high-risk activities (adventure/sports) require the operator to have bound insurance and may need verified traveller identity. The platform books as an agent; the operator runs the experience.',
  },
  {
    id: 'language', audience: AUDIENCE.ANY,
    keywords: ['language', 'hindi', 'translate', 'english', 'bhasha', 'भाषा', 'tamil', 'bengali', 'regional'],
    answer: () => 'You can use the platform in your own language. Listings and help can be translated, so you do not need to know English to sell or buy here.',
  },
  {
    id: 'consent', audience: AUDIENCE.SELLER,
    keywords: ['consent', 'authorize', 'authorization', 'permission', 'agree', 'terms', 'allow'],
    answer: () => 'Before the platform can sell your products, you authorize it once at signup — you accept the terms, allow the platform to sell on your behalf, and authorize payouts to your bank. You can withdraw this authorization at any time, which simply takes your listings down. Nothing of yours is ever sold without your permission.',
  },
];

// Words that signal a complaint / something needing a human, not an FAQ.
const ESCALATION_SIGNALS = ['complaint', 'cheated', 'not paid', 'never received', 'fraud', 'scam', 'sue', 'legal', 'angry', 'terrible', 'worst', 'stolen', 'lost my money', 'report', 'wrong amount'];

const GRIEVANCE_HINT = {
  payment: ['paid', 'payout', 'money', 'amount', 'settle', 'refund'],
  delivery: ['deliver', 'received', 'shipping', 'arrive', 'courier'],
  product_issue: ['damaged', 'broken', 'wrong', 'defective', 'quality'],
};

function _norm(s) { return String(s || '').toLowerCase(); }

/** Score how well a question matches a knowledge entry (word-boundary aware). */
function _score(q, entry) {
  const text = ' ' + _norm(q).replace(/[^\p{L}\p{N}+]+/gu, ' ') + ' ';
  let hits = 0;
  for (const kw of entry.keywords) {
    // Multi-word keywords: substring is fine. Single tokens: match whole word
    // so "gi" doesn't match "gibberish" and "list" doesn't match "listen".
    if (kw.includes(' ')) { if (text.includes(kw)) hits++; }
    else if (text.includes(' ' + kw + ' ')) hits++;
  }
  return hits;
}

/** Guess a grievance type from the text, for a smoother escalation. */
function _grievanceType(q) {
  const text = _norm(q);
  for (const [type, kws] of Object.entries(GRIEVANCE_HINT)) {
    if (kws.some((k) => text.includes(k))) return type;
  }
  return 'other';
}

/**
 * answer — the customer asks; we respond, grounded.
 * @param {string} question
 * @param {object} [ctx] — { audience, archetype, tier } account facts woven in
 * @returns { matched, intent, answer, confidence, escalate, escalation, sources }
 */
function answer(question, ctx = {}) {
  const q = _norm(question);
  if (!q.trim()) {
    return { matched: false, answer: 'Please type your question and I will help.', confidence: 0, escalate: false };
  }

  // Complaint → escalate to a human grievance, with a pre-filled type.
  const isComplaint = ESCALATION_SIGNALS.some((s) => q.includes(s));

  // Find the best-matching knowledge entry for the audience.
  const audience = ctx.audience || AUDIENCE.ANY;
  const candidates = KNOWLEDGE
    .filter((e) => e.audience === AUDIENCE.ANY || audience === AUDIENCE.ANY || e.audience === audience)
    .map((e) => ({ e, score: _score(q, e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const confidence = best ? Math.min(1, best.score / 3) : 0;

  if (isComplaint || !best || confidence < 0.32) {
    return {
      matched: false,
      intent: best ? best.e.id : null,
      answer: isComplaint
        ? 'I am sorry this happened. This needs a person to look into it properly — I can raise a grievance for you and our team will respond within 24 hours.'
        : 'I am not fully sure about that one. I can connect you to a human who will help, and raise a grievance so it is tracked.',
      confidence,
      escalate: true,
      escalation: { route: 'grievance', suggested_type: _grievanceType(q) },
      sources: best ? [best.e.id] : [],
    };
  }

  return {
    matched: true,
    intent: best.e.id,
    answer: best.e.answer(ctx),
    confidence,
    escalate: false,
    sources: [best.e.id],
  };
}

/** The questions the assistant can confidently handle (for a help menu). */
function topics(audience = AUDIENCE.ANY) {
  return KNOWLEDGE
    .filter((e) => e.audience === AUDIENCE.ANY || audience === AUDIENCE.ANY || e.audience === audience)
    .map((e) => ({ id: e.id, audience: e.audience }));
}

module.exports = {
  AUDIENCE,
  KNOWLEDGE,
  answer,
  topics,
};
