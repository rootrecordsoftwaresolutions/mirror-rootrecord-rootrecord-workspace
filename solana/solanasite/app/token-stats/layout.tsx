import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/token-stats',
  title: 'Token stats dashboard',
  description:
    'Open a shareable dashboard for any Solana SPL mint: circulating supply, authorities, largest token accounts, Jupiter price hint, and Metaplex metadata when present.',
  keywords: [...SEO_KEYWORDS.core, 'token dashboard', 'SPL supply', 'token holders', 'Solscan'],
});

export default function TokenStatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
