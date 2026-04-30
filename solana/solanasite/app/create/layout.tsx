import type { Metadata } from 'next';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/create',
  title: 'Create SPL or Token-2022 token',
  description:
    'Launch a Solana mint with one signed transaction (legacy SPL + Metaplex) or Token-2022 with optional extensions. Optional IPFS logo and metadata via Pinata. Transparent create fee in SOL.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'create SPL token',
    'create token Solana',
    'IPFS token metadata',
    'Pinata',
    'mint token',
  ],
});

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
