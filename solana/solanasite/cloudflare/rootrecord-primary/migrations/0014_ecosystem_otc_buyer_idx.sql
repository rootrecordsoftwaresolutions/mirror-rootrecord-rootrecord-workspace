-- Speed “My actions” OTC lookups by buyer wallet (merged with solana_site log).
CREATE INDEX IF NOT EXISTS idx_ecosystem_otc_buyer_created
  ON ecosystem_otc_fulfillments(buyer, created_at DESC);
