/**
 * NEXUS — i18n core.
 *
 * Every user-facing string lives behind a key. Translations are kept in
 * per-language tables. The t() function resolves a key to the active
 * locale, falls back to English if the locale is missing the key, and
 * interpolates {variables} from a params object.
 *
 * This module is the SINGLE SOURCE OF TRUTH for user-facing text. The
 * UI never inlines an English string; it asks t('some.key') and gets
 * back whatever the user's locale says. That's how multilingual
 * actually works rather than being marketing.
 *
 * The translation tables are deliberately separate from this file
 * (in ./i18nStrings.js) so adding a language is data work, not code
 * work. The 12 priority Indian languages are listed in LOCALES; only
 * English (en) and Hindi (hi) are populated as the pilot. The other
 * 10 are declared with empty tables — t() falls back to English for
 * any missing key, so the app stays usable everywhere.
 */

'use strict';

const { TABLES } = require('./i18nStrings');

const DEFAULT_LOCALE = 'en';

/** The 12 priority Indian languages + English. Order matters: this
 *  drives the picker UI order. */
const LOCALES = [
  { code: 'en', name: 'English',    native: 'English',    rtl: false },
  { code: 'hi', name: 'Hindi',      native: 'हिन्दी',       rtl: false },
  { code: 'bn', name: 'Bengali',    native: 'বাংলা',        rtl: false },
  { code: 'ta', name: 'Tamil',      native: 'தமிழ்',        rtl: false },
  { code: 'te', name: 'Telugu',     native: 'తెలుగు',        rtl: false },
  { code: 'mr', name: 'Marathi',    native: 'मराठी',        rtl: false },
  { code: 'gu', name: 'Gujarati',   native: 'ગુજરાતી',       rtl: false },
  { code: 'kn', name: 'Kannada',    native: 'ಕನ್ನಡ',         rtl: false },
  { code: 'ml', name: 'Malayalam',  native: 'മലയാളം',       rtl: false },
  { code: 'pa', name: 'Punjabi',    native: 'ਪੰਜਾਬੀ',         rtl: false },
  { code: 'or', name: 'Odia',       native: 'ଓଡ଼ିଆ',          rtl: false },
  { code: 'as', name: 'Assamese',   native: 'অসমীয়া',        rtl: false },
  { code: 'ur', name: 'Urdu',       native: 'اردو',          rtl: true  },
];

const LOCALE_CODES = LOCALES.map(l => l.code);

/**
 * Resolve which locale to use given hints.
 * Priority: explicit user preference → browser/system hint → DEFAULT_LOCALE.
 * Always returns a code we have a table for.
 */
function resolveLocale({ user, browser } = {}) {
  if (user && LOCALE_CODES.includes(user)) return user;
  if (browser) {
    // 'hi-IN' → 'hi'; 'en-GB' → 'en'
    const base = String(browser).toLowerCase().split(/[-_]/)[0];
    if (LOCALE_CODES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Look up a key. If the locale is missing the key, fall back to English.
 * If English is also missing, return the key itself (so a missing string
 * is visible in development).
 */
function lookup(locale, key) {
  const t = TABLES[locale];
  if (t && Object.prototype.hasOwnProperty.call(t, key)) return t[key];
  const en = TABLES[DEFAULT_LOCALE];
  if (en && Object.prototype.hasOwnProperty.call(en, key)) return en[key];
  return key; // visible miss
}

/** Interpolate {variables} from params into the string. */
function interpolate(template, params) {
  if (!params) return template;
  return String(template).replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : `{${name}}`
  );
}

/**
 * The main entry point. Resolves and interpolates in one call.
 * @param {string} key
 * @param {object} [opts]  { locale?, params? }
 * @returns {string}
 */
function t(key, opts = {}) {
  const locale = opts.locale || DEFAULT_LOCALE;
  const template = lookup(locale, key);
  return interpolate(template, opts.params);
}

/**
 * Coverage report for a locale. Returns the keys present in DEFAULT_LOCALE
 * that the given locale is missing. Used by tests and the founder console
 * to flag incomplete translations.
 */
function coverage(locale) {
  if (locale === DEFAULT_LOCALE) {
    return { locale, total: Object.keys(TABLES.en || {}).length, missing: [], translated: Object.keys(TABLES.en || {}).length, pct: 100 };
  }
  const enKeys = Object.keys(TABLES[DEFAULT_LOCALE] || {});
  const t = TABLES[locale] || {};
  const missing = enKeys.filter(k => !Object.prototype.hasOwnProperty.call(t, k));
  const translated = enKeys.length - missing.length;
  const pct = enKeys.length ? Math.round((translated / enKeys.length) * 100) : 0;
  return { locale, total: enKeys.length, missing, translated, pct };
}

/** Coverage across all locales — useful for an admin dashboard. */
function coverageReport() {
  return LOCALES.map(l => coverage(l.code));
}

module.exports = {
  LOCALES, LOCALE_CODES, DEFAULT_LOCALE,
  resolveLocale, lookup, interpolate, t,
  coverage, coverageReport,
};
