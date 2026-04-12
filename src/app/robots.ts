import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';
import { DASHBOARD_PREFIX } from '@/config/routes';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: [`${DASHBOARD_PREFIX}/`, '/api/webhooks/', '/api/health'],
      },
    ],
    sitemap: [
      `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
      `${env.NEXT_PUBLIC_APP_URL}/news-sitemap.xml`,
    ],
  };
}
