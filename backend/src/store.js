/**
 * UNIFIED — File-backed persistence (zero dependencies).
 * The in-memory Platform loses everything on restart. This persists the store
 * to a JSON file atomically, so a real deployment survives restarts.
 *
 * Production swaps this for PostgreSQL; the interface stays identical.
 */

'use strict';

const fs = require('fs');
const path = require('path');

class FileStore {
  constructor(filePath = path.join(__dirname, '..', 'data', 'nexus-store.json')) {
    this.filePath = filePath;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /** Load the full state, or return a fresh empty shape. */
  load() {
    try {
      if (!fs.existsSync(this.filePath)) return this._empty();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      // Rehydrate Maps from arrays. New collections (leads, returns) default
      // to empty so older store files keep working without migration.
      return {
        customers: new Map(data.customers || []),
        products: new Map(data.products || []),
        orders:   new Map(data.orders   || []),
        leads:    new Map(data.leads    || []),
        returns:  new Map(data.returns  || []),
        conversations: new Map(data.conversations || []),
        cooperatives:  new Map(data.cooperatives  || []),
        sellers:  new Map(data.sellers  || []),
        products_v2: new Map(data.products_v2 || []),
        cost_ledger: new Map(data.cost_ledger || []),
        orders_v2: new Map(data.orders_v2 || []),
        platform_settings: data.platform_settings || null,
        launch_approvals: data.launch_approvals || {},
        seller_consents: data.seller_consents || {},
        // Plain-JSON domains persistDomain writes — previously dropped by
        // save(), so CRM stage progress, agent controls, grievances etc.
        // silently reset on every restart.
        guardian_arrangements: data.guardian_arrangements || {},
        prospect_db: data.prospect_db || null,
        ops_control: data.ops_control || null,
        watchdog_history: data.watchdog_history || null,
        grievance_log: data.grievance_log || null,
        charity_fund: data.charity_fund || null,
        reviews: data.reviews || null,
        ledger: data.ledger || [],
        _id: data._id || 1,
      };
    } catch (e) {
      console.error('Store load failed, starting fresh:', e.message);
      return this._empty();
    }
  }

  /** Atomic save: write to temp, then rename (prevents corruption on crash). */
  save(state) {
    const serialised = JSON.stringify({
      customers: [...state.customers.entries()],
      products: [...state.products.entries()],
      orders:   [...state.orders.entries()],
      leads:    state.leads   ? [...state.leads.entries()]   : [],
      returns:  state.returns ? [...state.returns.entries()] : [],
      conversations: state.conversations ? [...state.conversations.entries()] : [],
      cooperatives:  state.cooperatives  ? [...state.cooperatives.entries()]  : [],
      sellers:  state.sellers ? [...state.sellers.entries()] : [],
      products_v2: state.products_v2 ? [...state.products_v2.entries()] : [],
      cost_ledger: state.cost_ledger ? [...state.cost_ledger.entries()] : [],
      orders_v2: state.orders_v2 ? [...state.orders_v2.entries()] : [],
      platform_settings: state.platform_settings || null,
      launch_approvals: state.launch_approvals || {},
      seller_consents: state.seller_consents || {},
      guardian_arrangements: state.guardian_arrangements || {},
      prospect_db: state.prospect_db || null,
      ops_control: state.ops_control || null,
      watchdog_history: state.watchdog_history || null,
      grievance_log: state.grievance_log || null,
      charity_fund: state.charity_fund || null,
      reviews: state.reviews || null,
      ledger: state.ledger,
      _id: state._id,
      saved_at: new Date().toISOString(),
    }, null, 2);

    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, serialised, 'utf8');
    fs.renameSync(tmp, this.filePath); // atomic on same filesystem
  }

  _empty() {
    return {
      customers: new Map(), products: new Map(), orders: new Map(),
      leads: new Map(), returns: new Map(),
      conversations: new Map(), cooperatives: new Map(),
      sellers: new Map(),
      products_v2: new Map(),
      cost_ledger: new Map(),
      orders_v2: new Map(),
      platform_settings: null,
      launch_approvals: {},
      seller_consents: {},
      guardian_arrangements: {},
      prospect_db: null,
      ops_control: null,
      ledger: [], _id: 1,
    };
  }

  /** Wipe (for clean demo runs). */
  reset() {
    if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
  }
}

module.exports = { FileStore };
