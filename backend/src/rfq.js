'use strict';
/**
 * rfq — the B2B / corporate-gifting flow: the highest early-revenue model. A bulk buyer
 * (company, hotel, event, govt delegation) requests a quote → NEXUS curates makers + prices
 * with a bulk tier → buyer accepts → it becomes a real order on the SAME MoR engine
 * (never-in-loss split, audit, notifications). Lifecycle is an explicit state machine, mirroring
 * domain/order discipline. No new money math — delegates to the tested slicer via domain.morSplit.
 */
const sanitize = require('./sanitize');

const RFQ_STATUS = ['requested', 'quoted', 'accepted', 'declined', 'ordered', 'expired'];
const TRANSITIONS = {
  requested: ['quoted', 'declined', 'expired'],
  quoted: ['accepted', 'declined', 'expired'],
  accepted: ['ordered'],
  declined: [], ordered: [], expired: [],
};

// Bulk discount tiers by quantity (buyer sees a better unit price at volume).
function bulkTierPct(qty) {
  qty = Number(qty) || 0;
  if (qty >= 500) return 18;
  if (qty >= 200) return 12;
  if (qty >= 50) return 8;
  if (qty >= 10) return 4;
  return 0;
}

const _rfqs = [];

/** Buyer opens an RFQ. buyerType: company|hotel|event|conference|govt|brand. */
function request(input) {
  input = input || {};
  const qty = Math.round(Number(input.qty) || 0);
  if (qty < 1) return { ok: false, error: 'qty required (min 1)' };
  const rfq = {
    id: 'rfq_' + Date.now().toString(36) + _rfqs.length,
    buyer: sanitize.sanitizeString(input.buyer, 120) || 'buyer',
    buyerType: sanitize.sanitizeString(input.buyerType, 30) || 'company',
    vertical: sanitize.sanitizeString(input.vertical, 40) || 'handicraft',
    qty,
    unitBudgetPaise: Math.max(0, Math.round(Number(input.unitBudgetRupees || 0) * 100)),
    notes: sanitize.sanitizeString(input.notes, 500),
    customization: !!input.customization,
    status: 'requested', history: [], quote: null,
    createdAt: new Date().toISOString(),
  };
  _rfqs.push(rfq);
  try { require('./auditLog').append({ action: 'rfq_request', id: rfq.id, buyer: rfq.buyer, qty }); } catch (e) {}
  return { ok: true, rfq };
}

function _find(id) { return _rfqs.find((r) => r.id === id); }

function _transition(rfq, to, by) {
  if ((TRANSITIONS[rfq.status] || []).indexOf(to) < 0) return { ok: false, error: 'illegal ' + rfq.status + ' -> ' + to };
  rfq.status = to; rfq.updatedAt = new Date().toISOString();
  rfq.history.push({ at: rfq.updatedAt, to, by: by || 'system' });
  try { require('./auditLog').append({ action: 'rfq_' + to, id: rfq.id, by: by || 'system' }); } catch (e) {}
  return { ok: true };
}

/** NEXUS (or the AI cockpit) prepares a quote: unit price, bulk discount, curation/packaging fees. */
function quote(id, input, by) {
  const rfq = _find(id);
  if (!rfq) return { ok: false, error: 'rfq not found' };
  input = input || {};
  const unitPaise = Math.max(0, Math.round(Number(input.unitPriceRupees || 0) * 100)) || rfq.unitBudgetPaise;
  if (!unitPaise) return { ok: false, error: 'unit price required' };
  const tier = bulkTierPct(rfq.qty);
  const grossPaise = unitPaise * rfq.qty;
  const discountPaise = Math.round(grossPaise * tier / 100);
  const curationPaise = Math.round(Number(input.curationRupees || 0) * 100);   // gifting add-on fee
  const packagingPaise = Math.round(Number(input.packagingRupees || 0) * 100);
  const totalPaise = grossPaise - discountPaise + curationPaise + packagingPaise;
  rfq.quote = {
    unit_rupees: Math.round(unitPaise / 100), qty: rfq.qty,
    bulk_discount_pct: tier, discount_rupees: Math.round(discountPaise / 100),
    curation_rupees: Math.round(curationPaise / 100), packaging_rupees: Math.round(packagingPaise / 100),
    total_rupees: Math.round(totalPaise / 100), totalPaise,
    valid_until: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
  };
  const r = _transition(rfq, 'quoted', by || 'nexus');
  if (!r.ok) return r;
  return { ok: true, rfq };
}

function accept(id, by) { const rfq = _find(id); if (!rfq) return { ok: false, error: 'not found' }; if (!rfq.quote) return { ok: false, error: 'no quote to accept' }; const r = _transition(rfq, 'accepted', by || rfq.buyer); return r.ok ? { ok: true, rfq } : r; }
function decline(id, by) { const rfq = _find(id); if (!rfq) return { ok: false, error: 'not found' }; const r = _transition(rfq, 'declined', by || rfq.buyer); return r.ok ? { ok: true, rfq } : r; }

/** Accepted RFQ → real order on the MoR engine (same never-in-loss split + audit). */
function convert(id, makerId, by) {
  const rfq = _find(id);
  if (!rfq) return { ok: false, error: 'not found' };
  if (rfq.status !== 'accepted') return { ok: false, error: 'RFQ must be accepted first (status: ' + rfq.status + ')' };
  const domain = require('./domain');
  const oc = domain.create('order', { productId: 'rfq:' + rfq.id, makerId: makerId || 'm1', amountPaise: rfq.quote.totalPaise, buyerRef: rfq.buyer });
  if (!oc.ok) return oc;
  const mor = domain.morSplit({ amountPaise: rfq.quote.totalPaise }, 12);
  _transition(rfq, 'ordered', by || 'nexus');
  rfq.orderId = oc.entity.id;
  try { require('./notifications').send('order_placed', rfq.buyer, { oid: oc.entity.id, maker: makerId || 'maker' }); } catch (e) {}
  return { ok: true, order: oc.entity, split: { collected_rupees: Math.round(mor.collectedPaise / 100), maker_payout_rupees: Math.round(mor.makerPayoutPaise / 100), platform_fee_rupees: Math.round(mor.platformFeePaise / 100), never_in_loss: mor.never_in_loss }, rfq };
}

function list(status) { return status ? _rfqs.filter((r) => r.status === status) : _rfqs.slice(); }
function get(id) { return _find(id) || null; }
function pipeline() { const by = {}; RFQ_STATUS.forEach((s) => { by[s] = 0; }); _rfqs.forEach((r) => { by[r.status]++; }); return { total: _rfqs.length, by_status: by }; }
function reset() { _rfqs.length = 0; }

module.exports = { RFQ_STATUS, TRANSITIONS, bulkTierPct, request, quote, accept, decline, convert, list, get, pipeline, reset };
