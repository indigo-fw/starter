#!/usr/bin/env bun
/**
 * Delete a site.
 * Usage: bun run site:delete <slug> [--hard]
 */

import { deleteSite } from '@/core-multisite/lib/cli';

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const hard = args.includes('--hard');

if (!slug) {
  console.error('Usage: bun run site:delete <slug> [--hard]');
  process.exit(1);
}

deleteSite(slug, hard)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
