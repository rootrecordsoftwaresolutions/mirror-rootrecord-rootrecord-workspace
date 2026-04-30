const V = import.meta.env;

function siteNetwork(): string {
  return (V.VITE_SOLANA_NETWORK as string | undefined)?.trim() || 'mainnet-beta';
}

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
 * Forwards to Cloudflare Worker (same as Next /api/solana-site/log) when
 * VITE_WORKER_API_ORIGIN and VITE_SOLANA_SITE_LOG_SECRET are set.
 */
export function logSolanaSiteAction(input: SiteActionLogInput): void {
  const { wallet, action, route, signature, metadata } = input;
  if (!wallet || !action) return;

  const origin = (V.VITE_WORKER_API_ORIGIN as string | undefined)?.replace(/\/$/, '');
  const secret = (V.VITE_SOLANA_SITE_LOG_SECRET as string | undefined)?.trim();
  if (!origin || !secret) return;

  const body = JSON.stringify({
    wallet,
    action,
    network: siteNetwork(),
    route: route ?? (typeof location !== 'undefined' ? location.pathname : '/desktop'),
    signature,
    metadata,
  });

  void fetch(`${origin}/api/solana-site/log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body,
    keepalive: true,
  }).catch(() => {});
}
