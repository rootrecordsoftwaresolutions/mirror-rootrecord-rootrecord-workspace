/** Cluster label stored with each row (matches site build). */
function siteNetwork(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SOLANA_NETWORK) {
    return process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  }
  return 'mainnet-beta';
}

/** Stable action names for D1 / “My Actions” queries. */
export const SiteAction = {
  TOKEN_CREATE: 'token_create',
  TOKEN_REVOKE_MINT: 'token_revoke_mint',
  TOKEN_REVOKE_FREEZE: 'token_revoke_freeze',
  TOOL_PREFIX: 'tool:',
  LIQ_POOL_CREATE: 'liquidity_pool_create',
  LIQ_ADD: 'liquidity_add',
  LIQ_REMOVE: 'liquidity_remove',
  BULK_SOL_SEND: 'bulk_sol_send',
  BULK_TOKEN_SEND: 'bulk_token_send',
  /** Treasury Transfer Tool checkout (also listed from D1 fulfillments on My Actions). */
  OTC_CHECKOUT: 'otc_checkout',
} as const;

export type SiteActionLogInput = {
  wallet: string;
  action: string;
  route?: string;
  signature?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget client log to our API (Next proxies to Cloudflare D1).
 * Never throws; safe to call after successful txs.
 */
export function logSolanaSiteAction(input: SiteActionLogInput): void {
  if (typeof window === 'undefined') return;
  const { wallet, action, route, signature, metadata } = input;
  if (!wallet || !action) return;

  const body = JSON.stringify({
    wallet,
    action,
    network: siteNetwork(),
    route: route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    signature,
    metadata,
  });

  try {
    void fetch('/api/solana-site/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
