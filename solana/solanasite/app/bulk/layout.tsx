import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/bulk',
  title: 'Bulk SOL & token sends',
  description:
    'Send SOL or SPL tokens to many recipient wallets in batched transactions. RootRecord fee scales with list size; you pay Solana network fees and associated token-account rent when required.',
  keywords: [...SEO_KEYWORDS.core, 'airdrop', 'bulk transfer', 'mass send SOL', 'SPL batch'],
});

export default function BulkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
