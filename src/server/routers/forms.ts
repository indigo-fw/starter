import { TRPCError } from '@trpc/server';
import { and, desc, eq, ilike, or, sql, count as drizzleCount } from 'drizzle-orm';
import { z } from 'zod';

import { slugify } from '@/core/lib/content/slug';
import { cmsForms, cmsFormSubmissions } from '@/server/db/schema';
import { logAudit } from '@/core/lib/infra/audit';
import {
  ensureSlugUnique,
  parsePagination,
  paginatedResult,
  fetchOrNotFound,
} from '@/core/crud/admin-crud';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '../trpc';

const contentProcedure = sectionProcedure('content');

// ---------------------------------------------------------------------------
// Field schema — defines the shape of a single form field
// ---------------------------------------------------------------------------

const fieldSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    'text',
    'email',
    'textarea',
    'select',
    'checkbox',
    'number',
    'phone',
    'date',
  ]),
  label: z.string().min(1).max(255),
  placeholder: z.string().max(255).optional(),
  required: z.boolean().optional(),
  options: z.string().max(2000).optional(), // comma-separated for select fields
});

// ---------------------------------------------------------------------------
// Forms router
// ---------------------------------------------------------------------------

export const formsRouter = createTRPCRouter({
  /** Admin: paginated list of forms */
  list: contentProcedure
    .input(
      z.object({
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = input?.search
        ? or(
            ilike(cmsForms.name, `%${input.search}%`),
            ilike(cmsForms.slug, `%${input.search}%`)
          )
        : undefined;

      const [items, countResult] = await Promise.all([
        ctx.db
          .select({
            id: cmsForms.id,
            name: cmsForms.name,
            slug: cmsForms.slug,
            active: cmsForms.active,
            fields: cmsForms.fields,
            recipientEmail: cmsForms.recipientEmail,
            createdAt: cmsForms.createdAt,
            submissionCount:
              sql<number>`(SELECT count(*) FROM cms_form_submissions WHERE form_id = ${cmsForms.id})`.as(
                'submission_count'
              ),
          })
          .from(cmsForms)
          .where(conditions)
          .orderBy(desc(cmsForms.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: drizzleCount() })
          .from(cmsForms)
          .where(conditions),
      ]);

      const total = countResult[0]?.count ?? 0;
      return paginatedResult(items, total, page, pageSize);
    }),

  /** Admin: get a single form by id */
  get: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return fetchOrNotFound<typeof cmsForms.$inferSelect>(
        ctx.db, cmsForms, input.id, 'Form'
      );
    }),

  /** Public: get active form by slug (for rendering on public pages) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const [form] = await ctx.db
        .select({
          id: cmsForms.id,
          name: cmsForms.name,
          slug: cmsForms.slug,
          fields: cmsForms.fields,
          successMessage: cmsForms.successMessage,
          honeypotField: cmsForms.honeypotField,
        })
        .from(cmsForms)
        .where(and(eq(cmsForms.slug, input.slug), eq(cmsForms.active, true)))
        .limit(1);

      if (!form) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Form not found' });
      }
      return form;
    }),

  /** Admin: create a new form */
  create: contentProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().max(255).optional(),
        fields: z.array(fieldSchema).max(50),
        recipientEmail: z.string().email().max(255).optional(),
        successMessage: z.string().max(1000).optional(),
        honeypotField: z.string().max(50).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug || slugify(input.name);

      await ensureSlugUnique(
        ctx.db,
        {
          table: cmsForms,
          slugCol: cmsForms.slug,
          slug,
        },
        'Form'
      );

      const [form] = await ctx.db
        .insert(cmsForms)
        .values({
          name: input.name,
          slug,
          fields: input.fields,
          recipientEmail: input.recipientEmail ?? null,
          successMessage: input.successMessage ?? 'Thank you!',
          honeypotField: input.honeypotField ?? null,
          active: input.active ?? true,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'create',
        entityType: 'form',
        entityId: form!.id,
        entityTitle: input.name,
      });

      return form!;
    }),

  /** Admin: update an existing form */
  update: contentProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        slug: z.string().min(1).max(255).optional(),
        fields: z.array(fieldSchema).max(50).optional(),
        recipientEmail: z.string().email().max(255).nullish(),
        successMessage: z.string().max(1000).optional(),
        honeypotField: z.string().max(50).nullish(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const existing = await fetchOrNotFound<typeof cmsForms.$inferSelect>(
        ctx.db, cmsForms, id, 'Form'
      );

      if (updates.slug && updates.slug !== existing.slug) {
        await ensureSlugUnique(
          ctx.db,
          {
            table: cmsForms,
            slugCol: cmsForms.slug,
            slug: updates.slug,
            idCol: cmsForms.id,
            excludeId: id,
          },
          'Form'
        );
      }

      await ctx.db
        .update(cmsForms)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(cmsForms.id, id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'update',
        entityType: 'form',
        entityId: id,
        entityTitle: updates.name ?? existing.name,
      });

      return { success: true };
    }),

  /** Admin: delete a form (cascades to submissions via FK) */
  delete: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await fetchOrNotFound<typeof cmsForms.$inferSelect>(
        ctx.db, cmsForms, input.id, 'Form'
      );

      await ctx.db.delete(cmsForms).where(eq(cmsForms.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'delete',
        entityType: 'form',
        entityId: input.id,
        entityTitle: existing.name,
      });

      return { success: true };
    }),

  /** Admin: paginated list of submissions for a form */
  submissions: contentProcedure
    .input(
      z.object({
        formId: z.string().uuid(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const condition = eq(cmsFormSubmissions.formId, input.formId);

      const [items, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(cmsFormSubmissions)
          .where(condition)
          .orderBy(desc(cmsFormSubmissions.createdAt))
          .offset(offset)
          .limit(pageSize),
        ctx.db
          .select({ count: drizzleCount() })
          .from(cmsFormSubmissions)
          .where(condition),
      ]);

      const total = countResult[0]?.count ?? 0;
      return paginatedResult(items, total, page, pageSize);
    }),

  /** Admin: delete a single submission */
  deleteSubmission: contentProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await fetchOrNotFound<typeof cmsFormSubmissions.$inferSelect>(
        ctx.db, cmsFormSubmissions, input.id, 'Submission'
      );

      await ctx.db
        .delete(cmsFormSubmissions)
        .where(eq(cmsFormSubmissions.id, input.id));

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id!,
        action: 'delete',
        entityType: 'form_submission',
        entityId: input.id,
      });

      return { success: true };
    }),

  /** Admin: export submissions as JSON or CSV */
  exportSubmissions: contentProcedure
    .input(
      z.object({
        formId: z.string().uuid(),
        format: z.enum(['json', 'csv']).default('json'),
      })
    )
    .query(async ({ ctx, input }) => {
      // Fetch form for field definitions
      const form = await fetchOrNotFound<typeof cmsForms.$inferSelect>(
        ctx.db, cmsForms, input.formId, 'Form'
      );

      const submissions = await ctx.db
        .select()
        .from(cmsFormSubmissions)
        .where(eq(cmsFormSubmissions.formId, input.formId))
        .orderBy(desc(cmsFormSubmissions.createdAt))
        .limit(10000);

      const fields = form.fields as Array<{
        id: string;
        label: string;
        type: string;
      }>;

      if (input.format === 'csv') {
        const headers = ['Submitted At', ...fields.map((f) => f.label), 'IP'];
        const rows = submissions.map((s) => {
          const data = s.data as Record<string, unknown>;
          return [
            s.createdAt.toISOString(),
            ...fields.map((f) => String(data[f.id] ?? '')),
            s.ip ?? '',
          ];
        });

        // Escape CSV values
        const escapeCsv = (val: string) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        };

        const csvContent = [
          headers.map(escapeCsv).join(','),
          ...rows.map((r) => r.map(escapeCsv).join(',')),
        ].join('\n');

        return { content: csvContent, filename: `${form.slug}-submissions.csv` };
      }

      // JSON format
      const jsonData = submissions.map((s) => ({
        id: s.id,
        data: s.data,
        ip: s.ip,
        submittedAt: s.createdAt,
      }));

      return {
        content: JSON.stringify(jsonData, null, 2),
        filename: `${form.slug}-submissions.json`,
      };
    }),
});
