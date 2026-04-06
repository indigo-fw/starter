import fs from 'fs';
import path from 'path';

/**
 * Server-only: auto-discovers routes by scanning the app directory.
 * Looks for standalone page.tsx files in route groups like (public), (auth).
 * Any page with its own page.tsx can have CMS SEO overrides.
 */

const APP_DIR = path.resolve(process.cwd(), 'src/app');

/** Route groups to scan for standalone pages */
const ROUTE_GROUPS = ['(public)', '(auth)'];

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function discoverRoutes(): { slug: string; label: string }[] {
  const routes: { slug: string; label: string }[] = [
    { slug: '', label: 'Homepage' },
  ];

  for (const group of ROUTE_GROUPS) {
    const dir = path.join(APP_DIR, group);
    if (!fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('[')) continue; // skip dynamic/catch-all

      const pagePath = path.join(dir, entry.name, 'page.tsx');
      if (!fs.existsSync(pagePath)) continue;

      routes.push({ slug: entry.name, label: titleCase(entry.name) });
    }
  }

  return routes;
}

/** Auto-discovered SEO override routes (cached at module load) */
export const SEO_OVERRIDE_ROUTES = discoverRoutes();

/** Set of slugs for quick membership checks */
export const SEO_OVERRIDE_SLUGS = new Set(SEO_OVERRIDE_ROUTES.map((r) => r.slug));
