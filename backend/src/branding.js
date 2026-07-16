'use strict';

/**
 * branding.js
 *
 * Before publishing, the founder may want a different brand name and logo than
 * the working name "NEXUS". This is the white-label layer: a settable brand
 * identity (name, short name, tagline, logo) that flows into the UI and into
 * every generated presentation — without touching what the platform actually
 * IS or does.
 *
 * Honest boundary: branding changes the label, never the substance. Renaming
 * the platform does not change its invariants, its honesty about stage, or its
 * capabilities. A brand name is not a claim — so this module validates that the
 * name is well-formed, not that it is true or trademark-clear (that's the
 * founder's legal step before publishing).
 *
 * Pure + dependency-free.
 */

const DEFAULT_BRAND = Object.freeze({
  name: 'NEXUS',
  short: 'NEXUS',
  tagline: 'The trust & compliance operating system for India\u2019s craft economy.',
  logo: { type: 'seal', colors: ['#C2410C', '#B45309', '#0D7A66', '#1E1B4B'] }, // the 4-quadrant seal mark
});

let _brand = { ...DEFAULT_BRAND };

function get() { return { ..._brand, is_default: _brand.name === DEFAULT_BRAND.name }; }

/**
 * set — change the brand. Validates shape, not truthfulness. Returns the new
 * brand or a reason it was refused.
 * @param patch { name?, short?, tagline?, logo? }
 */
function set(patch = {}) {
  const next = { ..._brand };
  if (patch.name != null) {
    const n = String(patch.name).trim();
    if (n.length < 2 || n.length > 40) return { ok: false, reason: 'Brand name must be 2\u201340 characters.' };
    if (/[<>{}]/.test(n)) return { ok: false, reason: 'Brand name contains invalid characters.' };
    next.name = n;
    next.short = (patch.short ? String(patch.short).trim() : n.split(/\s+/)[0]).slice(0, 16);
  } else if (patch.short != null) {
    next.short = String(patch.short).trim().slice(0, 16);
  }
  if (patch.tagline != null) {
    const t = String(patch.tagline).trim();
    if (t.length > 140) return { ok: false, reason: 'Tagline must be 140 characters or fewer.' };
    next.tagline = t;
  }
  if (patch.logo != null) {
    const logo = patch.logo;
    if (logo.type && !['seal', 'wordmark', 'uploaded'].includes(logo.type)) return { ok: false, reason: 'Logo type must be seal, wordmark, or uploaded.' };
    if (Array.isArray(logo.colors)) {
      const bad = logo.colors.find((c) => !/^#[0-9a-f]{6}$/i.test(String(c)));
      if (bad) return { ok: false, reason: `Invalid colour: ${bad} (use hex like #1E1B4B).` };
    }
    next.logo = { ...next.logo, ...logo };
  }
  const from = _brand.name;
  _brand = next;
  return { ok: true, brand: get(), from, note: 'Brand updated. This changes the label everywhere (UI + presentations) — not the platform\u2019s substance, invariants, or honesty about its stage.', reminder: from === DEFAULT_BRAND.name ? 'Before publishing under this name, confirm it is trademark-clear — that is a legal step, not something the platform can verify.' : null };
}

function reset() { _brand = { ...DEFAULT_BRAND }; return get(); }

module.exports = { DEFAULT_BRAND, get, set, reset };
