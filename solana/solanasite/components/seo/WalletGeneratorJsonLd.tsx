import { getPublicSiteOrigin } from '@/lib/siteOrigin';

import { SEO_OG_IMAGE_PATH } from '@/lib/seo';

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const FAQ = [
  {
    '@type': 'Question',
    name: 'Is this a BIP39 mnemonic or HD wallet generator?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'No. RootRecord generates a standard random Solana Ed25519 keypair in your browser and encodes the 64-byte secret as base58 (the same format Phantom and other wallets use for “import private key”). It is not a BIP-32 / BIP-39 hierarchical deterministic wallet.',
    },
  },
  {
    '@type': 'Question',
    name: 'Can I print a Solana paper wallet with public and private QR codes?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Yes. Each sheet includes a scannable QR for the public address (receive SOL and tokens) and a QR for the private key material, plus the keys printed as text for manual backup.',
    },
  },
  {
    '@type': 'Question',
    name: 'Is there a printer-friendly or ink-saving print mode?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Yes. Use the Print menu: Save ink for a light layout and outline Solana mark; Vivid for brand gradients; Premium dark for charcoal panels and high-contrast type; Warm paper for cream and sepia tones.',
    },
  },
  {
    '@type': 'Question',
    name: 'How is this different from batch Solana wallet creators?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'RootRecord focuses on one high-clarity tent-fold paper wallet per printout—designed for cold-storage gifting or vaulting—not bulk CSV export of dozens of addresses.',
    },
  },
  {
    '@type': 'Question',
    name: 'Where are keys generated?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Keys are created only in your browser tab using @solana/web3.js. Nothing is sent to RootRecord servers for the wallet generator unless you use unrelated features elsewhere on the site.',
    },
  },
];

export function WalletGeneratorJsonLd() {
  const origin = getPublicSiteOrigin().replace(/\/$/, '');
  const url = `${origin}/wallet-generator`;

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    name: 'Solana paper wallet generator',
    url,
    description:
      'Printable tent-fold Solana cold-storage sheet with public address QR, private key QR, and multiple print styles (save ink, vivid, premium dark, warm paper).',
    isPartOf: {
      '@type': 'WebSite',
      name: 'RootRecord Solana Tools',
      url: `${origin}/`,
    },
    about: {
      '@type': 'Thing',
      name: 'Solana wallet',
      description: 'Self-custody key material for the Solana blockchain.',
    },
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: `${origin}${SEO_OG_IMAGE_PATH}`,
    },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#wallet-seo-intro'],
    },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ,
  };

  return (
    <>
      <JsonLd data={webPage} />
      <JsonLd data={faq} />
    </>
  );
}
