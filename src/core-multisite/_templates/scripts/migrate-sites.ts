#!/usr/bin/env bun
/**
 * Run migrations on all site schemas.
 * Usage: bun run db:migrate:sites
 */

import { migrateAllSiteSchemas } from '@/core-multisite/lib/schema-manager';

migrateAllSiteSchemas()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
