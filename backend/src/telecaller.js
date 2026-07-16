'use strict';

/**
 * telecaller.js
 *
 * The missing link between SOURCING (we have authentic leads) and ONBOARDING
 * (we need their consent + authorization). India's artisans are phone-first
 * and often can't read — you reach them by CALLING, in THEIR language, with a
 * script that respects their situation. This module runs that outbound motion.
 *
 * It is provider-agnostic, like payments and maps: a human telecaller works the
 * queue today (the module generates the script + records the outcome), and an
 * AI-voice provider can be slotted in later behind the same seam — no workflow
 * change. Nothing here dials autonomously without that provider; by default it
 * produces the call list, the script, and the disposition log a human uses.
 *
 * Every call outcome maps to a lead-funnel status, so calling actually moves
 * the pipeline instead of being a side activity.
 */

// Call dispositions — the outcome a telecaller logs after each call.
const DISPOSITION = Object.freeze({
  NO_ANSWER: 'no_answer',
  CALLBACK: 'callback',           // reached, wants a call back later
  INTERESTED: 'interested',       // wants to proceed → move to onboarding
  ONBOARDED: 'onboarded',         // completed signup on the call
  NOT_INTERESTED: 'not_interested',
  WRONG_NUMBER: 'wrong_number',
  DO_NOT_CALL: 'do_not_call',     // opt-out — must be honoured
});

// Map a disposition to the lead-funnel status it should set.
const DISPOSITION_TO_LEAD_STATUS = Object.freeze({
  no_answer: 'contacted',
  callback: 'contacted',
  interested: 'responded',
  onboarded: 'onboarded',
  not_interested: 'rejected',
  wrong_number: 'rejected',
  do_not_call: 'rejected',
});

// Localised script fragments. Kept short and concrete — a telecaller reads
// these. English is the source; Bhashini translates to the lead's language at
// call time, but we ship native Hindi too since it's the most common.
const SCRIPT_TEMPLATES = Object.freeze({
  en: {
    greeting: 'Namaste, am I speaking with {name}? I am calling from {platform}.',
    pitch_karigar: 'We help artisans like you sell your craft to buyers across India and abroad. You do not need a GST number — we handle the paperwork and the tax, and the money comes straight to your bank in about two days. You keep your maker price.',
    pitch_vyapari: 'We help registered sellers reach more buyers with less paperwork — listings, compliance, and direct settlement to your account.',
    pitch_niryatak: 'We help exporters reach international buyers with the export compliance handled — documentation, settlement, and verified provenance.',
    pitch_pravasi: 'We help heritage and craft-tourism operators get verified bookings — travellers find you, and the booking and payment are handled.',
    pitch_sansthan: 'We help cooperatives bring all your member artisans online under one umbrella, with the earnings split fairly to each maker.',
    trust: 'You carry no legal risk — the platform sells on your behalf and takes the responsibility. We never hold your money.',
    consent_ask: 'If you are interested, I will note your consent to join, and we complete a simple signup. You can stop any time and we take your listings down.',
    close: 'Shall I sign you up now, or call back at a better time?',
    do_not_call: 'No problem, I will not call again. Thank you for your time.',
  },
  hi: {
    greeting: 'नमस्ते, क्या मैं {name} जी से बात कर रहा/रही हूँ? मैं {platform} से बोल रहा/रही हूँ।',
    pitch_karigar: 'हम आप जैसे कारीगरों को उनका सामान पूरे भारत और विदेशों में बेचने में मदद करते हैं। GST नंबर की ज़रूरत नहीं — कागज़ और टैक्स हम संभालते हैं, और पैसा सीधे आपके बैंक में लगभग दो दिन में आ जाता है। आपका दाम आपको मिलता है।',
    pitch_vyapari: 'हम पंजीकृत विक्रेताओं को कम कागज़ी काम के साथ ज़्यादा ग्राहकों तक पहुँचने में मदद करते हैं — लिस्टिंग, अनुपालन, और सीधे आपके खाते में भुगतान।',
    pitch_niryatak: 'हम निर्यातकों को अंतरराष्ट्रीय ग्राहकों तक पहुँचने में मदद करते हैं — निर्यात अनुपालन, दस्तावेज़ और सत्यापित पहचान के साथ।',
    pitch_pravasi: 'हम विरासत और शिल्प-पर्यटन संचालकों को सत्यापित बुकिंग दिलाने में मदद करते हैं — यात्री आपको ढूँढते हैं, बुकिंग और भुगतान हम संभालते हैं।',
    pitch_sansthan: 'हम सहकारी समितियों को एक छत के नीचे सभी सदस्य कारीगरों को ऑनलाइन लाने में मदद करते हैं, और कमाई हर कारीगर में निष्पक्ष रूप से बँटती है।',
    trust: 'आप पर कोई कानूनी जोखिम नहीं — प्लेटफ़ॉर्म आपकी ओर से बेचता है और ज़िम्मेदारी लेता है। हम आपका पैसा कभी नहीं रोकते।',
    consent_ask: 'अगर आप इच्छुक हैं, तो मैं आपकी सहमति दर्ज करूँगा/करूँगी और एक आसान साइनअप पूरा करते हैं। आप कभी भी रोक सकते हैं और हम आपकी लिस्टिंग हटा देंगे।',
    close: 'क्या मैं अभी आपका साइनअप कर दूँ, या बेहतर समय पर कॉल करूँ?',
    do_not_call: 'कोई बात नहीं, मैं दोबारा कॉल नहीं करूँगा/करूँगी। आपके समय के लिए धन्यवाद।',
  },
});

const SEGMENT_PITCH = Object.freeze({
  karigar_prospect: 'pitch_karigar', vyapari_prospect: 'pitch_vyapari',
  niryatak_prospect: 'pitch_niryatak', pravasi_prospect: 'pitch_pravasi',
  sansthan_prospect: 'pitch_sansthan',
});

/**
 * buildScript — assemble a call script for a lead in a target language.
 * Falls back to English fragments when a language isn't natively shipped (a
 * Bhashini translation layer can translate the English at call time).
 * @returns { language, native, lines[], full }
 */
function buildScript(lead = {}, language = 'hi', platformName = 'NEXUS') {
  const native = !!SCRIPT_TEMPLATES[language];
  const T = SCRIPT_TEMPLATES[language] || SCRIPT_TEMPLATES.en;
  const pitchKey = SEGMENT_PITCH[lead.segment] || 'pitch_karigar';
  const fill = (s) => String(s).replace('{name}', lead.name || (language === 'hi' ? 'जी' : 'there')).replace('{platform}', platformName);
  const lines = [
    { step: 'greeting', text: fill(T.greeting) },
    { step: 'pitch', text: fill(T[pitchKey] || T.pitch_karigar) },
    { step: 'trust', text: fill(T.trust) },
    { step: 'consent', text: fill(T.consent_ask) },
    { step: 'close', text: fill(T.close) },
  ];
  return {
    language,
    native,
    needs_translation: !native,
    lines,
    full: lines.map((l) => l.text).join('\n\n'),
    do_not_call_line: fill(T.do_not_call),
  };
}

/**
 * planCampaign — turn a set of leads into an ordered call queue. Highest-score
 * leads first; leads already on do-not-call or onboarded are skipped.
 * @param {object[]} leads — [{ id, name, segment, score, status, language }]
 */
function planCampaign(leads = [], opts = {}) {
  const skipStatuses = new Set(['onboarded', 'rejected', 'do_not_call']);
  const queue = leads
    .filter((l) => !skipStatuses.has(l.status))
    .filter((l) => !l.do_not_call)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, opts.limit || 50)
    .map((l) => ({
      lead_id: l.id,
      name: l.name,
      segment: l.segment,
      score: l.score || 0,
      language: l.language || opts.defaultLanguage || 'hi',
      status: l.status || 'new',
    }));
  return { queue, count: queue.length, generated_at: (opts.now || Date.now)() };
}

/**
 * logCall — record a call outcome and return the lead-status transition it
 * implies. The caller persists the lead update + the call record.
 * @returns { ok, disposition, lead_status, follow_up, record }
 */
function logCall({ leadId, disposition, notes, callbackAt, durationSec, by } = {}, now = Date.now()) {
  if (!leadId) return { ok: false, error: 'leadId required' };
  if (!Object.values(DISPOSITION).includes(disposition)) {
    return { ok: false, error: 'invalid disposition: ' + disposition };
  }
  const leadStatus = DISPOSITION_TO_LEAD_STATUS[disposition] || 'contacted';
  return {
    ok: true,
    disposition,
    lead_status: leadStatus,
    follow_up: disposition === DISPOSITION.CALLBACK ? (callbackAt || null) : null,
    do_not_call: disposition === DISPOSITION.DO_NOT_CALL,
    record: {
      lead_id: leadId, disposition, notes: notes || null,
      duration_sec: durationSec || null, by: by || 'telecaller', at: now,
    },
  };
}

/** Campaign stats from a set of call records — connect-rate, conversion. */
function campaignStats(records = []) {
  const total = records.length;
  const by = {};
  for (const r of records) by[r.disposition] = (by[r.disposition] || 0) + 1;
  const reached = total - (by.no_answer || 0) - (by.wrong_number || 0);
  const onboarded = by.onboarded || 0;
  return {
    calls: total,
    reached,
    connect_rate: total ? Math.round((reached / total) * 100) : 0,
    onboarded,
    conversion_rate: total ? Math.round((onboarded / total) * 100) : 0,
    by_disposition: by,
  };
}

module.exports = {
  DISPOSITION,
  DISPOSITION_TO_LEAD_STATUS,
  SCRIPT_TEMPLATES,
  SEGMENT_PITCH,
  buildScript,
  planCampaign,
  logCall,
  campaignStats,
};
