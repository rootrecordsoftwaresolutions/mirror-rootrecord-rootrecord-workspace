-- Ecosystem / liquidity program: bot telemetry + reinvest queue (solana.rootrecord.info).

CREATE TABLE IF NOT EXISTS ecosystem_bot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  bot_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  pool_id TEXT,
  mint TEXT,
  tx_signature TEXT,
  amount_token_raw TEXT,
  amount_quote_raw TEXT,
  quote_currency TEXT,
  usd_estimate TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_bot_created
  ON ecosystem_bot_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ecosystem_bot_bot
  ON ecosystem_bot_events(bot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ecosystem_reinvest_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT NOT NULL,
  amount_usd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_reinvest_status
  ON ecosystem_reinvest_queue(status, created_at DESC);
