'use strict';

/**
 * logistics.js
 *
 * The fulfilment seam: rate quotes, shipment creation, and tracking — so a
 * maker's parcel actually moves. Like payments / insurer / maps, the courier is
 * a PROVIDER SEAM: a deterministic mock runs today so the whole flow is
 * exercised end-to-end; a real 3PL aggregator (Delhivery, Shiprocket, DTDC, or
 * an ONDC logistics provider) drops in behind the same interface on
 * credentials. Nothing fakes a real shipment — the mock is clearly labelled.
 *
 * Never-in-loss touch: a quote returns the cost so the order math can include
 * shipping before the platform ever commits to a sale.
 *
 * Pure + dependency-free.
 */

const MODE = Object.freeze({ SURFACE: 'surface', EXPRESS: 'express', INTERNATIONAL: 'international' });

// Illustrative rate card (paise). Real rates come from the partner at quote
// time; these let the flow run + the order math include shipping honestly.
const RATE_CARD = Object.freeze({
  surface: { base_paise: 4000, per_kg_paise: 2500, days: '4–6' },
  express: { base_paise: 9000, per_kg_paise: 5000, days: '1–3' },
  international: { base_paise: 60000, per_kg_paise: 45000, days: '7–14' },
});

/**
 * quote — shipping cost for a parcel. Pure function of weight + mode + zone.
 * @param {object} shipment { weight_kg, mode, international? }
 */
function quote(shipment = {}) {
  const mode = shipment.international ? MODE.INTERNATIONAL : (shipment.mode || MODE.SURFACE);
  const card = RATE_CARD[mode] || RATE_CARD.surface;
  const kg = Math.max(0.5, shipment.weight_kg || 0.5);
  const cost_paise = Math.round(card.base_paise + card.per_kg_paise * kg);
  return { mode, weight_kg: kg, cost_paise, eta_days: card.days, currency: 'INR' };
}

/**
 * createShipment — book a shipment via the courier provider. The platform calls
 * the partner; it does not move parcels itself.
 * @returns { ok, shipment } | { ok:false, reason }
 */
function createShipment(order, courier, ctx = {}) {
  if (!courier || typeof courier.book !== 'function') {
    return { ok: false, reason: 'No courier connected. Connect a logistics partner to create shipments.' };
  }
  if (!order || !order.to || !order.from) {
    return { ok: false, reason: 'Shipment needs from + to addresses.' };
  }
  try {
    const q = quote(order);
    const booked = courier.book({ from: order.from, to: order.to, weight_kg: q.weight_kg, mode: q.mode, ref: ctx.order_ref });
    return { ok: true, shipment: { ...booked, quoted_cost_paise: q.cost_paise, eta_days: q.eta_days } };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** track — current status of a shipment via the provider. */
function track(awb, courier) {
  if (!courier || typeof courier.track !== 'function') return { ok: false, reason: 'No courier connected.' };
  try { return { ok: true, tracking: courier.track(awb) }; } catch (e) { return { ok: false, reason: e.message }; }
}

// ── Provider seam ──
function MockCourier() {
  let n = 0;
  return {
    kind: 'mock', live: false,
    book(req) {
      n += 1;
      return {
        awb: 'MOCK-AWB-' + Date.now() + '-' + n,
        carrier: 'mock-courier', mode: req.mode, status: 'label_created',
        note: 'Mock shipment — not a real label. Connect a 3PL partner for real fulfilment.',
      };
    },
    track(awb) {
      return { awb, status: 'in_transit', checkpoints: [{ at: Date.now(), where: 'origin hub', status: 'picked_up' }], note: 'Mock tracking.' };
    },
  };
}
function makeCourier(config = {}) {
  // A real 3PL aggregator client would be built from credentials here.
  if (config.courierApiKey && config.courierId) {
    return { kind: 'partner', live: true, book() { throw new Error('live courier client not yet implemented'); }, track() { throw new Error('live courier client not yet implemented'); } };
  }
  return MockCourier();
}

module.exports = { MODE, RATE_CARD, quote, createShipment, track, MockCourier, makeCourier };
