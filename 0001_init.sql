-- Carmen Cookie Jar / Cloudflare D1
-- A row is seeded at 12 cookies per flavor. The Worker adds 12 each week.
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 12 CHECK (available >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  fulfillment_type TEXT NOT NULL,
  fulfillment_date TEXT NOT NULL,
  fulfillment_time TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  total_cents INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  square_order_id TEXT UNIQUE,
  payment_link_id TEXT,
  payment_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders (expires_at);
INSERT OR IGNORE INTO inventory (id, available) VALUES
 ('chocolate-chip',12), ('smores',12), ('oreo',12), ('biscoff',12), ('pumpkin',12), ('snickerdoodle',12);

-- Atomic weekly rollover ledger. Each week can add stock exactly once,
-- even if several Worker instances receive traffic at the same time.
CREATE TABLE IF NOT EXISTS weekly_rollovers (
  week_key TEXT PRIMARY KEY,
  increment INTEGER NOT NULL CHECK (increment > 0),
  created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS weekly_rollover_add_stock
AFTER INSERT ON weekly_rollovers
BEGIN
  UPDATE inventory SET available = available + NEW.increment;
END;
