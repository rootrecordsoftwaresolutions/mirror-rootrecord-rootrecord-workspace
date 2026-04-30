import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { pageSeo, SEO_KEYWORDS } from '@/lib/seo';

export const metadata: Metadata = pageSeo({
  path: '/docs',
  title: 'Documentation',
  description:
    'How to connect a wallet, create SPL or Token-2022 tokens, use Token-2022 extensions, Pinata IPFS metadata, Raydium liquidity tools, referrals, and fee configuration on RootRecord Solana Tools.',
  keywords: [
    ...SEO_KEYWORDS.core,
    'Solana tools documentation',
    'wallet adapter',
    'devnet',
    'Solana paper wallet',
    'wallet generator',
  ],
});

const JUPITER_SITE = 'https://jup.ag/';
const JUPITER_EXTENSION =
  'https://chromewebstore.google.com/detail/jupiter-wallet/iledlaeogohbilgbfhmbgkgmpplbfboh';

const SECTIONS: { n: string; title: string; body: ReactNode }[] = [
  {
    n: '01',
    title: 'Connecting your wallet',
    body: (
      <>
        <p>
          Brand new? Read the short guided walkthrough on{' '}
          <Link href="/start" className="text-sol-green hover:underline">
            Start here
          </Link>{' '}
          first, then come back for detail.
        </p>
        <p className="mt-3">
          Use <strong className="text-foreground">Select Wallet</strong> in the top
          right, then pick your Solana wallet and approve the connection. We never ask for
          your seed phrase or recovery words—only normal sign-in prompts.
        </p>
        <p className="mt-3">
          <strong className="text-foreground">Wallet we recommend:</strong>{' '}
          <a
            href={JUPITER_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sol-green hover:underline underline-offset-4"
          >
            Jupiter Wallet
          </a>{' '}
          —{' '}
          <a
            href={JUPITER_EXTENSION}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sol-green hover:underline underline-offset-4"
          >
            Chrome extension
          </a>
          , or visit{' '}
          <a
            href={JUPITER_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sol-green hover:underline underline-offset-4"
          >
            jup.ag
          </a>
          .
        </p>
      </>
    ),
  },
  {
    n: '02',
    title: 'Creating a token',
    body: (
      <p>
        Open <Link href="/create" className="text-sol-green hover:underline">Create</Link>
        , fill in name, symbol, image, and description, then connect your wallet and
        confirm. We charge <strong className="text-foreground">0.025 SOL</strong> for the
        launch; Solana adds a small network fee. Your supply is sent to the wallet you
        connect.
      </p>
    ),
  },
  {
    n: '03',
    title: 'Locking your token after launch',
    body: (
      <p>
        Most creators use <strong className="text-foreground">Tools</strong> to{' '}
        <strong className="text-foreground">revoke mint</strong> (so the total supply can
        never increase) and <strong className="text-foreground">revoke freeze</strong>{' '}
        (so holder balances can&apos;t be frozen). Each step costs{' '}
        <strong className="text-foreground">0.01 SOL</strong> through us, plus the usual
        network fee.
      </p>
    ),
  },
  {
    n: '04',
    title: 'Minting more or updating your listing',
    body: (
      <p>
        If you still control minting, you can add more supply. If your token allows edits,
        you can change name, symbol, or the link to your image and details. Each action is
        a separate confirmation in your wallet—use{' '}
        <Link href="/tools" className="text-sol-green hover:underline">
          Tools
        </Link>
        .
      </p>
    ),
  },
  {
    n: '05',
    title: 'Advanced token options',
    body: (
      <p>
        On <Link href="/create" className="text-sol-green hover:underline">Create</Link>{' '}
        you can switch on <strong className="text-foreground">advanced mode</strong> for
        special cases—like taking a small cut on every transfer, or making tokens
        non-transferable. The form explains each choice. Skip this unless you already
        know you need it; most people use the default path.
      </p>
    ),
  },
  {
    n: '06',
    title: 'If your token charges trading fees',
    body: (
      <p>
        Only applies if you turned on fee-on-transfer style settings in advanced mode.
        Over time, fees can sit in different places;{' '}
        <Link href="/tools" className="text-sol-green hover:underline">
          Tools
        </Link>{' '}
        walks you through gathering them, then moving them into a wallet you control.
        Follow the order shown on the page.
      </p>
    ),
  },
  {
    n: '07',
    title: 'Referral links',
    body: (
      <p>
        Open the{' '}
        <Link href="/referrals" className="text-sol-green hover:underline">
          Referrals
        </Link>{' '}
        page after connecting your wallet to copy ready-made links. In general, add{' '}
        <strong className="text-foreground font-mono text-xs">?ref=</strong> and your
        wallet address to any URL you share (for example{' '}
        <span className="font-mono text-xs break-all">
          solana.rootrecord.info/create?ref=YourWalletHere
        </span>
        ). Their browser saves that wallet as the referrer. When they pay any RootRecord
        platform fee with a valid referrer (not the same wallet as the payer), a fixed
        percentage of that fee is transferred to the referrer in the{' '}
        <strong className="text-foreground">same signed transaction</strong> — the rest
        goes to RootRecord&apos;s fee wallet. The default share is 10% (configurable via{' '}
        <span className="font-mono text-xs">NEXT_PUBLIC_REFERRAL_SHARE_BPS</span>, basis
        points out of 10,000). A small memo may still be written for explorers. Action
        logs can include the referrer address for your records.{' '}
        <strong className="text-foreground">Treasury OTC payments</strong> (SOL or USDC
        to the ecosystem deposit treasury on the Purpose page) never pay a referral share;
        the full quoted amount goes to the treasury only.
      </p>
    ),
  },
  {
    n: '08',
    title: 'Burning tokens',
    body: (
      <p>
        To permanently remove tokens from <strong className="text-foreground">your</strong>{' '}
        balance for a mint and shrink how many exist, open{' '}
        <Link href="/tools?action=burn" className="text-sol-green hover:underline">
          Tools → Burn tokens
        </Link>
        . Enter the mint address, how much to destroy, and decimals (same numbers you used
        at launch). We don&apos;t charge a RootRecord fee for burns—you only pay
        Solana&apos;s small network fee.
      </p>
    ),
  },
  {
    n: '09',
    title: 'Printable paper wallet (cold storage)',
    body: (
      <p>
        The{' '}
        <Link href="/wallet-generator" className="text-sol-green hover:underline">
          Wallet generator
        </Link>{' '}
        creates a random Solana keypair in your browser and lays out a tent-fold printable
        sheet: receive address and private key as QR codes plus base58 text. It is{' '}
        <strong className="text-foreground">not</strong> a BIP-39 mnemonic or batch HD
        wallet tool—one keypair per print, designed for gifting or vaulting. Use{' '}
        the <strong className="text-foreground">Print</strong> menu (<strong className="text-foreground">Save ink</strong>,{' '}
        <strong className="text-foreground">Vivid</strong>, <strong className="text-foreground">Premium dark</strong>, or{' '}
        <strong className="text-foreground">Warm paper</strong>);
        nothing is uploaded to RootRecord for key generation.
      </p>
    ),
  },
];

export default function DocsPage() {
  return (
    <div className="container py-14 md:py-20">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
          Docs
        </div>
        <h1 className="font-display text-4xl md:text-6xl tracking-tight">
          How RootRecord works, in <em className="italic text-sol-green">plain language</em>.
        </h1>
        <p className="mt-4 text-muted-foreground">
          What you need to launch, manage, and clean up tokens—without the noise.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.n}>
            <CardHeader>
              <span className="text-xs font-mono text-sol-green/80 tracking-widest">
                {s.n} /
              </span>
              <CardTitle className="mt-3">{s.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              {typeof s.body === 'string' ? <p>{s.body}</p> : s.body}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 text-sm text-muted-foreground">
        More questions? Visit{' '}
        <a
          href="https://rootrecord.info"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sol-green hover:underline"
        >
          rootrecord.info
        </a>
        .
      </div>
    </div>
  );
}
