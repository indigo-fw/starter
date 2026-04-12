/**
 * Seed function: creates the __network__ admin site if it doesn't exist.
 * Registered in module.config.ts so it runs during `bun run init`.
 */

import { eq } from 'drizzle-orm';
import type { DbClient } from '@/server/db';
import { sites, SiteStatus } from '@/core-multisite/schema/sites';
import { schemaNameFromSlug } from '@/core-multisite/lib/schema-manager';

const NETWORK_SLUG = '__network__';

/** Check if network admin site already exists */
export async function hasNetworkAdmin(db: DbClient): Promise<boolean> {
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.slug, NETWORK_SLUG))
    .limit(1);
  return !!existing;
}

/** Create the network admin site */
export async function seedNetworkAdmin(db: DbClient): Promise<void> {
  const exists = await hasNetworkAdmin(db);
  if (exists) {
    console.log('Network admin site already exists, skipping.');
    return;
  }

  const schemaName = schemaNameFromSlug(NETWORK_SLUG);

  console.log('Creating network admin site...');

  const [site] = await db.insert(sites).values({
    name: 'Network Admin',
    slug: NETWORK_SLUG,
    schemaName,
    isNetworkAdmin: true,
    settings: {},
    status: SiteStatus.ACTIVE,
  }).returning();

  if (!site) throw new Error('Failed to create network admin site');

  // Create the schema + run migrations
  const { createSiteSchema } = await import('@/core-multisite/lib/schema-manager');
  await createSiteSchema(schemaName);

  console.log(`Network admin site created (id: ${site.id})`);
}
