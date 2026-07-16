'use strict';
/**
 * spendControl — the monthly AI/API spend cap is the FOUNDER's decision, set at runtime
 * (via the AI co-founder or the cockpit), not a fixed constant. Starts from
 * API_MONTHLY_CAP_PAISE and can be raised/lowered by the founder within sane bounds.
 * Every change is logged. The cost engine reads getCap() live, so changes take effect at once.
 */
const MIN_PAISE = 0;               // founder may pause spend entirely
const MAX_PAISE = 100_00_000_00;   // ₹1 crore/mo safety ceiling (prevents fat-finger)
const DEFAULT_PAISE = 30000_00;    // ₹30,000 default

let _capPaise = DEFAULT_PAISE;
const _log = [];

function _init() {
  try { const cfg = require('./config'); if (cfg && cfg.apiMonthlyCapPaise != null) _capPaise = cfg.apiMonthlyCapPaise; } catch (e) {}
}
_init();

function getCap() { return _capPaise; }
function getCapRupees() { return Math.round(_capPaise / 100); }

/** Founder sets the cap (in paise). Clamped to [MIN, MAX]; logged with who + when. */
function setCap(paise, by) {
  const n = Number(paise);
  if (!isFinite(n)) return { ok: false, error: 'cap must be a number (paise)' };
  const clamped = Math.max(MIN_PAISE, Math.min(MAX_PAISE, Math.round(n)));
  const prev = _capPaise;
  _capPaise = clamped;
  _log.push({ at: new Date().toISOString(), by: by || 'founder', from_paise: prev, to_paise: clamped });
  return { ok: true, cap_paise: clamped, cap_rupees: Math.round(clamped / 100), previous_rupees: Math.round(prev / 100) };
}

/** Convenience: set in rupees (what the founder speaks). */
function setCapRupees(rupees, by) { return setCap(Math.round(Number(rupees) * 100), by); }

function history() { return _log.slice(); }
function reset() { _capPaise = DEFAULT_PAISE; _log.length = 0; }

module.exports = { getCap, getCapRupees, setCap, setCapRupees, history, reset, MIN_PAISE, MAX_PAISE, DEFAULT_PAISE };
