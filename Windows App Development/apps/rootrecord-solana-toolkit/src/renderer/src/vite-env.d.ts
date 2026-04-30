/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_NETWORK?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_FEE_WALLET?: string;
  readonly VITE_CREATE_FEE_SOL?: string;
  readonly VITE_ACTION_FEE_SOL?: string;
  readonly VITE_REFERRAL_SHARE_BPS?: string;
  readonly VITE_LAUNCH_FEE_SOL?: string;
  readonly VITE_ADD_LIQUIDITY_FEE_SOL?: string;
  readonly VITE_REMOVE_LIQUIDITY_FEE_SOL?: string;
  readonly VITE_LAUNCH_USDC_MINT?: string;
  readonly VITE_BULK_FEE_PER_100_SOL?: string;
  readonly VITE_PINATA_JWT?: string;
  readonly VITE_PINATA_GATEWAY?: string;
  readonly VITE_WORKER_API_ORIGIN?: string;
  readonly VITE_SOLANA_SITE_LOG_SECRET?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    rootrecord?: { platform: string };
  }
}
