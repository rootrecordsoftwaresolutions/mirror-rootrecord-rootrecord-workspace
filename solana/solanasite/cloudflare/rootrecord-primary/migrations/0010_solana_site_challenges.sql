-- One-time signing challenges for “My Actions” (wallet proves control; nonce consumed on read).

CREATE TABLE IF NOT EXISTS solana_site_challenges (
  nonce TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sol_site_challenges_wallet
  ON solana_site_challenges(wallet, consumed);
