import { getPublicSiteOrigin } from '@/lib/siteOrigin';

import { SEO_OG_IMAGE_PATH } from '@/lib/seo';

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- JSON-LD requires raw script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * Global structured data: Organization + WebSite (sitewide).
 */
export function SiteJsonLd() {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const logo = `${base}${SEO_OG_IMAGE_PATH}`;

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RootRecord',
    url: base,
    logo: { '@type': 'ImageObject', url: logo },
    sameAs: [
      'https://rootrecord.info',
      'https://github.com/RootRecord',
      'https://twitter.com/rootrecord',
    ],
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'RootRecord Solana Tools',
    url: base,
    description:
      'Low-fee Solana utilities to create SPL and Token-2022 tokens, manage authorities and metadata, Raydium liquidity, bulk sends, and printable paper wallets.',
    publisher: { '@type': 'Organization', name: 'RootRecord', url: base },
    inLanguage: 'en-US',
  };

  return (
    <>
      <JsonLd data={organization} />
      <JsonLd data={website} />
    </>
  );
}
