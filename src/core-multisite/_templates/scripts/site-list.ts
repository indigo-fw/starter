#!/usr/bin/env bun
/**
 * List all sites.
 * Usage: bun run site:list
 */

import { listSites } from '@/core-multisite/lib/cli';

listSites()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
