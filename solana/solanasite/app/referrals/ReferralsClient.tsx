'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { Copy, Link2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import {
  buildReferralUrl,
  clearReferrer,
  getStoredReferrer,
  subscribeReferrerChanged,
} from '@/lib/referral';
import { REFERRAL_FEE_SHARE_BPS } from '@/lib/solana';
import { REFERRAL_MEMO_PREFIX } from '@/lib/referralMemo';

const PATH_PRESETS: { label: string; path: string; hint?: string }[] = [
  { label: 'Home', path: '/' },
  { label: 'Create token', path: '/create', hint: 'Highest intent' },
  { label: 'Tools', path: '/tools' },
  { label: 'Liquidity', path: '/liquidity' },
  { label: 'Bulk SOL', path: '/bulk' },
  { label: 'Pricing', path: '/pricing' },
  { label: 'New tokens', path: '/recent-tokens' },
  { label: 'Token stats', path: '/token-stats' },
  { label: 'Docs', path: '/docs' },
];

export function ReferralsClient() {
  const { publicKey, connected } = useWallet();
  const walletB58 = publicKey?.toBase58() ?? null;
  const [origin, setOrigin] = useState('');
  const [incomingRef, setIncomingRef] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  useEffect(() => {
    setIncomingRef(getStoredReferrer());
    return subscribeReferrerChanged(() => setIncomingRef(getStoredReferrer()));
  }, []);

  const links = useMemo(() => {
    if (!walletB58 || !origin) return [];
    return PATH_PRESETS.map((p) => ({
      ...p,
      url: buildReferralUrl(origin, p.path, walletB58),
    }));
  }, [walletB58, origin]);

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  }, []);

  return (
    <div className="container py-14 md:py-20 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Grow with us
      </div>
      <h1 className="font-display text-4xl md:text-6xl tracking-tight">
        Referral <em className="italic text-sol-green">links</em>
      </h1>
      <p className="mt-4 text-muted-foreground leading-relaxed">
        Anyone who opens the site with{' '}
        <Badge className="font-mono text-[0.65rem] border-dashed bg-transparent">
          ?ref=
        </Badge>{' '}
        plus a valid Solana wallet address stores that wallet as their referrer. When
        they complete a paid RootRecord <strong className="text-foreground">platform fee</strong>{' '}
        action (create, tools, Raydium launch/liquidity tool fees, bulk fees, etc.),{' '}
        <strong className="text-foreground">
          {(REFERRAL_FEE_SHARE_BPS / 100).toFixed(
            REFERRAL_FEE_SHARE_BPS % 100 === 0 ? 0 : 2,
          )}
          %
        </strong>{' '}
        of the platform fee is sent to that referrer&apos;s wallet immediately in the
        same transaction; the rest goes to RootRecord. Self-referral is blocked (you
        cannot use your own wallet as <span className="font-mono text-xs">?ref=</span>
        ). An optional on-chain memo (
        <span className="font-mono text-xs">{REFERRAL_MEMO_PREFIX}</span>…) is still
        included for explorers and analytics.{' '}
        <strong className="text-foreground">Ecosystem treasury checkouts</strong> (SOL or USDC
        paid to the OTC treasury on the Purpose page) do{' '}
        <em className="text-foreground not-italic">not</em> include any referral bonus — the
        full payment goes to the treasury. See{' '}
        <Link href="/docs" className="text-sol-green hover:underline">
          Docs
        </Link>
        .
      </p>

      {incomingRef && (
        <Card className="mt-10 border-sol-purple/30 bg-sol-purple/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-sol-purple">
              <Users className="h-4 w-4" />
              <CardTitle className="text-base">Visitor referrer set</CardTitle>
            </div>
            <CardDescription>
              This browser will tag your <strong className="text-foreground">platform fee</strong>{' '}
              transactions for this wallet until you clear it. Treasury OTC checkouts are
              not affected.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="text-xs font-mono break-all bg-ink-800/80 px-2 py-1 rounded border border-border">
              {incomingRef}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                clearReferrer();
                setIncomingRef(null);
                toast.success('Referrer cleared');
              }}
            >
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mt-10">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-sol-green" />
            <CardTitle>Your links</CardTitle>
          </div>
          <CardDescription>
            Connect the wallet that should receive attribution. Share any path below;
            only wallets that are not the payer can count as referrers (no
            self-referral).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!connected && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground">Connect a wallet to generate links.</p>
              <WalletMultiButton />
            </div>
          )}
          {connected && !walletB58 && (
            <p className="text-sm text-muted-foreground">Waiting for wallet public key…</p>
          )}
          {links.length > 0 && (
            <ul className="space-y-2">
              {links.map((row) => (
                <li
                  key={row.path}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      {row.label}
                      {row.hint && (
                        <span className="text-[0.65rem] uppercase tracking-wider text-sol-green/90">
                          {row.hint}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground break-all mt-0.5">
                      {row.url}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void copy(row.url, row.label)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
