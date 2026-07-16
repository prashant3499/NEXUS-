/**
 * EcoVenture AI — Bulletproof Customer Model Selector (v2)
 * Pure Node.js. Handles EVERY customer scenario, including the messy ones.
 *
 * Built from an adversarial review of 15 edge cases that break a naive
 * six-case model: minors, turnover migration, missing IEC, informal
 * cooperatives, hybrid product+service, NRI, resellers, composition scheme,
 * partial documentation, deceased/incapacitated, disputed identity,
 * dual-role buyers, institutional buyers, consignment vs outright, and returns.
 *
 * Output for every customer: a model, a fulfilment mode, a KYC tier,
 * a liability map, required actions, and any blocking conditions.
 */

'use strict';

/* ─── LEGAL MODELS ─────────────────────────────────────── */
const MODEL = {
  MOR:       'merchant_of_record',   // platform is seller; supplier has zero liability
  SAAS:      'saas_subscription',    // customer is seller of record; platform = tool
  AGENT:     'agent_intermediary',   // platform books services; provider of record = customer
  UMBRELLA:  'cooperative_umbrella', // cooperative shields member-suppliers
  HYBRID:    'hybrid',               // more than one model on one account
  BLOCKED:   'blocked',              // cannot onboard until condition resolved
  GUARDIAN:  'guardian_mor',         // MoR but contracted via legal guardian (minor/incapacitated)
  DEMAND:    'demand_side',          // buyer — not a seller, no Indian seller liability
};

/* ─── FULFILMENT MODE (the consignment/outright choice — edge case 14) ── */
const FULFILMENT = {
  OUTRIGHT:    'outright_purchase',  // platform buys & owns inventory (working capital + risk)
  CONSIGNMENT: 'consignment',        // artisan owns till sold; platform sells as agent-of-sale
  DROPSHIP:    'on_sale_purchase',   // platform buys only at the moment of confirmed sale (default — lowest risk)
};

/* ─── KYC TIERS (progressive — edge case 9, 11) ─────────── */
const KYC_TIER = {
  T0: 0, // browse only, no selling
  T1: 1, // one govt doc (voter/ration/MNREGA) — limited selling via MoR
  T2: 2, // Aadhaar + address — standard
  T3: 3, // Aadhaar + PAN + bank verified — export enabled
  CONDITIONAL: 'conditional', // disputed identity — manual review, capped
};

/**
 * The complete decision function. Returns a full onboarding resolution.
 */
function resolve(c = {}) {
  const out = {
    input: c,
    model: null,
    fulfilment: null,
    kyc_tier: null,
    liability_map: {},
    required_actions: [],
    blocks: [],
    migration_watch: [],
    notes: [],
  };

  // ═══ HARD BLOCKS FIRST (cannot proceed until resolved) ═══

  // Edge 1: Minor — contract with a minor is void (Indian Contract Act s.11)
  if (c.age !== undefined && c.age < 18) {
    if (!c.hasGuardian) {
      out.model = MODEL.BLOCKED;
      out.blocks.push('Minor (under 18) without guardian — contract would be void under Indian Contract Act s.11. Require a guardian to contract on their behalf.');
      return finalize(out);
    }
    out.model = MODEL.GUARDIAN;
    out.notes.push('Minor with guardian — guardian is the contracting party; earnings held for the minor. Guardian and Wards Act 1890 applies.');
  }

  // Edge 10: Deceased / incapacitated — payout to nominee, no new contracts
  if (c.isDeceasedOrIncapacitated) {
    out.model = MODEL.BLOCKED;
    out.blocks.push('Account holder deceased/incapacitated. Freeze new transactions. Route pending payouts to registered nominee/legal heir. Require succession proof.');
    out.required_actions.push('Verify nominee on file; if none, require legal heir certificate before releasing held funds.');
    return finalize(out);
  }

  // Edge 11: Disputed identity (NRC/contested Aadhaar) — conditional, capped, manual
  if (c.identityDisputed) {
    out.kyc_tier = KYC_TIER.CONDITIONAL;
    out.model = MODEL.MOR;
    out.fulfilment = FULFILMENT.DROPSHIP;
    out.blocks.push('Identity legally disputed — cannot fully verify, must not reject outright (could be wrongly excluded).');
    out.required_actions.push('Manual review by compliance officer. Cap monthly payout at ₹10,000 (Jan Dhan limited-KYC ceiling) until identity resolved. Accept field-agent vouching + alternative document.');
    out.liability_map = liabilityFor(MODEL.MOR);
    out.notes.push('Conditional onboarding protects against wrongful exclusion while limiting platform exposure.');
    return finalize(out);
  }

  // ═══ DEMAND SIDE (buyers — edge case 12, 13) ═══
  if (c.isBuyer && !c.isSeller) {
    out.model = MODEL.DEMAND;
    out.kyc_tier = c.isInternational ? KYC_TIER.T2 : KYC_TIER.T1;
    out.liability_map = {
      indian_seller_liability: 'none — buyer does not sell',
      buyer_obligations: c.isInstitutional
        ? 'May deduct TDS on platform payments; tender/GeM compliance; their own procurement rules'
        : 'Pay for goods; their own jurisdiction VAT/customs',
    };
    if (c.isInstitutional) {
      out.required_actions.push('Institutional buyer (govt/GeM/museum): platform issues compliant tax invoice; expect TDS deduction BY the buyer on platform; maintain tender/GeM documentation.');
      out.notes.push('Edge 13: institutional buyers deduct TDS on the platform and require specific invoicing.');
    }
    if (c.isInternational) {
      out.required_actions.push('Lightweight KYC: email + business/VAT number, no Aadhaar. Multi-currency. Auto-generate EU CSRD report if buyer_region = EU.');
    }
    return finalize(out);
  }

  // Edge 12: dual-role — buys to resell. Liability splits by transaction.
  let dualRole = false;
  if (c.isBuyer && c.isSeller) {
    dualRole = true;
    out.notes.push('Dual-role (buys AND resells). As BUYER: demand-side, no seller liability. As SELLER: resolved by their seller status below.');
    // fall through to resolve their seller side, then mark hybrid
  }

  // ═══ RESELLER / TRADER (edge case 7) — fraud vector, extra scrutiny ═══
  if (c.isReseller && !c.isMaker) {
    out.model = c.hasGSTIN ? MODEL.SAAS : MODEL.MOR;
    out.fulfilment = FULFILMENT.DROPSHIP;
    out.kyc_tier = KYC_TIER.T3; // higher bar — resellers are a GI-fraud risk
    out.required_actions.push('RESELLER scrutiny: cannot claim GI authenticity as maker. Must document provenance of each GI-tagged item. Enhanced fraud monitoring. Cannot use "from the hands of the artisan" provenance.');
    out.liability_map = c.hasGSTIN ? liabilityFor(MODEL.SAAS) : liabilityFor(MODEL.MOR);
    out.notes.push('Edge 7: resellers are the primary GI-fraud vector. Higher KYC, provenance proof required, no maker-provenance claims.');
    return finalize(out, c, dualRole);
  }

  // ═══ COOPERATIVE (edge case 4: registered vs informal) ═══
  if (c.isCooperativeMember) {
    if (c.cooperativeRegistered) {
      out.model = MODEL.UMBRELLA;
      out.fulfilment = c.fulfilment || FULFILMENT.DROPSHIP;
      out.kyc_tier = KYC_TIER.T1; // inherited from cooperative
      out.liability_map = liabilityFor(MODEL.UMBRELLA);
      out.notes.push('Registered cooperative completes one umbrella KYC; member sells as supplier under it with zero individual liability.');
    } else {
      // Informal SHG — cannot legally shield. Member onboarded individually as MoR.
      out.model = MODEL.MOR;
      out.fulfilment = FULFILMENT.DROPSHIP;
      out.kyc_tier = pickKycTier(c);
      out.liability_map = liabilityFor(MODEL.MOR);
      out.required_actions.push('Informal SHG (not a registered legal entity) cannot provide umbrella shield. Onboard member individually as MoR supplier. Optionally: help the SHG register as a cooperative to unlock umbrella benefits.');
      out.notes.push('Edge 4: informal cooperatives cannot legally shield members — fall back to individual MoR.');
    }
    return finalize(out, c, dualRole);
  }

  // ═══ SERVICES — TOURISM (edge case 5: pure service vs product+service) ═══
  if (c.sellsServices) {
    if (c.alsoSellsProducts) {
      out.model = MODEL.HYBRID;
      out.fulfilment = c.fulfilment || FULFILMENT.DROPSHIP;
      out.kyc_tier = pickKycTier(c);
      out.liability_map = {
        for_the_experience: liabilityFor(MODEL.AGENT),
        for_the_products: c.hasGSTIN ? liabilityFor(MODEL.SAAS) : liabilityFor(MODEL.MOR),
      };
      out.notes.push('Edge 5: operator sells BOTH an experience and products. Agent model for the booking, MoR (or SaaS if registered) for the products. Two models, one account.');
      out.required_actions.push('Split accounting: 5% booking fee on experiences; product transactions sliced separately under MoR/SaaS.');
      return finalize(out, c, dualRole);
    }
    out.model = MODEL.AGENT;
    out.fulfilment = null; // services aren't inventory
    out.kyc_tier = c.hasGSTIN ? KYC_TIER.T2 : KYC_TIER.T1;
    out.liability_map = liabilityFor(MODEL.AGENT);
    out.notes.push('Pure service provider. Platform is booking intermediary; operator is provider of record (physical-experience safety liability stays with them).');
    return finalize(out, c, dualRole);
  }

  // ═══ REGISTERED BUSINESS / EXPORTER (edge case 3: GSTIN but no IEC) ═══
  if (c.hasGSTIN && (c.isRegisteredBusiness || c.isExporter)) {
    // Edge 8: composition scheme — TCS handling differs
    if (c.gstComposition) {
      out.notes.push('Edge 8: GST composition scheme — platform must NOT collect normal TCS the same way; composition dealers have distinct treatment. Flag for CA handling.');
    }
    // Edge 3: wants to export but has no IEC
    if (c.wantsToExport && !c.hasIEC) {
      out.model = MODEL.HYBRID;
      out.fulfilment = FULFILMENT.DROPSHIP;
      out.kyc_tier = KYC_TIER.T3;
      out.liability_map = {
        domestic_sales: liabilityFor(MODEL.SAAS),
        export_sales: liabilityFor(MODEL.MOR),
      };
      out.notes.push('Edge 3: registered business with GSTIN but NO Import-Export Code. Domestic = SaaS (they sell). Export = MoR (platform exports of record using ITS IEC). Hybrid by transaction destination.');
      out.required_actions.push('For exports, platform is exporter of record on its own IEC; customer supplies the goods. For domestic, customer remains seller of record.');
      return finalize(out, c, dualRole);
    }
    out.model = MODEL.SAAS;
    out.fulfilment = null; // they hold their own inventory
    out.kyc_tier = KYC_TIER.T3;
    out.liability_map = liabilityFor(MODEL.SAAS);
    out.notes.push('Established registered business — keeps seller-of-record status, uses platform as software tool. Forcing MoR would be wrong.');
    return finalize(out, c, dualRole);
  }

  // ═══ DEFAULT: INDIVIDUAL MAKER → MERCHANT OF RECORD ═══
  // Serves artisans, small makers, the undocumented, illiterate, specially-abled.
  out.model = (c.age !== undefined && c.age < 18) ? MODEL.GUARDIAN : MODEL.MOR;
  out.fulfilment = c.fulfilment || FULFILMENT.DROPSHIP;
  out.kyc_tier = pickKycTier(c);
  out.liability_map = liabilityFor(MODEL.MOR);

  // Edge 6: NRI / foreign artisan
  if (c.isNRI || c.isForeign) {
    out.kyc_tier = KYC_TIER.T3;
    out.required_actions.push('NRI/foreign supplier: Aadhaar cannot be used abroad. KYC via OCI/PIO card + passport. NRE/NRO account or international payout (Wise). FEMA reporting for cross-border. tax_residency flag drives TDS rate.');
    out.notes.push('Edge 6: diaspora/foreign artisan — different KYC, payout rail, and tax residency.');
  }

  return finalize(out, c, dualRole);
}

/* ─── KYC tier from available documents (edge 9) ─── */
function pickKycTier(c) {
  if (c.hasAadhaar && c.hasPAN && c.bankVerified) return KYC_TIER.T3;
  if (c.hasAadhaar) return KYC_TIER.T2;
  if (c.hasVoterId || c.hasRationCard || c.hasMNREGA || c.bankVerified) return KYC_TIER.T1;
  return KYC_TIER.T0; // browse only until at least one document
}

/* ─── Liability map per model ─── */
function liabilityFor(model) {
  switch (model) {
    case MODEL.MOR: case MODEL.GUARDIAN: case MODEL.UMBRELLA:
      return {
        customer: 'NONE',
        gst: 'platform', tcs: 'platform', export_docs: 'platform',
        buyer_relationship: 'platform', returns: 'platform (recourse to supplier per quality clause)',
        income_tax: 'customer declares own earnings in own ITR (personal, not platform-handled)',
      };
    case MODEL.SAAS:
      return {
        customer: 'their own (they are seller of record)',
        gst: 'customer', tcs: 'platform collects on marketplace supplies',
        export_docs: 'customer', buyer_relationship: 'customer (platform assists)',
        returns: 'customer', income_tax: 'customer',
      };
    case MODEL.AGENT:
      return {
        customer: 'their own (service provider of record, physical safety)',
        gst: 'customer if above threshold', booking: 'platform (5% fee)',
        experience_safety: 'customer', income_tax: 'customer',
      };
    default:
      return { customer: 'see notes' };
  }
}

/* ─── Migration watch (edge 2: turnover crossing thresholds) ─── */
function finalize(out, c, dualRole) {
  if (dualRole && out.model !== MODEL.BLOCKED) {
    out.liability_map = {
      as_buyer: 'demand side — no Indian seller liability',
      as_seller: out.liability_map,
    };
    out.notes.push('Edge 12: dual-role resolved — buyer side carries no seller liability; seller side as shown. Each transaction is classified by the role played in it.');
    out.model = MODEL.HYBRID;
  }
  if (c) {
    // Edge 2: MoR supplier approaching/over ₹20L — may need own registration
    if ((out.model === MODEL.MOR || out.model === MODEL.UMBRELLA) && c.annualTurnover) {
      if (c.annualTurnover >= 2000000) {
        out.migration_watch.push('Supplier turnover ≥ ₹20L. Even as a supplier, high-volume sellers may attract own registration scrutiny. Review with CA whether to migrate this supplier to SaaS (own GSTIN) or keep under MoR. Platform-level GST already handles the sale; this is about the supplier\'s own position.');
      } else if (c.annualTurnover >= 1500000) {
        out.migration_watch.push('Supplier turnover ₹15L+ and rising. Pre-emptively prepare GSTIN assistance so migration to SaaS tier is seamless if they cross ₹20L.');
      }
    }
    // Returns liability chain (edge 15)
    if (out.model === MODEL.MOR || out.model === MODEL.GUARDIAN || out.model === MODEL.UMBRELLA) {
      out.notes.push('Edge 15: as seller of record, platform absorbs the buyer-facing return. Supplier agreement includes a quality-warranty clause giving the platform recourse against the supplier for genuinely defective goods — capped, and never for buyer change-of-mind.');
    }
  }
  return out;
}

module.exports = { resolve, MODEL, FULFILMENT, KYC_TIER };
