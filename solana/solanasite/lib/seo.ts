import type { Metadata } from 'next';

import { getPublicSiteOrigin } from '@/lib/siteOrigin';

/** Default OG / Twitter card image (under `public/`). */
export const SEO_OG_IMAGE_PATH = '/brand.jpg';

const SITE_NAME = 'RootRecord Solana Tools';

/** Shared keyword buckets for programmatic pages (keep phrases natural). */
export const SEO_KEYWORDS = {
  core: [
    'Solana',
    'SPL token',
    'Token-2022',
    'token creator',
    'Solana token creator',
    'Metaplex',
    'revoke mint authority',
    'Raydium',
    'paper wallet',
  ],
} as const;

function canonicalUrl(path: string): string {
  const origin = getPublicSiteOrigin().replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${p === '//' ? '/' : p}`;
}

/**
 * Consistent per-route metadata: canonical, Open Graph, Twitter, optional keywords.
 * Use a **short** `title` segment; root `layout` appends `| RootRecord Solana Tools`.
 */
export function pageSeo(opts: {
  path: string;
  title: string;
  description: string;
  keywords?: readonly string[];
  /** When true, omit from indexes (utility / auth-adjacent). */
  noindex?: boolean;
}): Metadata {
  const url = canonicalUrl(opts.path);
  const ogImage = SEO_OG_IMAGE_PATH;

  return {
    title: opts.title,
    description: opts.description,
    ...(opts.keywords?.length ? { keywords: [...opts.keywords] } : {}),
    alternates: { canonical: url },
    robots: opts.noindex
      ? { index: false, follow: true, googleBot: { index: false, follow: true } }
      : { index: true, follow: true, googleBot: { 'max-image-preview': 'large', 'max-snippet': -1 } },
    openGraph: {
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [{ url: ogImage, alt: SITE_NAME }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@rootrecord',
      creator: '@rootrecord',
      title: `${opts.title} | ${SITE_NAME}`,
      description: opts.description.slice(0, 200),
      images: [ogImage],
    },
  };
}

/** Static routes for sitemap (no dynamic `[mint]` enumeration). */
export const SEO_STATIC_PATHS: readonly string[] = [
  '/',
  '/start',
  '/create',
  '/liquidity',
  '/tools',
  '/contracts',
  '/contracts/vesting',
  '/recent-tokens',
  '/token-stats',
  '/ecosystem',
  '/bulk',
  '/my-actions',
  '/referrals',
  '/pricing',
  '/docs',
  '/privacy',
  '/terms',
  '/wallet-generator',
] as const;
