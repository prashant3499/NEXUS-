/**
 * UNIFIED — Tourism Risk Engine
 * Risk-stratified booking with the risk\u2013KYC hard link (fix F9) and
 * operator-bound insurance (fix F1 — platform never fronts premium).
 * Pure Node.js.
 */

'use strict';

const RISK = {
  LOW:    'low',     // Cultural, Heritage, Spiritual, Eco
  MEDIUM: 'medium',  // Natural, Industrial
  HIGH:   'high',    // Adventure, Sports
};

// Category → risk level
const CATEGORY_RISK = {
  cultural: RISK.LOW, heritage: RISK.LOW, spiritual: RISK.LOW, eco: RISK.LOW,
  natural: RISK.MEDIUM, industrial: RISK.MEDIUM,
  adventure: RISK.HIGH, sports: RISK.HIGH,
  // ── Tourism sector establishments ──
  accommodation: RISK.LOW, homestay: RISK.LOW, guide: RISK.LOW,
  event: RISK.MEDIUM, wedding: RISK.MEDIUM,   // crowds, liability, vendors
  transport: RISK.MEDIUM,                     // road safety, operator insurance
  craft_workshop: RISK.LOW,
};

// Minimum KYC tier per risk level (the hard link)
const MIN_KYC = { [RISK.LOW]: 0, [RISK.MEDIUM]: 1, [RISK.HIGH]: 2 };

/**
 * Evaluate a booking. Returns whether it can proceed and what's required.
 * The platform is ALWAYS an agent here — never the operator, never the insurer.
 */
function evaluateBooking(booking, identity, operator) {
  const risk = CATEGORY_RISK[booking.category];
  if (!risk) {
    return { allowed: false, code: 400, reason: `Unknown tourism category: ${booking.category}` };
  }

  const requirements = [];
  const blocks = [];

  // ── Risk\u2013KYC hard link (fix F9) ──
  const minTier = MIN_KYC[risk];
  if ((identity.kycTier || 0) < minTier) {
    blocks.push(`${risk.toUpperCase()}-risk activity requires KYC tier \u2265 ${minTier}. ` +
      (risk === RISK.HIGH ? 'High-risk needs verified identity + medical declaration + emergency contact.' : 'Verify identity to proceed.'));
  }

  // ── Operator must be licensed & carry their own insurance (fix F1) ──
  if (!operator || !operator.licenseVerified) {
    blocks.push('Operator license not verified. Platform only books licensed independent operators.');
  }
  if (risk === RISK.HIGH) {
    // Adventure: operator binds insurance via licensed partner; platform NEVER fronts premium
    if (!operator?.adventureInsuranceBound) {
      blocks.push('High-risk activity requires operator-bound adventure insurance (via licensed partner API). Platform does not front premium — it earns a referral fee only.');
    }
    requirements.push('Medical self-declaration (encrypted)');
    requirements.push('Emergency contact on file');
    requirements.push('60-second safety briefing — completion tracked');
    requirements.push('Real-time weather kill-switch active');
    requirements.push('GPS panic button linked to local rescue');
  } else if (risk === RISK.MEDIUM) {
    requirements.push('Digital/voice liability waiver');
    requirements.push('Standard insurance (operator-bound)');
  } else {
    requirements.push('Standard booking — optional insurance (operator-bound)');
  }

  // ── Operator CGL indemnity (the liability firewall) ──
  if (operator && !operator.cglIndemnity) {
    blocks.push('Operator must carry CGL (₹50L\u2013₹1Cr) and indemnify the platform.');
  }

  return {
    allowed: blocks.length === 0,
    code: blocks.length === 0 ? 200 : 403,
    risk_level: risk,
    min_kyc_tier: minTier,
    requirements,
    blocks,
    platform_role: 'agent — books only; never operates, never fronts insurance',
    booking_fee_pct: 5,
    insurance_model: 'operator_bound_via_licensed_partner',
  };
}

module.exports = { evaluateBooking, RISK, CATEGORY_RISK, MIN_KYC };
