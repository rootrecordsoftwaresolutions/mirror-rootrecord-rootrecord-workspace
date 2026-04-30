-- Solana tools site (solana.rootrecord.info): append-only action log for wallets.
-- Queried later for "My Actions" and product analytics.

CREATE TABLE IF NOT EXISTS solana_site (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  wallet TEXT NOT NULL,
  action TEXT NOT NULL,
  network TEXT,
  route TEXT,
  signature TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_solana_site_wallet_created
  ON solana_site(wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_solana_site_action
  ON solana_site(action);

CREATE INDEX IF NOT EXISTS idx_solana_site_signature
  ON solana_site(signature)
  WHERE signature IS NOT NULL;
