import { TRPCError } from '@trpc/server';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'crypto';

import { DEFAULT_LOCALE } from '@/lib/constants';
import { createLogger } from '@/core/lib/infra/logger';
import { createTRPCRouter, superadminProcedure, staffProcedure } from '@/server/trpc';
import { sites, siteDomains, siteMembers, SiteStatus } from '@/core-multisite/schema/sites';
import { schemaNameFromSlug } from '@/core-multisite/lib/schema-manager';
import { slugify } from '@/core/lib/content/slug';

const log = createLogger('multisite-router');

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

  // ── Create site ───────────────────────────────────────────────────────────

  create: superadminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(100).optional(),
        defaultLocale: z.string().min(2).max(5).default(DEFAULT_LOCALE),
        locales: z.array(z.string().min(2).max(5)).min(1).max(50).default([DEFAULT_LOCALE]),
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
      return site;
    }),

  // ── Update site settings ──────────────────────────────────────────────────

  update: superadminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        defaultLocale: z.string().min(2).max(5).optional(),
        locales: z.array(z.string().min(2).max(5)).min(1).max(50).optional(),
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
      return site;
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
      log.info('Site soft-deleted', { siteId: site.id, slug: site.slug });
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

      log.warn('Site hard-deleted', { siteId: site.id, slug: site.slug, schema: site.schemaName });
      return { success: true };
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

      return {
        ...domain,
        verificationInstruction: `Add a TXT record to your DNS: indigo-verify=${verificationToken}`,
      };
    }),

  removeDomain: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(siteDomains).where(eq(siteDomains.id, input.id));
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

      return member;
    }),

  removeMember: superadminProcedure
    .input(z.object({ siteId: z.string().uuid(), userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(siteMembers)
        .where(and(eq(siteMembers.siteId, input.siteId), eq(siteMembers.userId, input.userId)));
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
