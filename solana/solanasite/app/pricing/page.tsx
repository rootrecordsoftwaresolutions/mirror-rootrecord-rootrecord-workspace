import type { Metadata } from 'next';
import Link from 'next/link';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';
import { Check, Flame, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CREATE_FEE_SOL,
  ACTION_FEE_SOL,
  LAUNCH_FEE_SOL,
  ADD_LIQUIDITY_FEE_SOL,
  REMOVE_LIQUIDITY_FEE_SOL,
  RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL,
  REFERRAL_FEE_SHARE_BPS,
} from '@/lib/solana';
import { BULK_FEE_PER_100_SOL } from '@/lib/bulkSol';

export const metadata: Metadata = pageSeo({
  path: '/pricing',
  title: 'Pricing — flat SOL per action',
  description:
    'Transparent Solana tool pricing: create token, revoke authority, metadata updates, Raydium liquidity fees, bulk sends, and more. Compare to typical market rates — no subscriptions.',
  keywords: [...SEO_KEYWORDS.core, 'Solana token creator pricing', 'token tool fees', 'flat fee SOL'],
});

function feeSol(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 SOL';
  const s = n.toFixed(6).replace(/\.?0+$/, '');
  return `${s} SOL`;
}

const POOL_SETUP_MAINNET_HINT = `~${RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL.toFixed(2)} SOL Raydium + network`;

type Row = { action: string; us: string; them: string; onchain: string };

function buildRows(): Row[] {
  return [
    {
      action: 'Create SPL token + Metaplex metadata',
      us: feeSol(CREATE_FEE_SOL),
      them: '0.05 – 0.10 SOL',
      onchain: '~0.01 SOL',
    },
    {
      action: 'Revoke mint authority',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.05 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Revoke freeze authority',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.05 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Mint additional supply',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.05 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Update metadata (legacy SPL)',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.10 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Lock listing metadata (immutable, legacy SPL)',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.10 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Token-2022 tools (withdraw / harvest fees, update fee config)',
      us: feeSol(ACTION_FEE_SOL),
      them: '0.02 – 0.08 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Burn tokens (reduce supply)',
      us: '0 SOL',
      them: '0.02 SOL+',
      onchain: '~0.000005 SOL',
    },
    {
      action: `Create Raydium CPMM pool (RootRecord fee tx before pool)`,
      us: feeSol(LAUNCH_FEE_SOL),
      them: '0.05 – 0.15 SOL+',
      onchain: POOL_SETUP_MAINNET_HINT,
    },
    {
      action: 'Add liquidity to existing CPMM pool (fee tx before deposit)',
      us: feeSol(ADD_LIQUIDITY_FEE_SOL),
      them: '0.02 – 0.10 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: 'Remove liquidity from CPMM pool (fee tx before withdraw)',
      us: feeSol(REMOVE_LIQUIDITY_FEE_SOL),
      them: '0.02 – 0.10 SOL',
      onchain: '~0.000005 SOL',
    },
    {
      action: `Bulk SOL or SPL sends (per 100 recipient lines, rounded up)`,
      us: feeSol(BULK_FEE_PER_100_SOL),
      them: 'Varies',
      onchain: 'Network fees only',
    },
    {
      action: 'Token stats dashboard (lookup / share)',
      us: '0 SOL',
      them: '—',
      onchain: '—',
    },
  ];
}

export default function PricingPage() {
  const ROWS = buildRows();
  const year = new Date().getFullYear();

  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          03 / Pricing
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          Pay <em className="italic text-sol-green">once</em>.{' '}
          Per <em className="italic">action</em>.{' '}
          That&apos;s it.
        </h1>
        <p className="mt-5 text-muted-foreground max-w-2xl">
          No subscriptions. No premium tiers. No bundled features you didn&apos;t
          ask for. The platform fee for each action is published right next to
          the real on-chain cost — so you can see exactly where your SOL goes.
        </p>
        {REFERRAL_FEE_SHARE_BPS > 0 && (
          <p className="mt-4 text-sm text-muted-foreground max-w-2xl border-l-2 border-sol-purple/50 pl-4">
            <strong className="text-foreground">Referrals:</strong> when someone
            pays a listed RootRecord fee with a valid{' '}
            <span className="font-mono text-xs">?ref=</span> wallet in their
            browser,{' '}
            {(REFERRAL_FEE_SHARE_BPS / 100).toFixed(
              REFERRAL_FEE_SHARE_BPS % 100 === 0 ? 0 : 2,
            )}
            % of that fee is transferred to the referrer and the remainder to
            RootRecord — in the <em className="text-foreground not-italic">same</em>{' '}
            signed transaction. Ecosystem <strong className="text-foreground">treasury</strong>{' '}
            checkouts (OTC payments to the treasury) are excluded — no referral share on
            those. See{' '}
            <Link href="/referrals" className="text-sol-green hover:underline">
              Referrals
            </Link>
            .
          </p>
        )}
      </div>

      <div className="mt-12">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-sol-green" /> Live pricing
              </CardTitle>
              <Badge>Mainnet · {year}</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-12 px-6 py-4 text-xs uppercase tracking-[0.14em] text-muted-foreground border-t border-border">
              <div className="col-span-5">Action</div>
              <div className="col-span-2 text-right">RootRecord</div>
              <div className="col-span-3 text-right">Competitors</div>
              <div className="col-span-2 text-right">On-chain</div>
            </div>
            {ROWS.map((r) => (
              <div
                key={r.action}
                className="grid grid-cols-12 px-6 py-5 text-sm items-center border-t border-border"
              >
                <div className="col-span-5">{r.action}</div>
                <div className="col-span-2 text-right font-mono text-sol-green">
                  {r.us}
                </div>
                <div className="col-span-3 text-right font-mono text-muted-foreground line-through decoration-rose-500/40">
                  {r.them}
                </div>
                <div className="col-span-2 text-right font-mono text-muted-foreground">
                  {r.onchain}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {[
          {
            t: 'No subscriptions',
            d: 'You only pay when you take an action. No monthly bill, no recurring charge.',
            yes: true,
          },
          {
            t: 'No upsells',
            d: 'No premium tier for revoking authority, liquidity, or updating metadata. Same flat fee per paid action.',
            yes: true,
          },
          {
            t: 'No keys touched',
            d: 'Your wallet signs every transaction. RootRecord never sees your private key.',
            yes: true,
          },
        ].map((p) => (
          <Card key={p.t}>
            <CardHeader>
              <div className="flex items-center gap-2">
                {p.yes ? (
                  <Check className="h-4 w-4 text-sol-green" />
                ) : (
                  <X className="h-4 w-4 text-destructive" />
                )}
                <CardTitle className="text-base">{p.t}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-16 flex flex-wrap gap-4">
        <Button asChild size="lg">
          <Link href="/create">Create a token</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/liquidity">Liquidity</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/tools">Open the toolset</Link>
        </Button>
      </div>
    </div>
  );
}
