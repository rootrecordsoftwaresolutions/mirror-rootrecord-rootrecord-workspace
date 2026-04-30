import type { MetadataRoute } from 'next';

import { getPublicSiteOrigin } from '@/lib/siteOrigin';
import { SEO_STATIC_PATHS } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getPublicSiteOrigin().replace(/\/$/, '');
  const lastModified = new Date();

  return SEO_STATIC_PATHS.map((path) => {
    const url = path === '/' ? `${base}/` : `${base}${path}`;
    const priority =
      path === '/'
        ? 1
        : path === '/create' || path === '/tools'
          ? 0.95
          : path === '/wallet-generator'
            ? 0.93
            : path === '/contracts/vesting'
              ? 0.88
              : path === '/pricing' || path === '/docs' || path === '/start'
              ? 0.85
              : 0.75;
    const changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] =
      path === '/' || path === '/recent-tokens' ? 'weekly' : 'monthly';

    return { url, lastModified, changeFrequency, priority };
  });
}
