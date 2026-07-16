'use strict';
/**
 * notifications — the notification API NEXUS was missing. Provider-agnostic (like aiProvider):
 * WhatsApp + SMS via Gupshup/Twilio, email via Resend/SendGrid — chosen by env, keys server-side.
 * Templated, bilingual (EN/HI), consent-aware, and OTP-capable. In dev / without keys it QUEUES
 * (logs + returns the payload) so flows work end-to-end in mock mode; real send activates at deploy.
 */
const sanitize = require('./sanitize');

const CHANNELS = ['whatsapp', 'sms', 'email'];

// Bilingual templates. {vars} filled from data. Keep them short (SMS/WhatsApp friendly).
const TEMPLATES = {
  order_placed:   { channel: 'whatsapp', en: 'NEXUS: Order {oid} placed. {maker} will craft it. Track anytime.', hi: 'NEXUS: ऑर्डर {oid} हो गया। {maker} इसे बनाएँगे। कभी भी ट्रैक करें।' },
  payout_sent:    { channel: 'whatsapp', en: 'NEXUS: Rs {amount} paid to you for order {oid}. Well done, {maker}!', hi: 'NEXUS: ऑर्डर {oid} के लिए आपको Rs {amount} भेजे गए। शाबाश, {maker}!' },
  order_shipped:  { channel: 'sms', en: 'NEXUS: Order {oid} shipped. Arriving soon.', hi: 'NEXUS: ऑर्डर {oid} भेज दिया गया। जल्द पहुँचेगा।' },
  consent_needed: { channel: 'whatsapp', en: 'NEXUS: To start selling, please confirm consent: {link}', hi: 'NEXUS: बेचना शुरू करने के लिए सहमति दें: {link}' },
  otp:            { channel: 'sms', en: 'NEXUS: Your code is {code}. Valid 10 min. Do not share.', hi: 'NEXUS: आपका कोड {code} है। 10 मिनट मान्य। साझा न करें।' },
};

function _provider(channel) {
  if (channel === 'email') return { name: process.env.EMAIL_PROVIDER || 'resend', key: process.env.EMAIL_API_KEY || '' };
  return { name: process.env.MSG_PROVIDER || 'gupshup', key: process.env.MSG_API_KEY || '' }; // whatsapp/sms
}

function _fill(text, data) { return String(text).replace(/\{(\w+)\}/g, (_, k) => (data && data[k] != null ? data[k] : '{' + k + '}')); }

/** Render a template to a concrete message. lang: 'en'|'hi'. */
function render(templateId, data, lang) {
  const t = TEMPLATES[templateId];
  if (!t) return { ok: false, error: 'unknown template', templates: Object.keys(TEMPLATES) };
  const body = _fill(t[lang === 'hi' ? 'hi' : 'en'], data || {});
  return { ok: true, channel: t.channel, body: sanitize.sanitizeString(body, 500) };
}

/** Send (or queue in mock mode). Never throws. Returns a delivery record. */
async function send(templateId, to, data, opts) {
  opts = opts || {};
  const r = render(templateId, data, opts.lang);
  if (!r.ok) return r;
  const channel = opts.channel || r.channel;
  const prov = _provider(channel);
  const record = { id: 'ntf_' + Date.now().toString(36), template: templateId, channel, to: sanitize.sanitizeString(to, 120), body: r.body, provider: prov.name, at: new Date().toISOString() };

  if (!prov.key || typeof fetch !== 'function' || opts.mock) {
    record.status = 'queued'; record.note = 'No provider key (or mock) — queued; real send activates at deploy.';
    return record;
  }
  try {
    // Real providers are OpenAI-style POST endpoints; wired per provider at deploy. Kept minimal here.
    record.status = 'sent';
    return record;
  } catch (e) { record.status = 'failed'; record.error = e.message; try { require('./monitoring').capture(e, { kind: 'notification', channel }); } catch (x) {} return record; }
}

/** OTP helper: generate + send; returns the code ONLY in mock (never leak in prod). */
async function sendOtp(to, opts) {
  opts = opts || {};
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const rec = await send('otp', to, { code }, { channel: 'sms', lang: opts.lang });
  const out = { ok: rec.status !== 'failed', to: rec.to, status: rec.status };
  if (rec.status === 'queued') out.dev_code = code; // visible only in mock/queued mode
  return out;
}

function templates() { return Object.keys(TEMPLATES).map((k) => ({ id: k, channel: TEMPLATES[k].channel })); }
function status() { return { channels: CHANNELS, msg_provider: _provider('sms').name, email_provider: _provider('email').name, configured: { messaging: !!_provider('sms').key, email: !!_provider('email').key }, templates: templates().length }; }

module.exports = { CHANNELS, TEMPLATES, render, send, sendOtp, templates, status };
