import type { Metadata } from 'next';

import { pageSeo } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/my-actions',
  title: 'My actions',
  description:
    'After wallet verification, view a history of on-chain actions you performed through RootRecord Solana Tools (create, tools, liquidity, and related flows).',
  noindex: true,
});

export default function MyActionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
