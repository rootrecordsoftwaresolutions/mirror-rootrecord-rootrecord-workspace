import Link from 'next/link';
import { Github } from 'lucide-react';
import { FooterMyActionsLink } from '@/components/FooterMyActionsLink';
import { JupiterWalletPromo } from '@/components/JupiterWalletPromo';

export function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-border mt-24"
    >
      <div className="container py-12 grid gap-10 md:grid-cols-3">
        <div>
          <div className="text-lg font-semibold">
            Root<span className="text-sol-green">Record</span>{' '}
            <span className="text-muted-foreground text-sm font-normal">
              / Solana Tools
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            On-chain tools that respect <em className="text-foreground/90">your SOL</em>,{' '}
            <em className="text-foreground/90">your time</em>, and{' '}
            <em className="text-foreground/90">your tokens</em>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Product
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/start" className="hover:text-sol-green">
                  Start here
                </Link>
              </li>
              <li>
                <Link href="/create" className="hover:text-sol-green">
                  Create Token
                </Link>
              </li>
              <li>
                <Link href="/liquidity" className="hover:text-sol-green">
                  Liquidity
                </Link>
              </li>
              <li>
                <Link href="/tools" className="hover:text-sol-green">
                  Tools
                </Link>
              </li>
              <li>
                <Link href="/contracts" className="hover:text-sol-green">
                  Contracts
                </Link>
              </li>
              <li>
                <Link href="/token-stats" className="hover:text-sol-green">
                  Token stats
                </Link>
              </li>
              <li>
                <Link href="/ecosystem" className="hover:text-sol-green">
                  Purpose
                </Link>
              </li>
              <li>
                <Link href="/bulk" className="hover:text-sol-green">
                  Bulk SOL
                </Link>
              </li>
              <li>
                <Link href="/wallet-generator" className="hover:text-sol-green">
                  Wallet generator
                </Link>
              </li>
              <FooterMyActionsLink />
              <li>
                <Link href="/pricing" className="hover:text-sol-green">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/docs" className="hover:text-sol-green">
                  Docs
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Legal
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="hover:text-sol-green">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-sol-green">
                  Terms
                </Link>
              </li>
              <li>
                <a
                  href="https://rootrecord.info"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-sol-green"
                >
                  rootrecord.info
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Open
          </div>
          <a
            href="https://github.com/RootRecord?tab=repositories"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-foreground hover:text-sol-green"
          >
            <Github className="h-4 w-4" /> GitHub
          </a>
          <p className="mt-6 text-xs text-muted-foreground">
            Made with respect for users. Not financial advice. Verify every
            transaction in your wallet before signing.
          </p>
        </div>
      </div>
      <div className="border-t border-border bg-ink-900/40">
        <div className="container py-6">
          <JupiterWalletPromo variant="compact" />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container py-5 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} RootRecord</span>
          <span>solana.rootrecord.info</span>
        </div>
      </div>
    </footer>
  );
}
