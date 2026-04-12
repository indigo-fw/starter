/**
 * PostgreSQL schema manager for multisite.
 * Creates/drops per-site schemas and runs migrations within them.
 *
 * Uses Drizzle's programmatic migrator with per-schema search_path.
 * Migration files live in `drizzle/` (same as single-site).
 */

import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'node:path';
import { db } from '@/server/db';
import { createLogger } from '@/core/lib/infra/logger';

const log = createLogger('multisite-schema');
const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

/** Create a new PostgreSQL schema for a site and run all migrations */
export async function createSiteSchema(schemaName: string): Promise<void> {
  validateSchemaName(schemaName);

  log.info(`Creating schema: ${schemaName}`);
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));

  await runMigrationsForSchema(schemaName);
  log.info(`Schema created and migrated: ${schemaName}`);
}

/** Drop a site's schema (irreversible) */
export async function dropSiteSchema(schemaName: string): Promise<void> {
  validateSchemaName(schemaName);

  log.warn(`Dropping schema: ${schemaName}`);
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`));
  log.info(`Schema dropped: ${schemaName}`);
}

/** Set the search_path for the current connection to scope queries to a site schema */
export async function setSiteSearchPath(schemaName: string): Promise<void> {
  await db.execute(sql.raw(`SET search_path TO "${schemaName}", public`));
}

/** Reset search_path to default (public only) */
export async function resetSearchPath(): Promise<void> {
  await db.execute(sql.raw(`SET search_path TO public`));
}

/**
 * Run all pending migrations for a specific schema.
 * Creates a dedicated connection with the target schema's search_path,
 * runs Drizzle's programmatic migrator, then closes the connection.
 */
async function runMigrationsForSchema(schemaName: string): Promise<void> {
  // Create a dedicated short-lived connection with the target search_path
  const migrationClient = postgres(process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {}, // suppress notices
  });

  try {
    // Set search_path so Drizzle creates tables in the site schema
    await migrationClient.unsafe(`SET search_path TO "${schemaName}", public`);

    const migrationDb = drizzle(migrationClient);
    await migrate(migrationDb, {
      migrationsFolder: MIGRATIONS_DIR,
      // Use a per-schema migration journal to track which migrations have been applied
      migrationsTable: `__drizzle_migrations`,
      migrationsSchema: schemaName,
    });

    log.info(`Migrations applied for schema: ${schemaName}`);
  } finally {
    await migrationClient.end();
  }
}

/** Run migrations for ALL site schemas (used by `bun run db:migrate:sites`) */
export async function migrateAllSiteSchemas(): Promise<void> {
  const { sites } = await import('@/core-multisite/schema/sites');

  const allSites = await db
    .select({ schemaName: sites.schemaName })
    .from(sites)
    .limit(10000);

  log.info(`Migrating ${allSites.length} site schemas...`);

  let succeeded = 0;
  let failed = 0;

  for (const site of allSites) {
    try {
      await runMigrationsForSchema(site.schemaName);
      succeeded++;
    } catch (err) {
      failed++;
      log.error(`Migration failed for ${site.schemaName}`, { error: String(err) });
    }
  }

  log.info(`Site migrations complete: ${succeeded} succeeded, ${failed} failed`);
}

/** Generate schema name from slug. Max 110 chars (column width). */
export function schemaNameFromSlug(slug: string): string {
  const name = `site_${slug.replace(/-/g, '_')}`;
  if (name.length > 110) {
    throw new Error(`Schema name too long (${name.length} chars, max 110). Use a shorter slug.`);
  }
  return name;
}

/** Validate schema name to prevent SQL injection */
function validateSchemaName(name: string): void {
  if (!/^site_[a-z0-9_]+$/.test(name)) {
    throw new Error(`Invalid schema name: ${name}`);
  }
}
