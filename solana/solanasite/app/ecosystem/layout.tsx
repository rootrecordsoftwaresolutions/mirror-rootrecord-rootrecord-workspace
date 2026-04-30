import type { Metadata } from 'next';

import { ECOSYSTEM_LISTING_NAME, ECOSYSTEM_LISTING_SYMBOL } from '@/lib/ecosystemOtcConstants';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/ecosystem',
  title: `Purpose — ${ECOSYSTEM_LISTING_SYMBOL}`,
  description: `${ECOSYSTEM_LISTING_NAME} (${ECOSYSTEM_LISTING_SYMBOL}): fee and treasury mechanics, Solana pool context, OTC treasury flows, and the live Treasury Transfer Tool in one page.`,
  keywords: [...SEO_KEYWORDS.core, ECOSYSTEM_LISTING_SYMBOL, ECOSYSTEM_LISTING_NAME, 'treasury', 'OTC'],
});

export default function EcosystemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
