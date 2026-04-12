#!/usr/bin/env bun
/**
 * Create a new site.
 * Usage: bun run site:create <name> [--slug=my-store] [--locale=en]
 */

import { createSite } from '@/core-multisite/lib/cli';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));

if (!name) {
  console.error('Usage: bun run site:create <name> [--slug=my-store] [--locale=en]');
  process.exit(1);
}

const slug = args.find((a) => a.startsWith('--slug='))?.split('=')[1];
const locale = args.find((a) => a.startsWith('--locale='))?.split('=')[1];

createSite({ name, slug, defaultLocale: locale })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
