import { Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ShieldOff,
  Lock,
  Coins,
  Flame,
  Pencil,
  FileLock2,
  ArrowRight,
  Banknote,
  Wand2,
  Sparkles,
  Layers,
  Rocket,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ToolDialog, type ToolKind } from '@/components/tools/ToolDialog';
import {
  LAUNCH_FEE_SOL,
  RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL,
} from '@/lib/solana';

const LAUNCH_POOL_CARD_DESC = `Create a CPMM pool or add liquidity to an existing one. Mainnet new pool: ~${(RAYDIUM_MAINNET_CPMM_POOL_CREATE_FEE_SOL + LAUNCH_FEE_SOL).toFixed(2)} SOL setup + liquidity (same as Raydium).`;

const TOOLS: (
  | {
      kind: ToolKind;
      title: string;
      desc: string;
      icon: LucideIcon;
      tone: 'green' | 'purple';
      t2022?: boolean;
    }
  | {
      href: string;
      title: string;
      desc: string;
      icon: LucideIcon;
      tone: 'green' | 'purple';
      t2022?: boolean;
    }
)[] = [
  {
    kind: 'revoke-mint',
    title: 'Revoke mint authority',
    desc: 'Lock supply forever. The single most-requested signal of trust for new tokens.',
    icon: ShieldOff,
    tone: 'green',
  },
  {
    kind: 'revoke-freeze',
    title: 'Revoke freeze authority',
    desc: 'Tell the market no one can freeze holders\' token accounts. A simple, public guarantee.',
    icon: Lock,
    tone: 'green',
  },
  {
    kind: 'mint-more',
    title: 'Mint more tokens',
    desc: 'Top up supply for an airdrop, market making, or LP funding. Mint authority required.',
    icon: Coins,
    tone: 'purple',
  },
  {
    kind: 'burn-tokens',
    title: 'Burn tokens',
    desc: 'Remove tokens from your wallet’s account for that mint and shrink supply. No RootRecord fee — only network fees.',
    icon: Flame,
    tone: 'purple',
  },
  {
    kind: 'update-metadata',
    title: 'Update metadata (legacy)',
    desc: 'Same fields as create—name, symbol, description, website, socials, logo, and listing link. On-chain edits must still be allowed.',
    icon: Pencil,
    tone: 'purple',
  },
  {
    kind: 'lock-metadata',
    title: 'Lock listing metadata (legacy)',
    desc: 'Permanently freeze listing edits on-chain (name, symbol, listing link). Requires the listing update authority wallet — standard SPL + Metaplex only.',
    icon: FileLock2,
    tone: 'green',
  },
  {
    kind: 'withdraw-fees',
    title: 'Withdraw transfer fees',
    desc: 'Pull all withheld transfer fees from your Token-2022 mint into a destination you own.',
    icon: Banknote,
    tone: 'green',
    t2022: true,
  },
  {
    kind: 'harvest-fees',
    title: 'Harvest fees → mint',
    desc: 'Sweep withheld fees from a list of holder accounts back to the mint, ready to withdraw.',
    icon: Wand2,
    tone: 'green',
    t2022: true,
  },
  {
    kind: 'update-fee-config',
    title: 'Update transfer fee config',
    desc: 'Change the basis points or max fee on a Token-2022 mint. Takes effect after 2 epochs.',
    icon: Sparkles,
    tone: 'purple',
    t2022: true,
  },
  {
    href: '/liquidity',
    title: 'Liquidity (Raydium CPMM)',
    desc: LAUNCH_POOL_CARD_DESC,
    icon: Rocket,
    tone: 'green',
  },
  {
    href: '/bulk',
    title: 'Bulk SOL & SPL sends',
    desc: 'Pay many wallets in a few batched transactions — native SOL or SPL tokens. RootRecord fee scales with list size.',
    icon: Layers,
    tone: 'green',
  },
];

function ToolsInner() {
  const params = useSearchParams();
  const [active, setActive] = useState<ToolKind | null>(null);
  const [initialMint, setInitialMint] = useState<string | undefined>();

  const actionParam = params.get('action');
  const mintParam = params.get('mint')?.trim() || '';

  useEffect(() => {
    if (actionParam === 'mint') {
      setActive('mint-more');
      setInitialMint(mintParam || undefined);
    } else if (actionParam === 'burn') {
      setActive('burn-tokens');
      setInitialMint(mintParam || undefined);
    }
  }, [actionParam, mintParam]);

  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          02 / Tools
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          Manage your token like an{' '}
          <em className="italic text-sol-purple">operator</em>.
        </h1>
        <p className="mt-5 text-muted-foreground max-w-2xl">
          Standalone, on-chain actions you might run before, during, or after a
          launch. Most tools are one signed transaction; bulk sends and Raydium
          liquidity flows may batch or chain as required.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {TOOLS.map((t, i) => {
          const isLink = 'href' in t;
          const key = isLink ? t.href : t.kind;
          const testId = isLink
            ? `tool-card-${t.href.replace(/^\//, '').replace(/\//g, '-')}`
            : `tool-card-${t.kind}`;
          const cardClassName =
            'group h-full transition-all hover:-translate-y-1 hover:border-sol-green/40 hover:shadow-[0_0_40px_-12px_rgba(20,241,149,0.25)]' +
            (isLink ? '' : ' cursor-pointer');

          const inner = (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <span className="text-xs font-mono text-sol-green/80 tracking-widest">
                    {(i + 1).toString().padStart(2, '0')} /
                  </span>
                  <div className="flex items-center gap-2">
                    {t.t2022 && (
                      <span className="text-[10px] uppercase tracking-[0.14em] rounded-full px-2 py-0.5 border border-sol-purple/40 bg-sol-purple/10 text-sol-purple">
                        Token-2022
                      </span>
                    )}
                    <t.icon
                      className={
                        'h-5 w-5 transition-colors ' +
                        (t.tone === 'green'
                          ? 'text-muted-foreground group-hover:text-sol-green'
                          : 'text-muted-foreground group-hover:text-sol-purple')
                      }
                    />
                  </div>
                </div>
                <CardTitle className="mt-4">{t.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-relaxed">
                  {t.desc}
                </CardDescription>
                <div className="mt-5">
                  {isLink ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-sol-green">
                      Open tool <ArrowRight className="h-4 w-4" />
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 hover:bg-transparent text-sol-green"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActive(t.kind);
                        setInitialMint(undefined);
                      }}
                    >
                      Open tool <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </>
          );

          if (isLink) {
            return (
              <Link
                key={key}
                to={t.href}
                data-testid={testId}
                className="block rounded-xl text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sol-green/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Card className={`${cardClassName} cursor-pointer`}>{inner}</Card>
              </Link>
            );
          }

          return (
            <Card
              key={key}
              data-testid={testId}
              className={cardClassName}
              onClick={() => {
                setActive(t.kind);
                setInitialMint(undefined);
              }}
            >
              {inner}
            </Card>
          );
        })}
      </div>

      <ToolDialog
        kind={active}
        initialMint={initialMint}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

export default function ToolsHomeView() {
  return (
    <Suspense fallback={<div className="container py-20" />}>
      <ToolsInner />
    </Suspense>
  );
}
