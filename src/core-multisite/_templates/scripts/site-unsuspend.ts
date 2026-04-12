/**
 * Unsuspend a site.
 * Usage: bun run site:unsuspend <slug>
 */
import { unsuspendSite } from '@/core-multisite/lib/cli';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: bun run site:unsuspend <slug>');
  process.exit(1);
}

unsuspendSite(slug)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
