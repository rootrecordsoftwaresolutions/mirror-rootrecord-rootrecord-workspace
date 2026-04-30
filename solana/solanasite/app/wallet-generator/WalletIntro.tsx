import Link from 'next/link';

import { Badge } from '@/components/ui/badge';

/**
 * Server-rendered intro for crawlers and users (JSON-LD speakable target).
 */
export function WalletIntro() {
  return (
    <section
      id="wallet-seo-intro"
      className="container max-w-2xl pt-8 pb-4 text-center md:text-left print:hidden"
    >
      <Badge className="mb-3">Paper wallet or text batch</Badge>
      <h1 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">
        Solana paper wallet generator
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
        Create <strong className="text-foreground">random Solana keypairs</strong> in your browser—no server upload.
        Use <strong className="text-foreground">Paper wallet</strong> for a tent-fold sheet with public and private QR
        codes (one keypair per print), or switch to <strong className="text-foreground">Text list</strong> to generate{' '}
        <strong className="text-foreground">1–100</strong> keypairs as a TSV table (copy, download, or print). Not
        BIP-39 / HD: each row is an independent Ed25519
        keypair. For paper, open the <strong className="text-foreground">Print</strong> menu for save ink, vivid,
        premium dark, or warm sepia.
      </p>
      <p className="mt-3 text-xs text-muted-foreground md:text-sm">
        Part of{' '}
        <Link href="/" className="text-sol-green underline-offset-4 hover:underline">
          RootRecord Solana Tools
        </Link>
        — see also <Link href="/create" className="text-sol-green underline-offset-4 hover:underline">Create token</Link>{' '}
        and <Link href="/docs" className="text-sol-green underline-offset-4 hover:underline">Docs</Link>.
      </p>
    </section>
  );
}
