'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WalletMultiButton } from '@/components/wallet/WalletButton';
import { ReferralPill } from '@/components/ReferralPill';
import { AccountSignInButton } from '@/components/RootRecordAuthDialog';

const NAV = [
  { href: '/start', label: 'Start here' },
  { href: '/create', label: 'Create Token' },
  { href: '/liquidity', label: 'Liquidity' },
  { href: '/tools', label: 'Tools' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/recent-tokens', label: 'New tokens' },
  { href: '/token-stats', label: 'Token Stats' },
  { href: '/ecosystem', label: 'Purpose' },
  { href: '/bulk', label: 'Bulk SOL' },
  { href: '/wallet-generator', label: 'Wallet Generator' },
  { href: '/my-actions', label: 'My Actions' },
  { href: '/referrals', label: 'Referrals' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

export function Header() {
  const pathname = usePathname();
  const { connected } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const nav = NAV.filter((n) => n.href !== '/my-actions' || connected);

  const linkIsActive = (href: string) =>
    pathname === href ||
    (href === '/token-stats' && pathname.startsWith('/ref/')) ||
    (href === '/recent-tokens' && pathname.startsWith('/recent-tokens')) ||
    (href === '/ecosystem' && pathname.startsWith('/ecosystem')) ||
    (href === '/referrals' && pathname.startsWith('/referrals')) ||
    (href === '/start' && pathname.startsWith('/start')) ||
    (href === '/wallet-generator' && pathname.startsWith('/wallet-generator'));

  return (
    <header
      data-testid="site-header"
      className="sticky top-0 z-40 border-b border-border bg-ink-900/70 backdrop-blur-md"
    >
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          data-testid="brand-link"
          className="flex items-baseline gap-2 group min-w-0 shrink"
        >
          <span className="text-lg font-semibold tracking-tight">
            Root<span className="text-sol-green">Record</span>
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline truncate">
            / Solana Tools
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ReferralPill />
          <AccountSignInButton />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-foreground hover:text-foreground"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            aria-controls="site-nav-menu"
            data-testid="nav-menu-button"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" strokeWidth={2} />
          </Button>
          <div data-testid="wallet-button-wrap" className="rr-wallet-btn">
            <WalletMultiButton />
          </div>
        </div>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          id="site-nav-menu"
          className="max-w-md gap-0 border-border bg-ink-800 p-0 sm:max-w-md overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="p-6 pb-4 border-b border-border/80">
            <DialogTitle>Navigation</DialogTitle>
            <DialogDescription>Jump to a tool or page.</DialogDescription>
          </DialogHeader>
          <nav
            data-testid="primary-nav"
            className="flex max-h-[min(70vh,28rem)] flex-col overflow-y-auto py-2"
            aria-label="Site"
          >
            {nav.map((n) => {
              const active = linkIsActive(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'px-6 py-3.5 text-sm font-medium transition-colors hover:bg-white/5',
                    active ? 'text-foreground bg-white/5' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </DialogContent>
      </Dialog>
    </header>
  );
}
