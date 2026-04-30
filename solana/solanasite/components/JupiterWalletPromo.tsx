import type { ReactNode } from 'react';
import { ExternalLink, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const JUPITER_SITE_HREF = 'https://jup.ag/';
const JUPITER_EXTENSION_HREF =
  'https://chromewebstore.google.com/detail/jupiter-wallet/iledlaeogohbilgbfhmbgkgmpplbfboh';

type Variant = 'featured' | 'compact';

const linkClass =
  'text-sol-green hover:text-sol-green/90 underline-offset-4 hover:underline';

function ExternalAnchor({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

/**
 * Promotes Jupiter Wallet (browser extension + jup.ag) as the recommended Solana wallet.
 */
export function JupiterWalletPromo({ variant = 'featured' }: { variant?: Variant }) {
  if (variant === 'compact') {
    return (
      <div
        data-testid="jupiter-wallet-promo-compact"
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-muted-foreground"
      >
        <span>
          <span className="text-foreground/90 font-medium">Wallet we use:</span>{' '}
          <ExternalAnchor href={JUPITER_SITE_HREF}>Jupiter</ExternalAnchor>
          {' — '}
          <ExternalAnchor href={JUPITER_EXTENSION_HREF}>Chrome extension</ExternalAnchor>
          .
        </span>
        <span className="text-xs sm:text-right shrink-0">
          Official wallet from Jupiter; self-custodial.
        </span>
      </div>
    );
  }

  return (
    <aside
      data-testid="jupiter-wallet-promo-featured"
      className="rounded-2xl border border-border bg-ink-700/35 px-6 py-6 md:px-8 md:py-7 shadow-[0_0_48px_-20px_rgba(153,69,255,0.35)]"
    >
      <div className="flex flex-col md:flex-row md:items-start gap-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sol-purple/35 bg-sol-purple/10 text-sol-purple">
          <Puzzle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
              Recommended wallet
            </div>
            <h2
              id="jupiter-wallet-heading"
              className="font-display text-2xl md:text-3xl tracking-tight text-foreground"
            >
              Jupiter Wallet
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-2xl">
              We ship RootRecord against real wallets every day. Jupiter&apos;s browser
              wallet pairs cleanly with dApps, keeps fees sensible on swaps, and matches
              how tokens show up across the ecosystem — including here. Self-custodial;
              keys stay on your device.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button asChild size="sm" className="gap-1.5">
              <a href={JUPITER_EXTENSION_HREF} target="_blank" rel="noopener noreferrer">
                <Puzzle className="h-3.5 w-3.5" />
                Chrome extension
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={JUPITER_SITE_HREF} target="_blank" rel="noopener noreferrer">
                jup.ag
                <ExternalLink className="h-3.5 w-3.5 opacity-80" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
