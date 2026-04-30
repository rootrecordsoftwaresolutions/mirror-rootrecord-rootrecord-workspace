import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/tools',
  title: 'Manage Solana tokens',
  description:
    'On-chain tools: revoke mint or freeze authority, mint more supply, update Metaplex metadata, Token-2022 transfer fee withdraw and harvest, Raydium CPMM pool helpers, and more. Flat SOL tool fees.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'revoke freeze authority',
    'update token metadata',
    'withdraw transfer fee',
    'Token-2022 fees',
    'burn SPL tokens',
  ],
});

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
