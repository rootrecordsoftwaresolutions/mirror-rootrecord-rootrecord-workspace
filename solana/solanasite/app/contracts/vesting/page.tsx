import type { Metadata } from 'next';
import Link from 'next/link';

import { LinearVestingClient } from '@/components/contracts/LinearVestingClient';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/contracts/vesting',
  title: 'Linear vesting (Streamflow)',
  description:
    'Create an on-chain SPL token vesting stream from your wallet: fund from your ATA, unlock on a fixed period schedule via Streamflow on Solana.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'vesting',
    'Streamflow',
    'token vesting',
    'SPL vesting',
    'Solana vesting',
  ],
});

export default function ContractsVestingPage() {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          <Link href="/contracts" className="hover:text-sol-green transition-colors">
            Contracts
          </Link>
          <span className="mx-2 text-border">/</span>
          Vesting
        </p>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          Linear <em className="italic text-sol-green">vesting</em>
        </h1>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Lock tokens into a Streamflow contract and release them on a steady cadence. Works with SPL
          and Token-2022 mints you already hold.
        </p>
      </div>

      <div className="mt-12 max-w-3xl">
        <LinearVestingClient />
      </div>
    </div>
  );
}
