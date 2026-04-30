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

const FAQ_MAIN_ENTITY = [
  {
    '@type': 'Question',
    name: 'Does RootRecord custody my tokens?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'No. You connect a self-custody wallet and sign transactions locally. RootRecord builds standard Solana instructions; keys stay in your wallet except optional features you explicitly enable.',
    },
  },
  {
    '@type': 'Question',
    name: 'Does this work on Solana devnet?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Yes. Set NEXT_PUBLIC_SOLANA_NETWORK=devnet and a devnet RPC URL in your environment. The same create and tool flows work on devnet for testing.',
    },
  },
  {
    '@type': 'Question',
    name: 'What is Token-2022 vs standard SPL?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Token-2022 is the SPL Token program extension model (transfer fees, hooks, metadata on-mint, etc.). RootRecord supports both legacy SPL with Metaplex metadata and Token-2022 mints from the create flow.',
    },
  },
  {
    '@type': 'Question',
    name: 'How much does it cost to create a token?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'RootRecord charges a small flat SOL platform fee per action (see Pricing), plus Solana network rent and transaction fees. There are no subscriptions.',
    },
  },
  {
    '@type': 'Question',
    name: 'Where is token image metadata stored?',
    acceptedAnswer: {
      '@type': 'Answer',
      text:
        'Optional logo and JSON metadata are pinned to IPFS via Pinata through server-side routes so your Pinata JWT is not exposed in the browser bundle.',
    },
  },
];

/**
 * Home-only: SoftwareApplication + FAQPage for rich results.
 */
export function HomeStructuredData() {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const logo = `${base}${SEO_OG_IMAGE_PATH}`;
  const walletGenUrl = `${base}/wallet-generator`;

  const faqMainEntity = [
    ...FAQ_MAIN_ENTITY,
    {
      '@type': 'Question',
      name: 'Does RootRecord have a Solana paper wallet generator?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Yes. Open ${walletGenUrl} for a printable tent-fold sheet with public-address and private-key QR codes, base58 text, and a short fingerprint ID. Keys are created in your browser only; the Print menu offers save ink, vivid, premium dark, and warm paper styles.`,
      },
    },
  ];

  const software = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'RootRecord Solana Tools',
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Per-action SOL fees for on-chain tools; see site pricing.',
    },
    description:
      'Create SPL and Token-2022 tokens, revoke authorities, update Metaplex metadata, manage Token-2022 transfer fees, Raydium CPMM liquidity, bulk SOL sends, and printable cold-storage paper wallets.',
    url: `${base}/`,
    image: logo,
    featureList: [
      'SPL token creation with Metaplex metadata',
      'Token-2022 mints with extensions',
      'Revoke mint and freeze authority',
      'Raydium CPMM pool and liquidity helpers',
      'Bulk SOL and token distributions',
      'Printable Solana paper wallet generator',
    ],
    provider: { '@type': 'Organization', name: 'RootRecord', url: base },
  };

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqMainEntity,
  };

  return (
    <>
      <JsonLd data={software} />
      <JsonLd data={faq} />
    </>
  );
}
