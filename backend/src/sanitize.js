'use strict';
/** sanitize — centralised input hardening: trim, cap, strip control chars, escape HTML,
 *  and whitelist object keys. Use at every boundary before storing or reflecting input. */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function stripControl(s) { return String(s).replace(/[\u0000-\u001F\u007F]/g, ''); }

function sanitizeString(s, maxLen) {
  if (s === null || s === undefined) return '';
  let v = stripControl(String(s)).trim();
  if (maxLen && v.length > maxLen) v = v.slice(0, maxLen);
  return v;
}

/** Numbers within bounds, else clamped/defaulted. */
function sanitizeNumber(n, min, max, dflt) {
  let v = Number(n);
  if (!isFinite(v)) return dflt === undefined ? 0 : dflt;
  if (min !== undefined && v < min) v = min;
  if (max !== undefined && v > max) v = max;
  return v;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_IN = /^(\+?91)?[6-9]\d{9}$/;
function isEmail(s) { return EMAIL.test(String(s || '').trim()); }
function isPhoneIN(s) { return PHONE_IN.test(String(s || '').replace(/[\s-]/g, '')); }

/** Whitelist + sanitize an object against a field spec: {name:{type:'string',max:80}, price:{type:'number',min:0,max:1e7}}. */
function sanitizeObject(obj, spec) {
  const out = {};
  obj = obj && typeof obj === 'object' ? obj : {};
  Object.keys(spec || {}).forEach((k) => {
    const s = spec[k];
    if (!(k in obj)) return;
    if (s.type === 'number') out[k] = sanitizeNumber(obj[k], s.min, s.max, s.default);
    else out[k] = sanitizeString(obj[k], s.max || 500);
  });
  return out;
}

module.exports = { escapeHtml, stripControl, sanitizeString, sanitizeNumber, isEmail, isPhoneIN, sanitizeObject };
