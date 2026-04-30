import type { Metadata } from 'next';
import { ReferralsClient } from './ReferralsClient';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/referrals',
  title: 'Referral program',
  description:
    'Share RootRecord Solana Tools with ?ref=your wallet address. A configurable share of each referred platform fee is sent to the referrer in the same on-chain transaction. Treasury OTC checkouts are excluded.',
  keywords: [...SEO_KEYWORDS.core, 'Solana referral', 'affiliate fee', '?ref='],
});

export default function ReferralsPage() {
  return <ReferralsClient />;
}
