# NEXUS — Backend Schema (domain → Postgres)

Source of truth: `src/domain.js` SCHEMAS (validation-at-birth). Repository interface maps 1:1
onto these tables at deploy (`STORE_DRIVER=postgres`). All PII columns encrypted via
`dataCrypto` (AES-256-GCM); ids are text slugs; money is BIGINT paise (never floats).

```sql
CREATE TABLE makers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,            -- PII: encrypted
  vertical TEXT NOT NULL, cluster TEXT, state TEXT,
  tier TEXT, gi TEXT,
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, vertical TEXT NOT NULL,
  price_paise BIGINT NOT NULL CHECK (price_paise >= 100),
  maker_id TEXT NOT NULL REFERENCES makers(id), gi TEXT,
  screening JSONB,                                    -- contentPolicy result (hold_for_review)
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id),
  maker_id TEXT NOT NULL REFERENCES makers(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 100),
  buyer_ref TEXT,                                     -- PII-lite: encrypted
  status TEXT NOT NULL CHECK (status IN
    ('created','paid','in_fulfilment','shipped','delivered','settled','refunded','cancelled')),
  history JSONB NOT NULL DEFAULT '[]',                -- state transitions (at/from/to/by)
  created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY, maker_id TEXT NOT NULL REFERENCES makers(id),
  kind TEXT NOT NULL, granted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);  -- canSell requires all 5 kinds granted (sellerConsent)

CREATE TABLE payouts (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  maker_id TEXT NOT NULL REFERENCES makers(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 1),
  idempotency_key TEXT UNIQUE NOT NULL,               -- double-pay blocked at DB level too
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL,      -- karigar|vyapari|niryatak|sansthan|pravasi
  price_paise BIGINT NOT NULL, cycle TEXT
);

CREATE TABLE audit_log (
  seq BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL,
  event JSONB NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);  -- hash-chained; verifyChain() detects tampering

CREATE TABLE feedback (
  id TEXT PRIMARY KEY, role TEXT, area TEXT,
  rating INT CHECK (rating BETWEEN 1 AND 5), message TEXT, at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_products_maker ON products(maker_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_consents_maker ON consents(maker_id);
```

## Rules encoded above the schema (engine-enforced)
- Order transitions only via `domain.transition` (illegal moves refused; terminals frozen)
- `payout ≤ collected` always (slicer never-in-loss; fee floor 2% / ceiling 30%)
- Writes go through repository → validated → audited
- Erasure (DPDP): PII columns nulled/anonymised; order/payout rows retained anonymised (tax)
