/**
 * Suspend a site.
 * Usage: bun run site:suspend <slug>
 */
import { suspendSite } from '@/core-multisite/lib/cli';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: bun run site:suspend <slug>');
  process.exit(1);
}

suspendSite(slug)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
