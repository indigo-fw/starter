import 'server-only';

import { siteConfig } from '@/config/site';

/**
 * Returns the canonical app URL for use in server-side code (Route Handlers, robots.ts, etc.).
 *
 * Why not `siteConfig.url` / `NEXT_PUBLIC_APP_URL` directly?
 * Next.js bakes NEXT_PUBLIC_* vars into the bundle at build time. When running a
 * pre-built Docker image (e.g. the demo at demo.indigo-fw.dev), the build may not
 * have known the final domain, resulting in `localhost:3000` URLs in sitemaps and feeds.
 *
 * `BETTER_AUTH_URL` is a server-only runtime variable that is never inlined — it
 * always reflects the actual deployed domain from the container's .env.
 *
 * This function is `server-only` safe: never import it from client components.
 */
export function getServerAppUrl(): string {
  return process.env.BETTER_AUTH_URL ?? siteConfig.url;
}
