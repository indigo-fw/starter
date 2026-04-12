import { TRPCError } from '@trpc/server';
import { and, eq, isNull, desc, sql, count } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import { createLogger } from '@/core/lib/infra/logger';
import { logAudit } from '@/core/lib/infra/audit';
import { dispatchWebhook } from '@/core/lib/webhooks/webhooks';
import { createTRPCRouter, superadminProcedure, staffProcedure } from '@/server/trpc';
import { sites, siteDomains, siteMembers, SiteStatus, MAX_DOMAINS_PER_SITE } from '@/core-multisite/schema/sites';
import { schemaNameFromSlug } from '@/core-multisite/lib/schema-manager';
import { invalidateSiteCache, clearSiteCache } from '@/core-multisite/lib/site-resolver';
import { invalidateSiteConfig } from '@/core-multisite/lib/site-config';
import { slugify } from '@/core/lib/content/slug';

const log = createLogger('multisite-router');

const localeSchema = z.string().min(2).max(5).refine(
  (val) => (LOCALES as readonly string[]).includes(val),
  { message: 'Invalid locale. Must be one of: ' + LOCALES.join(', ') }
);

export const sitesRouter = createTRPCRouter({
  // ── List sites (staff sees their own, superadmin sees all) ────────────────

  list: staffProcedure.query(async ({ ctx }) => {
    const isSuperadmin = (ctx.session.user as { role?: string }).role === 'superadmin';

    if (isSuperadmin) {
      return ctx.db
        .select({
          id: sites.id,
          name: sites.name,
          slug: sites.slug,
          status: sites.status,
          isNetworkAdmin: sites.isNetworkAdmin,
          createdAt: sites.createdAt,
        })
        .from(sites)
        .where(isNull(sites.deletedAt))
        .orderBy(desc(sites.createdAt))
        .limit(500);
    }

    // Staff: only sites they're a member of
    return ctx.db
      .select({
        id: sites.id,
        name: sites.name,
        slug: sites.slug,
        status: sites.status,
        isNetworkAdmin: sites.isNetworkAdmin,
        createdAt: sites.createdAt,
      })
      .from(sites)
      .innerJoin(siteMembers, eq(siteMembers.siteId, sites.id))
      .where(and(eq(siteMembers.userId, ctx.session.user.id), isNull(sites.deletedAt)))
      .orderBy(desc(sites.createdAt))
      .limit(500);
  }),

  // ── Get site by ID ────────────────────────────────────────────────────────

  getById: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.id), isNull(sites.deletedAt)))
        .limit(1);

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });

      const domains = await ctx.db
        .select()
        .from(siteDomains)
        .where(eq(siteDomains.siteId, site.id))
        .limit(50);

      const members = await ctx.db
        .select({
          userId: siteMembers.userId,
          role: siteMembers.role,
          createdAt: siteMembers.createdAt,
        })
        .from(siteMembers)
        .where(eq(siteMembers.siteId, site.id))
        .limit(200);

      return { ...site, domains, members };
    }),

  // ── Site stats (for network admin dashboard) ─────────────────────────────

  stats: superadminProcedure.query(async ({ ctx }) => {
    // Single query with conditional aggregation instead of 5 sequential COUNTs
    const [row] = await ctx.db.execute(sql`
      SELECT
        (SELECT count(*) FROM sites WHERE deleted_at IS NULL AND status = ${SiteStatus.ACTIVE})::int AS "activeSites",
        (SELECT count(*) FROM sites WHERE deleted_at IS NULL AND status = ${SiteStatus.SUSPENDED})::int AS "suspendedSites",
        (SELECT count(*) FROM site_domains)::int AS "totalDomains",
        (SELECT count(*) FROM site_domains WHERE verified = true)::int AS "verifiedDomains",
        (SELECT count(*) FROM site_members)::int AS "totalMembers"
    `) as unknown as [{ activeSites: number; suspendedSites: number; totalDomains: number; verifiedDomains: number; totalMembers: number }];

    return {
      activeSites: row?.activeSites ?? 0,
      suspendedSites: row?.suspendedSites ?? 0,
      totalDomains: row?.totalDomains ?? 0,
      verifiedDomains: row?.verifiedDomains ?? 0,
      totalMembers: row?.totalMembers ?? 0,
    };
  }),

  // ── Create site ───────────────────────────────────────────────────────────

  create: superadminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100).optional(),
        defaultLocale: localeSchema.default(DEFAULT_LOCALE),
        locales: z.array(localeSchema).min(1).max(50).default([DEFAULT_LOCALE]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug ? slugify(input.slug) : slugify(input.name);
      const schemaName = schemaNameFromSlug(slug);

      // Insert site — unique index catches concurrent duplicates
      let site;
      try {
        const [row] = await ctx.db.insert(sites).values({
          name: input.name,
          slug,
          schemaName,
          defaultLocale: input.defaultLocale,
          locales: input.locales,
          settings: {},
          status: SiteStatus.ACTIVE,
        }).returning();
        site = row;
      } catch (err) {
        const msg = String(err);
        if (msg.includes('unique') || msg.includes('23505')) {
          throw new TRPCError({ code: 'CONFLICT', message: `Site slug "${slug}" already exists` });
        }
        throw err;
      }

      if (!site) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create site' });

      // Create PostgreSQL schema + run migrations
      try {
        const { createSiteSchema } = await import('@/core-multisite/lib/schema-manager');
        await createSiteSchema(schemaName);
      } catch (err) {
        // Full cleanup: site record + any related rows + broken schema
        log.error('Schema creation failed, rolling back', { slug, error: String(err) });
        try {
          const { dropSiteSchema } = await import('@/core-multisite/lib/schema-manager');
          await dropSiteSchema(schemaName).catch(() => {});
          await ctx.db.delete(siteMembers).where(eq(siteMembers.siteId, site.id));
          await ctx.db.delete(siteDomains).where(eq(siteDomains.siteId, site.id));
          await ctx.db.delete(sites).where(eq(sites.id, site.id));
        } catch (cleanupErr) {
          log.error('Cleanup after failed schema creation also failed', { slug, error: String(cleanupErr) });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create site schema' });
      }

      // Add creator as site admin
      await ctx.db.insert(siteMembers).values({
        siteId: site.id,
        userId: ctx.session.user.id,
        role: 'admin',
      });

      log.info('Site created', { siteId: site.id, slug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.created', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.created', { siteId: site.id, slug, name: site.name });
      return site;
    }),

  // ── Update site settings ──────────────────────────────────────────────────

  update: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        defaultLocale: localeSchema.optional(),
        locales: z.array(localeSchema).min(1).max(50).optional(),
        settings: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [site] = await ctx.db
        .update(sites)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
        .returning();

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });

      invalidateSiteCache(undefined, site.slug);
      invalidateSiteConfig(site.id);
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.updated', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.updated', { siteId: site.id, slug: site.slug, name: site.name });
      return site;
    }),

  // ── Suspend site ─────────────────────────────────────────────────────────

  suspend: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .update(sites)
        .set({ status: SiteStatus.SUSPENDED, updatedAt: new Date() })
        .where(and(eq(sites.id, input.id), eq(sites.status, SiteStatus.ACTIVE), isNull(sites.deletedAt)))
        .returning();

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active site not found' });

      invalidateSiteCache(undefined, site.slug);
      clearSiteCache();
      log.info('Site suspended', { siteId: site.id, slug: site.slug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.suspended', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.suspended', { siteId: site.id, slug: site.slug });
      return { success: true };
    }),

  // ── Unsuspend site ───────────────────────────────────────────────────────

  unsuspend: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .update(sites)
        .set({ status: SiteStatus.ACTIVE, updatedAt: new Date() })
        .where(and(eq(sites.id, input.id), eq(sites.status, SiteStatus.SUSPENDED), isNull(sites.deletedAt)))
        .returning();

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Suspended site not found' });

      invalidateSiteCache(undefined, site.slug);
      clearSiteCache();
      log.info('Site unsuspended', { siteId: site.id, slug: site.slug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.unsuspended', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.unsuspended', { siteId: site.id, slug: site.slug });
      return { success: true };
    }),

  // ── Soft-delete site ──────────────────────────────────────────────────────

  softDelete: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .update(sites)
        .set({ status: SiteStatus.DELETED, deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(sites.id, input.id), isNull(sites.deletedAt)))
        .returning();

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' });

      invalidateSiteCache(undefined, site.slug);
      clearSiteCache();
      log.info('Site soft-deleted', { siteId: site.id, slug: site.slug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.deleted', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.deleted', { siteId: site.id, slug: site.slug });
      return { success: true };
    }),

  // ── Restore soft-deleted site ─────────────────────────────────────────────

  restore: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .update(sites)
        .set({ status: SiteStatus.ACTIVE, deletedAt: null, updatedAt: new Date() })
        .where(and(eq(sites.id, input.id), eq(sites.status, SiteStatus.DELETED)))
        .returning();

      if (!site) throw new TRPCError({ code: 'NOT_FOUND', message: 'Deleted site not found' });

      invalidateSiteCache(undefined, site.slug);
      clearSiteCache();
      log.info('Site restored', { siteId: site.id, slug: site.slug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.restored', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.restored', { siteId: site.id, slug: site.slug });
      return { success: true };
    }),

  // ── Hard-delete site (drops schema!) ──────────────────────────────────────

  hardDelete: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [site] = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.id), eq(sites.status, SiteStatus.DELETED)))
        .limit(1);

      if (!site) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found or not soft-deleted yet' });
      }

      // Drop the PostgreSQL schema
      const { dropSiteSchema } = await import('@/core-multisite/lib/schema-manager');
      await dropSiteSchema(site.schemaName);

      // Delete all related records
      await ctx.db.delete(siteDomains).where(eq(siteDomains.siteId, site.id));
      await ctx.db.delete(siteMembers).where(eq(siteMembers.siteId, site.id));
      await ctx.db.delete(sites).where(eq(sites.id, site.id));

      invalidateSiteCache(undefined, site.slug);
      clearSiteCache();
      log.warn('Site hard-deleted', { siteId: site.id, slug: site.slug, schema: site.schemaName });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.hard_deleted', entityType: 'site', entityId: site.id, entityTitle: site.name });
      dispatchWebhook(ctx.db, 'site.hard_deleted', { siteId: site.id, slug: site.slug });
      return { success: true };
    }),

  // ── Clone site ────────────────────────────────────────────────────────────

  clone: superadminProcedure
    .input(
      z.object({
        sourceSiteId: z.string().uuid(),
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Load source site
      const [source] = await ctx.db
        .select()
        .from(sites)
        .where(and(eq(sites.id, input.sourceSiteId), isNull(sites.deletedAt)))
        .limit(1);

      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source site not found' });

      const newSlug = input.slug ? slugify(input.slug) : slugify(input.name);
      const newSchemaName = schemaNameFromSlug(newSlug);

      // Create new site record with source settings
      let newSite;
      try {
        const [row] = await ctx.db.insert(sites).values({
          name: input.name,
          slug: newSlug,
          schemaName: newSchemaName,
          defaultLocale: source.defaultLocale,
          locales: source.locales,
          settings: source.settings,
          status: SiteStatus.ACTIVE,
        }).returning();
        newSite = row;
      } catch (err) {
        const msg = String(err);
        if (msg.includes('unique') || msg.includes('23505')) {
          throw new TRPCError({ code: 'CONFLICT', message: `Site slug "${newSlug}" already exists` });
        }
        throw err;
      }

      if (!newSite) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create site' });

      // Create new schema
      try {
        const { createSiteSchema } = await import('@/core-multisite/lib/schema-manager');
        await createSiteSchema(newSchemaName);
      } catch (err) {
        log.error('Schema creation failed during clone, rolling back', { slug: newSlug, error: String(err) });
        try {
          const { dropSiteSchema } = await import('@/core-multisite/lib/schema-manager');
          await dropSiteSchema(newSchemaName).catch(() => {});
          await ctx.db.delete(sites).where(eq(sites.id, newSite.id));
        } catch (cleanupErr) {
          log.error('Cleanup after failed clone also failed', { slug: newSlug, error: String(cleanupErr) });
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create cloned schema' });
      }

      // Copy all user tables from source schema to new schema.
      // Uses a dedicated short-lived connection to avoid SET CONSTRAINTS
      // leaking to other concurrent requests sharing the pool connection.
      try {
        const { default: postgres } = await import('postgres');
        const { drizzle } = await import('drizzle-orm/postgres-js');
        const cloneClient = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
        const cloneDb = drizzle(cloneClient);

        try {
          const tablesResult = await cloneDb.execute(
            sql.raw(`SELECT tablename FROM pg_tables WHERE schemaname = '${source.schemaName}' AND tablename NOT LIKE '__drizzle%'`)
          );
          const tables = (tablesResult as unknown as { tablename: string }[]).map((r) => r.tablename);

          if (tables.length > 0) {
            await cloneDb.execute(sql.raw(`SET CONSTRAINTS ALL DEFERRED`));
            let copied = 0;
            for (const table of tables) {
              try {
                await cloneDb.execute(
                  sql.raw(`INSERT INTO "${newSchemaName}"."${table}" SELECT * FROM "${source.schemaName}"."${table}"`)
                );
                copied++;
              } catch (err) {
                log.warn(`Failed to copy table ${table} during clone`, { source: source.slug, target: newSlug, error: String(err) });
              }
            }
            await cloneDb.execute(sql.raw(`SET CONSTRAINTS ALL IMMEDIATE`));
            log.info(`Cloned ${copied}/${tables.length} tables`, { source: source.slug, target: newSlug });
          }
        } finally {
          await cloneClient.end();
        }
      } catch (err) {
        log.warn('Content copy failed during clone', { source: source.slug, target: newSlug, error: String(err) });
      }

      // Add creator as site admin
      await ctx.db.insert(siteMembers).values({
        siteId: newSite.id,
        userId: ctx.session.user.id,
        role: 'admin',
      });

      log.info('Site cloned', { sourceId: source.id, newSiteId: newSite.id, slug: newSlug });
      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'site.cloned', entityType: 'site', entityId: newSite.id, entityTitle: newSite.name, metadata: { sourceId: source.id, sourceSlug: source.slug } });
      dispatchWebhook(ctx.db, 'site.created', { siteId: newSite.id, slug: newSlug, name: newSite.name, clonedFrom: source.id });
      return newSite;
    }),

  // ── Domain management ─────────────────────────────────────────────────────

  addDomain: superadminProcedure
    .input(
      z.object({
        siteId: z.string().uuid(),
        domain: z.string().min(3).max(255).transform((d) => d.toLowerCase().trim()),
        isPrimary: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit: max domains per site
      const [domainCountResult] = await ctx.db
        .select({ value: count() })
        .from(siteDomains)
        .where(eq(siteDomains.siteId, input.siteId));

      if ((domainCountResult?.value ?? 0) >= MAX_DOMAINS_PER_SITE) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Maximum ${MAX_DOMAINS_PER_SITE} domains per site` });
      }

      // Check domain uniqueness
      const [existing] = await ctx.db
        .select({ id: siteDomains.id })
        .from(siteDomains)
        .where(eq(siteDomains.domain, input.domain))
        .limit(1);

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: `Domain "${input.domain}" is already registered` });
      }

      const verificationToken = crypto.randomBytes(32).toString('hex');

      // If setting as primary, unset other primaries
      if (input.isPrimary) {
        await ctx.db
          .update(siteDomains)
          .set({ isPrimary: false })
          .where(eq(siteDomains.siteId, input.siteId));
      }

      const [domain] = await ctx.db.insert(siteDomains).values({
        siteId: input.siteId,
        domain: input.domain,
        isPrimary: input.isPrimary,
        verified: false,
        verificationToken,
      }).returning();

      if (!domain) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to add domain' });

      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'domain.added', entityType: 'site_domain', entityId: domain.id, entityTitle: input.domain, metadata: { siteId: input.siteId } });

      return {
        ...domain,
        verificationInstruction: `Add a TXT record to your DNS: indigo-verify=${verificationToken}`,
      };
    }),

  removeDomain: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [domain] = await ctx.db
        .select({ id: siteDomains.id, domain: siteDomains.domain, siteId: siteDomains.siteId })
        .from(siteDomains)
        .where(eq(siteDomains.id, input.id))
        .limit(1);

      await ctx.db.delete(siteDomains).where(eq(siteDomains.id, input.id));

      if (domain) {
        invalidateSiteCache(domain.domain);
        logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'domain.removed', entityType: 'site_domain', entityId: domain.id, entityTitle: domain.domain, metadata: { siteId: domain.siteId } });
      }

      return { success: true };
    }),

  listDomains: superadminProcedure
    .input(z.object({ siteId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(siteDomains)
        .where(eq(siteDomains.siteId, input.siteId))
        .limit(50);
    }),

  // ── Member management ─────────────────────────────────────────────────────

  addMember: superadminProcedure
    .input(
      z.object({
        siteId: z.string().uuid(),
        userId: z.string().min(1),
        role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.db
        .insert(siteMembers)
        .values(input)
        .onConflictDoUpdate({
          target: [siteMembers.siteId, siteMembers.userId],
          set: { role: input.role },
        })
        .returning();

      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'member.added', entityType: 'site_member', entityId: input.userId, metadata: { siteId: input.siteId, role: input.role } });
      return member;
    }),

  removeMember: superadminProcedure
    .input(z.object({ siteId: z.string().uuid(), userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(siteMembers)
        .where(and(eq(siteMembers.siteId, input.siteId), eq(siteMembers.userId, input.userId)));

      logAudit({ db: ctx.db, userId: ctx.session.user.id, action: 'member.removed', entityType: 'site_member', entityId: input.userId, metadata: { siteId: input.siteId } });
      return { success: true };
    }),

  // ── Set active site (for dashboard switcher) ──────────────────────────────

  setActive: staffProcedure
    .input(z.object({ siteId: z.string().uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.siteId) {
        // Verify access
        const isSuperadmin = (ctx.session.user as { role?: string }).role === 'superadmin';
        if (!isSuperadmin) {
          const [membership] = await ctx.db
            .select({ siteId: siteMembers.siteId })
            .from(siteMembers)
            .where(and(eq(siteMembers.siteId, input.siteId), eq(siteMembers.userId, ctx.session.user.id)))
            .limit(1);

          if (!membership) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this site' });
          }
        }
      }

      // Return siteId — client sets the cookie (proxy reads `active-site` cookie)
      return { siteId: input.siteId };
    }),
});
