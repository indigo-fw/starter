/**
 * Restore a soft-deleted site.
 * Usage: bun run site:restore <slug>
 */
import { restoreSite } from '@/core-multisite/lib/cli';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: bun run site:restore <slug>');
  process.exit(1);
}

restoreSite(slug)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
