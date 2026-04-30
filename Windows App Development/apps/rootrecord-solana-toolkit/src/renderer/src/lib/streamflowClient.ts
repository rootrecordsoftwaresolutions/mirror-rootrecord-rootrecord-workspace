import { ICluster, SolanaStreamClient } from '@streamflow/stream';

import { RPC_URL, SOLANA_NETWORK } from '@/lib/solana';

let client: SolanaStreamClient | null = null;

export function streamflowCluster(): ICluster {
  if (SOLANA_NETWORK === 'devnet') return ICluster.Devnet;
  return ICluster.Mainnet;
}

/** Streamflow program client (same RPC + cluster as the rest of the app). */
export function getStreamflowClient(): SolanaStreamClient {
  if (!client) {
    client = new SolanaStreamClient({
      clusterUrl: RPC_URL,
      cluster: streamflowCluster(),
    });
  }
  return client;
}
