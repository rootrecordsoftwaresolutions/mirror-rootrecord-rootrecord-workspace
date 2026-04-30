'use client';

import dynamic from 'next/dynamic';

// The wallet adapter UI relies on browser APIs; load on client only.
export const WalletMultiButton = dynamic(
  () =>
    import('@solana/wallet-adapter-react-ui').then(
      (m) => m.WalletMultiButton,
    ),
  { ssr: false },
);
