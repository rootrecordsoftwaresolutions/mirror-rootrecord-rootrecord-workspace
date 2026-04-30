import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  FileKey,
  GitBranch,
  HandCoins,
  Landmark,
  Layers,
  Lock,
  PieChart,
  Scale,
  Shield,
  Timer,
  Users,
  Vault,
  Wallet,
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

type HubCard = {
  title: string;
  desc: string;
  icon: LucideIcon;
  bullets?: string[];
};

const VESTING: HubCard[] = [
  {
    title: 'Linear vesting',
    desc: 'Tokens unlock smoothly from a start time to an end time — classic team and contributor schedules.',
    icon: Timer,
    bullets: ['Configurable start, duration, and cadence', 'Optional cliff before linear begins'],
  },
  {
    title: 'Cliff + tranches',
    desc: 'Hold back supply until a cliff date, then release in fixed chunks on a calendar you define.',
    icon: CalendarClock,
    bullets: ['Any number of tranches', 'Unequal slice sizes per tranche'],
  },
  {
    title: 'TGE unlock + tail',
    desc: 'Release a percentage at launch, then vest the remainder on a second curve so listings stay orderly.',
    icon: PieChart,
    bullets: ['TGE % cap', 'Parallel or sequential tail'],
  },
  {
    title: 'Team & advisor pools',
    desc: 'Isolate allocations in separate schedules so insiders, advisors, and contributors each have clear rules.',
    icon: Users,
    bullets: ['Per-wallet schedules', 'Different cliffs per cohort'],
  },
  {
    title: 'Investor rounds',
    desc: 'Model seed, strategic, and public rounds with different cliffs, discounts, and unlock curves.',
    icon: Briefcase,
    bullets: ['Round labels for reporting', 'Compare curves side by side'],
  },
  {
    title: 'Policy hooks',
    desc: 'Choose whether schedules can be paused, replaced, or left immutable once published — you stay in control of governance tone.',
    icon: Scale,
    bullets: ['Revocable vs irrevocable modes', 'Emergency paths where you allow them'],
  },
];

const LOCKS: HubCard[] = [
  {
    title: 'Time-locked vaults',
    desc: 'Park tokens in a vault that only pays out to a named beneficiary after a timestamp or slot window.',
    icon: Vault,
    bullets: ['Beneficiary wallets', 'Single or staged releases'],
  },
  {
    title: 'Hard timelocks',
    desc: 'No early exit, no hidden keys — parameters are fixed at creation and visible on-chain.',
    icon: Lock,
    bullets: ['Immutable release calendar', 'Auditor-friendly layout'],
  },
  {
    title: 'Treasury custody',
    desc: 'Lock foundation or DAO inventory with explicit spend-down rules instead of ad-hoc transfers.',
    icon: Landmark,
    bullets: ['Treasury vs operational splits', 'Multi-vault strategies'],
  },
  {
    title: 'Escrow until milestone',
    desc: 'Hold funds until off-chain or oracle-backed milestones flip — useful for grants and partnerships.',
    icon: FileKey,
    bullets: ['Milestone metadata', 'Clear unlock proofs'],
  },
  {
    title: 'Multi-recipient splits',
    desc: 'One configuration can fan out to many wallets with different weights, cliffs, and vesting shapes.',
    icon: GitBranch,
    bullets: ['Weighted distributions', 'Add/remove cohorts before activation'],
  },
];

const DEALS: HubCard[] = [
  {
    title: 'Per-wallet customization',
    desc: 'Every beneficiary can carry its own amounts, cliffs, and curves under the same mint.',
    icon: Wallet,
    bullets: ['CSV-style bulk import (planned)', 'Human-readable previews'],
  },
  {
    title: 'Any SPL mint',
    desc: 'Point schedules at new launches or existing tokens you already control — including Token-2022.',
    icon: Layers,
    bullets: ['Works with standard SPL', 'Token-2022 aware paths'],
  },
  {
    title: 'Explorer-verifiable',
    desc: 'Contracts expose parameters observers can read — fewer “trust me” moments for your community.',
    icon: Shield,
    bullets: ['Solscan-friendly addresses', 'Clear event trail'],
  },
  {
    title: 'Liquidity-aware workflows',
    desc: 'Pair vesting with your LP strategy so team unlocks do not surprise the book.',
    icon: HandCoins,
    bullets: ['Coordinate with pool timelines', 'Optional notices in UI'],
  },
];

function CardGrid({ items }: { items: HubCard[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.title} className="border-border/80 bg-ink-950/30">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-lg border border-border/60 bg-ink-900/50 p-2">
                  <Icon className="h-5 w-5 text-sol-green" />
                </div>
                <Badge className="shrink-0 text-[10px] uppercase tracking-wider">Hub</Badge>
              </div>
              <CardTitle className="text-base leading-snug pt-2">{item.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{item.desc}</CardDescription>
            </CardHeader>
            {item.bullets?.length ? (
              <CardContent className="pt-0">
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
                  {item.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Contracts
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          Vesting, locks, and{' '}
          <em className="italic text-sol-green">token deals</em> — in one place.
        </h1>
        <p className="mt-6 text-muted-foreground text-lg leading-relaxed">
          Configure how supply moves over time: who receives it, when it unlocks, and whether those
          rules can ever change. Built for founders, treasuries, and investors who want predictable,
          inspectable on-chain behavior for any token you already minted.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/create">
              Create a token
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/tools">Open tools</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/liquidity">Liquidity</Link>
          </Button>
        </div>
      </div>

      <Card className="mt-14 border-sol-green/30 bg-ink-950/40 max-w-3xl">
        <CardHeader>
          <CardTitle className="text-lg">Live: linear vesting</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Fund a Streamflow vesting stream from your wallet—equal periods on a fixed calendar,
            recipient claims through Streamflow. SPL and Token-2022 mints supported.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="purple">
            <Link href="/contracts/vesting">
              Open vesting tool
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section className="mt-20 space-y-6">
        <div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tight">Vesting schedules</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Model how allocations breathe over months or years — from simple linear unlocks to
            stacked investor rounds.
          </p>
        </div>
        <CardGrid items={VESTING} />
      </section>

      <section className="mt-16 space-y-6">
        <div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tight">Locks &amp; custody</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Hold tokens on-chain until conditions you choose are met — timelocks, vaults, and
            staged releases without opaque custody.
          </p>
        </div>
        <CardGrid items={LOCKS} />
      </section>

      <section className="mt-16 space-y-6">
        <div>
          <h2 className="font-display text-2xl md:text-3xl tracking-tight">Deal structure</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Package rules per wallet, per mint, and per narrative so every stakeholder sees the same
            story on-chain.
          </p>
        </div>
        <CardGrid items={DEALS} />
      </section>

      <Card className="mt-20 border-sol-green/25 bg-ink-950/40">
        <CardHeader>
          <CardTitle className="text-xl">Already live today</CardTitle>
          <CardDescription className="text-base leading-relaxed">
            Issuance, authority changes, burns, metadata updates, liquidity, and bulk sends are live
            across the rest of the app. This Contracts hub is the roadmap surface for programmable
            releases — builders connect a wallet here when each flow is wired.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="purple">
            <Link href="/docs">Read the docs</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
