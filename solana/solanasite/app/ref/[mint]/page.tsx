import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, LineChart, Wallet, Shield, Database } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TokenShareBar } from '@/components/token/TokenShareBar';
import { HolderDistributionCharts } from '@/components/token/HolderDistributionCharts';
import { RecentMintTransactions } from '@/components/token/RecentMintTransactions';
import { loadTokenDashboard } from '@/lib/tokenDashboard';
import {
  buildTokenDashboardShareUrl,
  getPublicSiteOrigin,
} from '@/lib/siteOrigin';
import { explorerUrl } from '@/lib/solana';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const revalidate = 60;

type PageProps = { params: { mint: string } };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const res = await loadTokenDashboard(params.mint);
  const label =
    res.ok && (res.data.name || res.data.symbol)
      ? [res.data.name, res.data.symbol].filter(Boolean).join(' · ')
      : params.mint.slice(0, 4) + '…' + params.mint.slice(-4);
  const title = res.ok ? `${label} · Token stats` : 'Token stats';
  const desc = res.ok
    ? `Supply, authorities, largest holders, and price snapshot for ${res.data.mint}.`
    : 'View supply, authorities, holders, and price for any Solana SPL mint.';

  const mint = params.mint.trim();

  return pageSeo({
    path: `/ref/${mint}`,
    title,
    description: desc,
    keywords: [...SEO_KEYWORDS.core, 'token stats', 'SPL mint', mint.slice(0, 12)],
  });
}

function fmtUsd(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return 'Price not available';
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  if (n >= 0.0001) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  return `$${n.toExponential(2)}`;
}

function fmtFdv(price: number | null, supplyUi: string): string {
  if (price == null || !Number.isFinite(price)) return '—';
  const s = parseFloat(supplyUi.replace(/,/g, ''));
  if (!Number.isFinite(s)) return '—';
  const fdv = price * s;
  if (!Number.isFinite(fdv)) return '—';
  if (fdv >= 1e9) return `$${(fdv / 1e9).toFixed(2)}B`;
  if (fdv >= 1e6) return `$${(fdv / 1e6).toFixed(2)}M`;
  if (fdv >= 1e3) return `$${(fdv / 1e3).toFixed(2)}K`;
  return `$${fdv.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function authorityBadge(addr: string | null, label: string) {
  if (!addr) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">{label}</span>
        <Badge className="font-mono text-xs bg-ink-700/80 border-border">
          Revoked / none
        </Badge>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-sm">{label}</div>
      <a
        href={explorerUrl(addr, 'address')}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-sol-green hover:underline break-all inline-flex items-center gap-1"
      >
        {addr.slice(0, 6)}…{addr.slice(-6)}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

export default async function RefTokenDashboardPage({ params }: PageProps) {
  const origin = getPublicSiteOrigin();
  const shareUrl = buildTokenDashboardShareUrl(origin, params.mint);
  const res = await loadTokenDashboard(params.mint);

  if (!res.ok) {
    return (
      <div className="container py-14 md:py-20 max-w-xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Token stats
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight">
          Couldn&apos;t load this mint
        </h1>
        <p className="mt-4 text-muted-foreground">{res.error}</p>
        <p className="mt-6">
          <Link href="/token-stats" className="text-sol-green hover:underline">
            ← Enter another mint
          </Link>
        </p>
      </div>
    );
  }

  const d = res.data;
  const title =
    [d.name, d.symbol].filter(Boolean).join(' · ') || d.mint.slice(0, 8) + '…';
  const largest = d.topHolders[0];

  return (
    <div className="container py-10 md:py-14">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
        <div className="max-w-2xl space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Token stats
          </div>
          <h1 className="font-display text-3xl md:text-5xl tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground font-mono break-all">{d.mint}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge className="border-dashed border-border/80">{d.tokenProgram.replace('-', ' ')}</Badge>
            <Badge className="border-dashed border-border/80">{d.decimals} decimals</Badge>
          </div>
        </div>
        <div className="w-full max-w-md shrink-0">
          <TokenShareBar shareUrl={shareUrl} tokenLabel={title} />
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Database className="h-4 w-4" /> Minted supply
            </CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums">
              {d.supplyUi}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <LineChart className="h-4 w-4" /> Price
            </CardDescription>
            <CardTitle
              className={`text-2xl font-mono tabular-nums ${d.priceUsd == null ? 'text-muted-foreground text-lg font-sans' : ''}`}
            >
              {fmtUsd(d.priceUsd)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            {d.priceUsd != null && Number.isFinite(d.priceUsd) ? (
              <div>
                Fully diluted (price × supply):{' '}
                <span className="text-foreground font-mono">
                  {fmtFdv(d.priceUsd, d.supplyUi)}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Largest token account
            </CardDescription>
            {largest ? (
              <>
                <CardTitle className="text-xl font-mono tabular-nums">
                  {largest.uiAmount}
                </CardTitle>
                <CardDescription className="pt-1">
                  {largest.percentOfSupply}% of supply
                </CardDescription>
              </>
            ) : (
              <CardTitle className="text-lg">—</CardTitle>
            )}
          </CardHeader>
          {largest ? (
            <CardContent>
              <a
                href={explorerUrl(largest.tokenAccount, 'address')}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-sol-green hover:underline break-all inline-flex items-center gap-1"
              >
                {largest.tokenAccount}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Authorities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {authorityBadge(d.mintAuthority, 'Mint authority')}
            {authorityBadge(d.freezeAuthority, 'Freeze authority')}
          </CardContent>
        </Card>
      </div>

      {(d.updateAuthority || d.metadataUri) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Metaplex metadata</CardTitle>
            <CardDescription>
              On-chain metadata account linked to this mint (if present).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {authorityBadge(d.updateAuthority, 'Update authority')}
            {d.metadataUri ? (
              <div className="space-y-1">
                <div className="text-muted-foreground text-sm">JSON URI</div>
                <a
                  href={d.metadataUri}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-sol-green hover:underline break-all"
                >
                  {d.metadataUri}
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Distribution &amp; balances</CardTitle>
          <CardDescription>
            Estimated share of minted supply held in the largest SPL token accounts (top 10).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <HolderDistributionCharts holders={d.topHolders} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent mint activity</CardTitle>
            <CardDescription>
              Latest transactions that reference this mint account (signatures on-chain).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentMintTransactions txs={d.recentTxs} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top token accounts</CardTitle>
            <CardDescription>Largest on-chain balances for this mint.</CardDescription>
          </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Token account</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-right">% of supply</th>
              </tr>
            </thead>
            <tbody>
              {d.topHolders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No holder data returned for this mint.
                  </td>
                </tr>
              ) : (
                d.topHolders.map((row, i) => (
                  <tr key={row.tokenAccount} className="border-b border-border/60">
                    <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <a
                        href={explorerUrl(row.tokenAccount, 'address')}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sol-green hover:underline break-all"
                      >
                        {row.tokenAccount.slice(0, 10)}…{row.tokenAccount.slice(-8)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {row.uiAmount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {row.percentOfSupply}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        <Link href="/token-stats" className="text-sol-green hover:underline">
          Look up another mint
        </Link>
        {' · '}
        <a
          href={explorerUrl(d.mint, 'address')}
          target="_blank"
          rel="noreferrer"
          className="text-sol-green hover:underline"
        >
          Open on Solscan
        </a>
      </p>
    </div>
  );
}
