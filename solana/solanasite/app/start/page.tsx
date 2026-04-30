import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Coins,
  ExternalLink,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CREATE_FEE_SOL,
  ACTION_FEE_SOL,
  REFERRAL_FEE_SHARE_BPS,
} from '@/lib/solana';
import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/start',
  title: 'Start here',
  description:
    'Step-by-step: install a Solana wallet, connect on RootRecord Solana Tools, understand flat SOL fees and referrals, create or manage a token, and verify transactions on a block explorer.',
  keywords: [...SEO_KEYWORDS.core, 'Phantom wallet', 'Solflare', 'Jupiter wallet', 'beginner'],
});

const STEPS: {
  n: string;
  title: string;
  body: string;
  icon: typeof Wallet;
}[] = [
  {
    n: '01',
    title: 'Install a Solana wallet',
    body: 'You need a self-custody wallet (Phantom, Solflare, Jupiter, Backpack, etc.). RootRecord never asks for your seed phrase — only normal “connect” and “approve transaction” prompts from your wallet app or browser extension.',
    icon: Wallet,
  },
  {
    n: '02',
    title: 'Connect on this site',
    body: 'Use Select Wallet in the top-right of any page, pick your wallet, and approve the connection. Until you connect, Create and some flows stay disabled — that is intentional.',
    icon: ListChecks,
  },
  {
    n: '03',
    title: 'Know what you are paying',
    body: `Each paid action charges a small, fixed RootRecord fee in SOL (for example ~${CREATE_FEE_SOL} SOL to create a token and ~${ACTION_FEE_SOL} SOL for most tools), plus Solana network rent and fees. There are no subscriptions. If you used someone’s referral link (${REFERRAL_FEE_SHARE_BPS > 0 ? `${(REFERRAL_FEE_SHARE_BPS / 100).toFixed(REFERRAL_FEE_SHARE_BPS % 100 === 0 ? 0 : 2)}%` : '0%'} of the platform fee goes to them in the same transaction by default). See Pricing for the full list.`,
    icon: Coins,
  },
  {
    n: '04',
    title: 'Create a token (typical path)',
    body: 'Open Create, enter name, symbol, supply, and decimals. Optionally add a logo and social links — if IPFS is configured, metadata is pinned for explorers. Review the fee sidebar, then sign one transaction (or two for advanced Token-2022 setups). You receive the mint address and own the mint.',
    icon: Sparkles,
  },
  {
    n: '05',
    title: 'After launch: tools',
    body: 'From the success screen or Tools, you can revoke mint or freeze authority, mint more supply, update listing metadata, handle Token-2022 transfer fees, or burn tokens. Each action is its own on-chain transaction with the same transparent fee pattern.',
    icon: Wrench,
  },
  {
    n: '06',
    title: 'Verify on an explorer',
    body: 'Every confirmation gives a signature you can open on Solscan or another explorer. That is the ground truth: your wallet signed; the programs ran on Solana. We do not custody your tokens or your keys.',
    icon: ShieldCheck,
  },
];

export default function StartPage() {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <Badge className="mb-6 border-sol-green/40 bg-sol-green/10 text-sol-green">
          For new visitors
        </Badge>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight leading-[1.08]">
          How RootRecord works,{' '}
          <em className="text-sol-green not-italic font-display italic">step by step</em>.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
          RootRecord Solana Tools helps you launch and manage SPL tokens on Solana with
          clear pricing and wallet-only signing. This page is the short path from “I just
          arrived” to “I know what to click next.”
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="group">
            <Link href="/create">
              Go to Create
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/docs" className="inline-flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Full docs
            </Link>
          </Button>
        </div>
      </div>

      <section className="mt-20 md:mt-24" aria-labelledby="start-steps-heading">
        <h2
          id="start-steps-heading"
          className="sr-only"
        >
          Steps from wallet to verified transaction
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          {STEPS.map((s) => (
            <Card
              key={s.n}
              className="h-full border-border/80 bg-card/40 transition-all duration-300 hover:border-sol-green/30 hover:shadow-[0_0_40px_-16px_rgba(20,241,149,0.2)]"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-mono text-sol-green/80 tracking-widest">
                    {s.n} /
                  </span>
                  <s.icon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                </div>
                <CardTitle className="mt-3 text-xl">{s.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                  {s.body}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16 md:mt-20 max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Before you spend SOL
        </div>
        <h3 className="font-display text-2xl md:text-3xl tracking-tight mb-6">
          Quick <em className="italic text-sol-purple">checklist</em>
        </h3>
        <ul className="space-y-3 text-muted-foreground text-sm md:text-base leading-relaxed">
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sol-green shrink-0" />
            <span>
              You are on <strong className="text-foreground">Solana mainnet</strong> unless
              you intentionally use a dev build pointed at devnet — wrong network means
              failed or confusing transactions.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sol-green shrink-0" />
            <span>
              Your wallet has <strong className="text-foreground">enough SOL</strong> for
              the RootRecord fee plus rent (create is the heaviest; pricing breaks it down).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sol-green shrink-0" />
            <span>
              You understand <strong className="text-foreground">mint authority</strong>: if
              you keep it, you can mint more; if you revoke it, supply is fixed — common for
              memecoins and transparency.
            </span>
          </li>
        </ul>
      </section>

      <section className="mt-16 md:mt-20">
        <Card className="overflow-hidden border-border bg-ink-800/30">
          <CardContent className="p-8 md:p-10 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Optional next reads
              </div>
              <h3 className="font-display text-2xl md:text-3xl tracking-tight">
                Referrals, liquidity, and <em className="italic text-sol-green">bulk sends</em>
              </h3>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                If you share links with <span className="font-mono text-xs">?ref=</span> your
                wallet, attribution can be recorded for future programs — see{' '}
                <Link href="/referrals" className="text-sol-green hover:underline">
                  Referrals
                </Link>
                . Liquidity and bulk tools are separate flows with their own screens and
                fees; start with Create until you need them.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:items-stretch">
              <Button asChild variant="outline">
                <Link href="/referrals">Referral program</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/liquidity">Liquidity</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/bulk">Bulk SOL</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <p className="mt-12 text-center text-sm text-muted-foreground">
        Not financial advice. Tokens can be worthless or illiquid. If something errors, read
        the message, check your balance, and try again — or open{' '}
        <Link href="/docs" className="text-sol-green hover:underline">
          Docs
        </Link>{' '}
        for detail.
        {' · '}
        <a
          href="https://solscan.io"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sol-green hover:underline inline-flex items-center gap-1"
        >
          Solscan <ExternalLink className="h-3 w-3" />
        </a>
      </p>
    </div>
  );
}
