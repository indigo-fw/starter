import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, desc, asc, count, and } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { cmsDocs } from '@/core-docs/schema/docs';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { stripHtml } from '@/core-docs/lib/docs-loader';
import { getDocBySlug, getDocsNavigation, searchDocs, generateLlmExport } from '@/core-docs/lib/docs-service';
import { slugify } from '@/core/lib/content/slug';

const docsAdminProcedure = sectionProcedure('content');

export const docsRouter = createTRPCRouter({
  // ─── Public procedures ──────────────────────────────────────────────────────

  /** Get a single doc by slug (unified: file + CMS) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(500) }))
    .query(async ({ input }) => {
      const doc = await getDocBySlug(input.slug);
      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Documentation page not found' });
      }
      return doc;
    }),

  /** Get navigation tree (unified: file + CMS) */
  getNavigation: publicProcedure.query(async () => {
    return getDocsNavigation();
  }),

  /** Search docs (unified: file + CMS) */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      return searchDocs(input.query, input.limit);
    }),

  /** Get LLM-friendly plain text export */
  llmExport: publicProcedure.query(async () => {
    return { content: await generateLlmExport() };
  }),

  // ─── Admin procedures (CMS docs only) ──────────────────────────────────────

  /** List all CMS-authored docs */
  adminList: docsAdminProcedure
    .input(z.object({
      status: z.enum(['published', 'draft']).optional(),
      section: z.string().max(255).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [];
      if (input.status) conditions.push(eq(cmsDocs.status, input.status));
      if (input.section) conditions.push(eq(cmsDocs.section, input.section));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: cmsDocs.id,
            slug: cmsDocs.slug,
            title: cmsDocs.title,
            section: cmsDocs.section,
            sortOrder: cmsDocs.sortOrder,
            status: cmsDocs.status,
            updatedAt: cmsDocs.updatedAt,
          })
          .from(cmsDocs)
          .where(where)
          .orderBy(asc(cmsDocs.section), asc(cmsDocs.sortOrder))
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(cmsDocs).where(where),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get a single CMS doc for editing */
  adminGet: docsAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [doc] = await ctx.db
        .select()
        .from(cmsDocs)
        .where(eq(cmsDocs.id, input.id))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doc not found' });
      }

      return doc;
    }),

  /** Create a new CMS doc */
  adminCreate: docsAdminProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      slug: z.string().max(500).optional(),
      body: z.string().max(500000).default(''),
      section: z.string().max(255).optional(),
      sortOrder: z.number().int().default(0),
      parentId: z.string().uuid().optional(),
      metaTitle: z.string().max(255).optional(),
      metaDescription: z.string().max(500).optional(),
      status: z.enum(['published', 'draft']).default('draft'),
    }))
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug || slugify(input.title);
      const id = crypto.randomUUID();

      await ctx.db.insert(cmsDocs).values({
        id,
        slug,
        title: input.title,
        body: input.body,
        bodyText: stripHtml(input.body),
        section: input.section ?? null,
        sortOrder: input.sortOrder,
        parentId: input.parentId ?? null,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        status: input.status,
      });

      return { id, slug };
    }),

  /** Update a CMS doc */
  adminUpdate: docsAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
      slug: z.string().max(500).optional(),
      body: z.string().max(500000).optional(),
      section: z.string().max(255).nullish(),
      sortOrder: z.number().int().optional(),
      parentId: z.string().uuid().nullish(),
      metaTitle: z.string().max(255).nullish(),
      metaDescription: z.string().max(500).nullish(),
      status: z.enum(['published', 'draft']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (fields.title !== undefined) updates.title = fields.title;
      if (fields.slug !== undefined) updates.slug = fields.slug;
      if (fields.body !== undefined) {
        updates.body = fields.body;
        updates.bodyText = stripHtml(fields.body);
      }
      if (fields.section !== undefined) updates.section = fields.section ?? null;
      if (fields.sortOrder !== undefined) updates.sortOrder = fields.sortOrder;
      if (fields.parentId !== undefined) updates.parentId = fields.parentId ?? null;
      if (fields.metaTitle !== undefined) updates.metaTitle = fields.metaTitle ?? null;
      if (fields.metaDescription !== undefined) updates.metaDescription = fields.metaDescription ?? null;
      if (fields.status !== undefined) updates.status = fields.status;

      await ctx.db
        .update(cmsDocs)
        .set(updates)
        .where(eq(cmsDocs.id, id));

      return { success: true };
    }),

  /** Delete a CMS doc */
  adminDelete: docsAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(cmsDocs)
        .where(eq(cmsDocs.id, input.id));

      return { success: true };
    }),

  /** Reorder docs within a section */
  adminReorder: docsAdminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int(),
      })).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      for (const item of input.items) {
        await ctx.db
          .update(cmsDocs)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(cmsDocs.id, item.id));
      }
      return { success: true };
    }),
});
