import type { MetadataRoute } from 'next';

import { getPublicSiteOrigin } from '@/lib/siteOrigin';

export default function robots(): MetadataRoute.Robots {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const host = new URL(base).host;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_next/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host,
  };
}
