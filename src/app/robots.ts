import type { MetadataRoute } from 'next';

import { env } from '@/lib/env';
import { getServerAppUrl } from '@/lib/app-url';
import { DASHBOARD_PREFIX } from '@/config/routes';

/**
 * Dynamic robots.txt — branches by `INDIGO_ROBOTS_PROFILE`:
 *
 * - `production` (default) — surgical: hide dashboard + sensitive API endpoints.
 *     For an installed app on its own domain. Marketing + content fully indexable.
 * - `demo`                  — selective: index `/` and `/docs/`, hide every app
 *     surface (signup, login, dashboard, all `/api/`, preview tokens). For the
 *     public demo instance, where seeded content resets hourly and most app
 *     pages are noise to search engines.
 * - `preview`               — blanket Disallow: /. For staging / preview deploys.
 *
 * NEVER ship a static `public/robots.txt` — files in `public/` shadow routes
 * at the same URL, which would apply the static policy to every deploy of this
 * image regardless of profile.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getServerAppUrl();
  const sitemap = [`${base}/sitemap.xml`, `${base}/news-sitemap.xml`];

  if (env.INDIGO_ROBOTS_PROFILE === 'preview') {
    return { rules: [{ userAgent: '*', disallow: '/' }], sitemap };
  }

  if (env.INDIGO_ROBOTS_PROFILE === 'demo') {
    return {
      rules: [{
        userAgent: '*',
        allow: ['/', '/docs/'],
        disallow: [
          `${DASHBOARD_PREFIX}/`,
          '/api/',
          '/signup',
          '/login',
          '/preview/',
          '/*?token=*',
          '/*?previewToken=*',
        ],
      }],
      sitemap,
    };
  }

  // production
  return {
    rules: [{
      userAgent: '*',
      disallow: [`${DASHBOARD_PREFIX}/`, '/api/webhooks/', '/api/health'],
    }],
    sitemap,
  };
}
