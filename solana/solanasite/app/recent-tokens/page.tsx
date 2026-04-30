import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Sparkles, LineChart } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FEATURED_TOKENS } from '@/lib/featuredTokens';
import { fetchSolanaWorkerGet } from '@/lib/solanaSiteApi';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const revalidate = 60;

type RecentTokenRow = {
  mint: string;
  name: string | null;
  symbol: string | null;
  token2022: boolean;
  created_at: string;
  wallet: string;
};

export async function generateMetadata(): Promise<Metadata> {
  return pageSeo({
    path: '/recent-tokens',
    title: 'New tokens feed',
    description:
      'Featured picks plus a feed of SPL tokens created with RootRecord Solana Tools. Jump to the shareable token stats dashboard for any mint address.',
    keywords: [...SEO_KEYWORDS.core, 'new Solana tokens', 'token feed', 'mint list'],
  });
}

function fmtCreated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function shortMint(m: string): string {
  if (m.length < 20) return m;
  return `${m.slice(0, 4)}…${m.slice(-4)}`;
}

async function loadRecent(): Promise<{ ok: true; tokens: RecentTokenRow[] } | { ok: false; detail: string }> {
  const res = await fetchSolanaWorkerGet('/api/solana-site/recent-tokens?limit=50');
  let j: Record<string, unknown>;
  try {
    j = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, detail: 'Invalid response' };
  }
  if (j.skipped) {
    return { ok: false, detail: String(j.detail || 'Service unavailable') };
  }
  if (!res.ok) {
    return { ok: false, detail: String(j.detail || `HTTP ${res.status}`) };
  }
  if (!j.ok || !Array.isArray(j.tokens)) {
    return { ok: false, detail: 'Unexpected payload' };
  }
  return { ok: true, tokens: j.tokens as RecentTokenRow[] };
}

export default async function RecentTokensPage() {
  const feed = await loadRecent();
  const recentOk = feed.ok;
  const recent = feed.ok ? feed.tokens : [];

  const featuredMints = new Set(FEATURED_TOKENS.map((f) => f.mint));
  const rest = recent.filter((t) => !featuredMints.has(t.mint));

  return (
    <div className="container py-14 md:py-20 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
        <LineChart className="h-4 w-4" />
        New tokens
      </div>
      <h1 className="font-display text-4xl md:text-5xl tracking-tight">Recently created</h1>
      <p className="mt-5 text-muted-foreground max-w-2xl">
        Tokens our team spotlights, plus a free public feed of mints created with{' '}
        <Link href="/create" className="text-sol-green hover:underline">
          Create Token
        </Link>
        . Every row links to the same shareable stats page as{' '}
        <Link href="/token-stats" className="text-sol-green hover:underline">
          Token stats
        </Link>
        . Listing in the feed is not an endorsement.
      </p>

      {FEATURED_TOKENS.length > 0 ? (
        <section className="mt-12" aria-labelledby="featured-heading">
          <h2 id="featured-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sol-green" />
            RootRecord picks
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Manually curated. Add your mints in <code className="text-xs font-mono">lib/featuredTokens.ts</code>.
          </p>
          <ul className="space-y-3 list-none p-0 m-0">
            {FEATURED_TOKENS.map((f) => (
              <li key={f.mint}>
                <Card className="border-border/80 bg-ink-900/40">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{f.title}</CardTitle>
                        {f.subtitle ? (
                          <CardDescription className="mt-1">{f.subtitle}</CardDescription>
                        ) : null}
                        <p className="mt-2 font-mono text-xs text-muted-foreground break-all">
                          {f.mint}
                        </p>
                      </div>
                      <Button asChild size="sm" className="shrink-0">
                        <Link href={`/ref/${f.mint}`}>
                          Open dashboard
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className={FEATURED_TOKENS.length > 0 ? 'mt-12' : 'mt-10'}
        aria-labelledby="feed-heading"
      >
        <h2 id="feed-heading" className="text-sm font-semibold text-foreground">
          Created on RootRecord tools
        </h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Shown in reverse-chronological order. Free listing for any successful create flow that logs to our
          service.
        </p>

        {!recentOk ? (
          <p className="text-rose-400 text-sm" role="status">
            Token feed is temporarily unavailable. {!feed.ok ? feed.detail : null}
          </p>
        ) : rest.length === 0 && recent.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            No tokens in the log yet—be the first to launch one from Create Token.
          </p>
        ) : rest.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            All logged tokens are in the featured list above, or the feed is still warming up.
          </p>
        ) : (
          <ul className="space-y-3 list-none p-0 m-0">
            {rest.map((t) => {
              const label =
                t.name && t.symbol
                  ? `${t.name} ($${t.symbol})`
                  : t.symbol
                    ? `$${t.symbol}`
                    : t.name
                      ? t.name
                      : shortMint(t.mint);
              return (
                <li key={t.mint}>
                  <Card className="border-border/80">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="font-medium text-foreground truncate">{label}</div>
                          <div className="font-mono text-xs text-muted-foreground break-all">{t.mint}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{fmtCreated(t.created_at)}</span>
                            {t.token2022 ? (
                              <Badge className="text-[10px] h-5 px-2 border-sol-green/40 bg-sol-green/10 text-sol-green">
                                Token-2022
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] h-5 px-2 border-border/80 bg-transparent">
                                Legacy SPL
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link href={`/ref/${t.mint}`}>
                            Dashboard
                            <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
