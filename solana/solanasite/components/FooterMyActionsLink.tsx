'use client';

import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

/** Footer “My actions” — only when a wallet is connected (matches header nav). */
export function FooterMyActionsLink() {
  const { connected } = useWallet();
  if (!connected) return null;
  return (
    <li>
      <Link href="/my-actions" className="hover:text-sol-green">
        My actions
      </Link>
    </li>
  );
}
