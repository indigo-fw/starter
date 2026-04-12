/**
 * CLI commands for multisite management.
 *
 * Usage:
 *   bun run site:create <name> [--slug=my-store] [--locale=en]
 *   bun run site:delete <slug> [--hard]
 *   bun run site:suspend <slug>
 *   bun run site:unsuspend <slug>
 *   bun run site:restore <slug>
 *   bun run site:list
 */

import { DEFAULT_LOCALE, LOCALES } from '@/lib/constants';
import { db } from '@/server/db';
import { sites, siteDomains, siteMembers, SiteStatus } from '@/core-multisite/schema/sites';
import { createSiteSchema, dropSiteSchema, schemaNameFromSlug } from './schema-manager';
import { slugify } from '@/core/lib/content/slug';
import { eq, isNull } from 'drizzle-orm';

export async function createSite(options: {
  name: string;
  slug?: string;
  defaultLocale?: string;
  locales?: string[];
  baseDomain?: string;
}): Promise<{ id: string; slug: string; url: string }> {
  const slug = options.slug ? slugify(options.slug) : slugify(options.name);
  const schemaName = schemaNameFromSlug(slug);
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  const locales = options.locales ?? [defaultLocale];
  const baseDomain = options.baseDomain ?? process.env.MULTISITE_BASE_DOMAIN ?? 'localhost';

  // Validate locales
  for (const locale of locales) {
    if (!(LOCALES as readonly string[]).includes(locale)) {
      throw new Error(`Invalid locale "${locale}". Must be one of: ${LOCALES.join(', ')}`);
    }
  }

  // Check uniqueness
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1);

  if (existing) {
    throw new Error(`Site slug "${slug}" already exists`);
  }

  console.log(`Creating site: ${options.name} (${slug})`);

  // Create site record
  const [site] = await db.insert(sites).values({
    name: options.name,
    slug,
    schemaName,
    defaultLocale,
    locales,
    settings: {},
    status: SiteStatus.ACTIVE,
  }).returning();

  if (!site) throw new Error('Failed to create site record');

  // Create PostgreSQL schema + run migrations
  console.log(`Creating schema: ${schemaName}`);
  await createSiteSchema(schemaName);

  // Create temporary subdomain
  const tempDomain = `${slug}.${baseDomain}`;
  await db.insert(siteDomains).values({
    siteId: site.id,
    domain: tempDomain,
    isPrimary: true,
    verified: true, // Temporary subdomains are auto-verified
    verifiedAt: new Date(),
  });

  const url = `https://${tempDomain}`;
  console.log(`Site created: ${url}`);
  console.log(`Dashboard: ${url}/dashboard`);

  return { id: site.id, slug, url };
}

export async function deleteSite(slug: string, hard = false): Promise<void> {
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1);

  if (!site) {
    throw new Error(`Site "${slug}" not found`);
  }

  if (hard) {
    if (site.status !== SiteStatus.DELETED) {
      throw new Error('Site must be soft-deleted before hard delete. Run without --hard first.');
    }

    console.log(`Hard-deleting site: ${slug} (dropping schema ${site.schemaName})`);
    await dropSiteSchema(site.schemaName);
    await db.delete(siteDomains).where(eq(siteDomains.siteId, site.id));
    await db.delete(siteMembers).where(eq(siteMembers.siteId, site.id));
    await db.delete(sites).where(eq(sites.id, site.id));
    console.log('Site permanently deleted.');
  } else {
    console.log(`Soft-deleting site: ${slug}`);
    await db
      .update(sites)
      .set({ status: SiteStatus.DELETED, deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(sites.id, site.id));
    console.log('Site disabled. Run with --hard to permanently delete.');
  }
}

export async function suspendSite(slug: string): Promise<void> {
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1);

  if (!site) throw new Error(`Site "${slug}" not found`);
  if (site.status !== SiteStatus.ACTIVE) throw new Error(`Site "${slug}" is not active (status: ${site.status})`);

  await db
    .update(sites)
    .set({ status: SiteStatus.SUSPENDED, updatedAt: new Date() })
    .where(eq(sites.id, site.id));

  console.log(`Site "${slug}" suspended. Visitors will no longer be able to access it.`);
}

export async function unsuspendSite(slug: string): Promise<void> {
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1);

  if (!site) throw new Error(`Site "${slug}" not found`);
  if (site.status !== SiteStatus.SUSPENDED) throw new Error(`Site "${slug}" is not suspended (status: ${site.status})`);

  await db
    .update(sites)
    .set({ status: SiteStatus.ACTIVE, updatedAt: new Date() })
    .where(eq(sites.id, site.id));

  console.log(`Site "${slug}" is now active again.`);
}

export async function restoreSite(slug: string): Promise<void> {
  const [site] = await db
    .select()
    .from(sites)
    .where(eq(sites.slug, slug))
    .limit(1);

  if (!site) throw new Error(`Site "${slug}" not found`);
  if (site.status !== SiteStatus.DELETED) throw new Error(`Site "${slug}" is not deleted (status: ${site.status})`);

  await db
    .update(sites)
    .set({ status: SiteStatus.ACTIVE, deletedAt: null, updatedAt: new Date() })
    .where(eq(sites.id, site.id));

  console.log(`Site "${slug}" restored and active.`);
}

export async function listSites(): Promise<void> {
  const allSites = await db
    .select({
      name: sites.name,
      slug: sites.slug,
      status: sites.status,
      defaultLocale: sites.defaultLocale,
      createdAt: sites.createdAt,
    })
    .from(sites)
    .where(isNull(sites.deletedAt))
    .limit(500);

  if (allSites.length === 0) {
    console.log('No sites found.');
    return;
  }

  const statusLabel = (s: number) =>
    s === SiteStatus.ACTIVE ? 'active' : s === SiteStatus.SUSPENDED ? 'suspended' : 'deleted';

  console.log(`\n${'Slug'.padEnd(25)} ${'Name'.padEnd(30)} ${'Status'.padEnd(12)} ${'Locale'.padEnd(8)} Created`);
  console.log('-'.repeat(95));

  for (const site of allSites) {
    console.log(
      `${site.slug.padEnd(25)} ${site.name.padEnd(30)} ${statusLabel(site.status).padEnd(12)} ${site.defaultLocale.padEnd(8)} ${site.createdAt.toISOString().split('T')[0]}`
    );
  }

  console.log(`\n${allSites.length} site(s) total.`);
}
