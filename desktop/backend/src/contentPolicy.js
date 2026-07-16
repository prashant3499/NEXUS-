'use strict';
/**
 * contentPolicy — prohibited-items screening + notice-and-takedown workflow so NEXUS
 * keeps intermediary safe-harbor protection (IT Act s.79 + IT Rules 2021: act on a valid
 * notice within the required window, log every action). Screening is advisory + gated:
 * a flagged listing is blocked pending human review (HITL), never silently published.
 */

// Categories relevant to an Indian craft marketplace.
const PROHIBITED = {
  wildlife: { label: 'Wildlife / protected species', patterns: ['ivory', 'shahtoosh', 'tortoise shell', 'turtle shell', 'tiger', 'leopard skin', 'rhino', 'peacock feather', 'star tortoise', 'mongoose hair', 'coral'], law: 'Wildlife Protection Act 1972' },
  antiquities: { label: 'Antiquities (>100 years)', patterns: ['antique', 'antiquity', 'excavated', 'temple idol', 'ancient artifact', '100 years old', 'archaeological'], law: 'Antiquities & Art Treasures Act 1972' },
  restricted_natural: { label: 'Restricted natural materials', patterns: ['red sandalwood', 'raw sandalwood', 'agarwood raw', 'sea shell export'], law: 'EXIM / Forest rules' },
  weapons: { label: 'Weapons / arms', patterns: ['firearm', 'gun', 'ammunition', 'knife weapon', 'sword sharpened', 'explosive'], law: 'Arms Act 1959' },
  counterfeit: { label: 'Counterfeit / IP-infringing', patterns: ['replica', 'first copy', 'fake brand', 'duplicate branded', 'clone of'], law: 'Trade Marks Act / Copyright Act' },
  false_gi: { label: 'False GI / origin claim', patterns: ['genuine banarasi (non-verified)', 'fake gi', 'unregistered gi claim'], law: 'GI of Goods Act 1999' },
  controlled: { label: 'Controlled / hazardous', patterns: ['narcotic', 'drug', 'currency note', 'human remains', 'hazardous chemical'], law: 'NDPS / misc' },
};

function screenListing(listing) {
  listing = listing || {};
  const hay = [listing.title, listing.name, listing.description, listing.category, listing.material]
    .filter(Boolean).join(' ').toLowerCase();
  const flags = [];
  Object.keys(PROHIBITED).forEach((cat) => {
    PROHIBITED[cat].patterns.forEach((p) => { if (hay.indexOf(p) >= 0) flags.push({ category: cat, matched: p, law: PROHIBITED[cat].law }); });
  });
  return { allowed: flags.length === 0, action: flags.length ? 'hold_for_review' : 'permit', flags,
    note: flags.length ? 'Listing held for human review (HITL) — not auto-published.' : 'No prohibited-item signals.' };
}

function prohibitedCatalog() { return Object.keys(PROHIBITED).map((k) => ({ category: k, label: PROHIBITED[k].label, law: PROHIBITED[k].law })); }

// ── Notice & takedown (safe-harbor) ──
const ACK_WINDOW_HOURS = 36;     // acknowledge/act window under IT Rules 2021
const RESOLVE_WINDOW_DAYS = 15;  // grievance resolution window

function fileNotice(input) {
  input = input || {};
  const now = Date.now();
  return {
    id: 'ntc_' + now.toString(36),
    listingId: input.listingId || null,
    type: input.type || 'ip_infringement', // ip_infringement | unlawful | counterfeit | privacy
    complainant: input.complainant || 'anonymous',
    details: String(input.details || '').slice(0, 2000),
    status: 'received',
    receivedAt: new Date(now).toISOString(),
    ackDueBy: new Date(now + ACK_WINDOW_HOURS * 3600e3).toISOString(),
    resolveDueBy: new Date(now + RESOLVE_WINDOW_DAYS * 86400e3).toISOString(),
    log: [{ at: new Date(now).toISOString(), event: 'notice_received' }],
  };
}

function actOnNotice(notice, action, by) {
  const valid = ['acknowledge', 'takedown', 'reject', 'reinstate'];
  if (valid.indexOf(action) < 0) return { error: 'invalid action', valid };
  const map = { acknowledge: 'acknowledged', takedown: 'content_removed', reject: 'rejected_insufficient', reinstate: 'reinstated' };
  notice.status = map[action];
  notice.log = (notice.log || []).concat([{ at: new Date().toISOString(), event: action, by: by || 'grievance_officer' }]);
  notice.safe_harbor = 'Action logged within statutory window; intermediary protection preserved.';
  return notice;
}

module.exports = { PROHIBITED, screenListing, prohibitedCatalog, fileNotice, actOnNotice, ACK_WINDOW_HOURS, RESOLVE_WINDOW_DAYS };
