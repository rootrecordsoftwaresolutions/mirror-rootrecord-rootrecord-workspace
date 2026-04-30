import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/contracts',
  title: 'On-chain contracts',
  description:
    'Explore vesting schedules, time locks, and token custody patterns on Solana: cliffs, tranches, treasuries, and multi-recipient releases aligned with RootRecord tooling.',
  keywords: [...SEO_KEYWORDS.core, 'vesting', 'token lock', 'treasury', 'Solana smart contract'],
});

export default function ContractsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
