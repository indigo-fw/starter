import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';

import { createTRPCRouter, sectionProcedure } from '../trpc';
import {
  cmsCustomFieldDefinitions,
  cmsCustomFieldValues,
} from '@/server/db/schema';
import { slugify } from '@/core/lib/slug';
import { logAudit } from '@/core/lib/audit';

const proc = sectionProcedure('content');

const fieldTypeEnum = z.enum([
  'text',
  'textarea',
  'number',
  'boolean',
  'select',
  'date',
  'url',
  'color',
]);

export const customFieldsRouter = createTRPCRouter({
  /** List all field definitions */
  list: proc.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(cmsCustomFieldDefinitions)
      .orderBy(asc(cmsCustomFieldDefinitions.sortOrder))
      .limit(500);
  }),

  /** Get a single field definition */
  get: proc
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const def = await ctx.db.query.cmsCustomFieldDefinitions.findFirst({
        where: eq(cmsCustomFieldDefinitions.id, input.id),
      });
      if (!def) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Field not found' });
      }
      return def;
    }),

  /** Create a field definition */
  create: proc
    .input(
      z.object({
        name: z.string().min(1).max(100),
        fieldType: fieldTypeEnum,
        options: z.record(z.string(), z.unknown()).optional(),
        contentTypes: z.array(z.string().max(30)).min(1),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = slugify(input.name);

      // Check uniqueness
      const existing = await ctx.db.query.cmsCustomFieldDefinitions.findFirst({
        where: eq(cmsCustomFieldDefinitions.slug, slug),
        columns: { id: true },
      });
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A custom field with slug "${slug}" already exists`,
        });
      }

      const [created] = await ctx.db
        .insert(cmsCustomFieldDefinitions)
        .values({
          name: input.name,
          slug,
          fieldType: input.fieldType,
          options: input.options ?? null,
          contentTypes: input.contentTypes,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'create',
        entityType: 'custom_field',
        entityId: created.id,
        entityTitle: input.name,
      });

      return created;
    }),

  /** Update a field definition */
  update: proc
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        fieldType: fieldTypeEnum.optional(),
        options: z.record(z.string(), z.unknown()).nullish(),
        contentTypes: z.array(z.string().max(30)).min(1).optional(),
        sortOrder: z.number().int().min(0).max(9999).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const setData: Record<string, unknown> = {};

      if (updates.name !== undefined) {
        const newSlug = slugify(updates.name);
        const conflict = await ctx.db.query.cmsCustomFieldDefinitions.findFirst({
          where: and(
            eq(cmsCustomFieldDefinitions.slug, newSlug),
            ne(cmsCustomFieldDefinitions.id, id)
          ),
          columns: { id: true },
        });
        if (conflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A custom field with slug "${newSlug}" already exists`,
          });
        }
        setData.name = updates.name;
        setData.slug = newSlug;
      }
      if (updates.fieldType !== undefined) setData.fieldType = updates.fieldType;
      if (updates.options !== undefined)
        setData.options = updates.options ?? null;
      if (updates.contentTypes !== undefined)
        setData.contentTypes = updates.contentTypes;
      if (updates.sortOrder !== undefined)
        setData.sortOrder = updates.sortOrder;

      const [updated] = await ctx.db
        .update(cmsCustomFieldDefinitions)
        .set(setData)
        .where(eq(cmsCustomFieldDefinitions.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Field not found' });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'update',
        entityType: 'custom_field',
        entityId: id,
        entityTitle: updated.name,
      });

      return updated;
    }),

  /** Delete a field definition (cascades to values) */
  delete: proc
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(cmsCustomFieldDefinitions)
        .where(eq(cmsCustomFieldDefinitions.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Field not found' });
      }

      logAudit({
        db: ctx.db,
        userId: ctx.session.user.id,
        action: 'delete',
        entityType: 'custom_field',
        entityId: input.id,
        entityTitle: deleted.name,
      });

      return { success: true };
    }),

  /** Get custom field values for a content item */
  getValues: proc
    .input(
      z.object({
        contentType: z.string().max(30),
        contentId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const values = await ctx.db
        .select({
          fieldDefinitionId: cmsCustomFieldValues.fieldDefinitionId,
          value: cmsCustomFieldValues.value,
          slug: cmsCustomFieldDefinitions.slug,
          name: cmsCustomFieldDefinitions.name,
          fieldType: cmsCustomFieldDefinitions.fieldType,
        })
        .from(cmsCustomFieldValues)
        .innerJoin(
          cmsCustomFieldDefinitions,
          eq(
            cmsCustomFieldValues.fieldDefinitionId,
            cmsCustomFieldDefinitions.id
          )
        )
        .where(
          and(
            eq(cmsCustomFieldValues.contentType, input.contentType),
            eq(cmsCustomFieldValues.contentId, input.contentId)
          )
        );

      // Return as { [slug]: value } map
      const map: Record<string, unknown> = {};
      for (const v of values) {
        map[v.slug] = v.value;
      }
      return map;
    }),

  /** Save custom field values for a content item (batch upsert) */
  saveValues: proc
    .input(
      z.object({
        contentType: z.string().max(30),
        contentId: z.string().uuid(),
        values: z.record(z.string(), z.unknown()).refine(
          (obj) => Object.keys(obj).length <= 100,
          { message: 'Max 100 fields per save' }
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get field definitions by slug
      const slugs = Object.keys(input.values);
      if (slugs.length === 0) return { saved: 0 };

      const definitions = await ctx.db
        .select({
          id: cmsCustomFieldDefinitions.id,
          slug: cmsCustomFieldDefinitions.slug,
        })
        .from(cmsCustomFieldDefinitions)
        .where(inArray(cmsCustomFieldDefinitions.slug, slugs));

      const slugToId = new Map(definitions.map((d) => [d.slug, d.id]));

      await ctx.db.transaction(async (tx) => {
        // Delete existing values for this content
        await tx
          .delete(cmsCustomFieldValues)
          .where(
            and(
              eq(cmsCustomFieldValues.contentType, input.contentType),
              eq(cmsCustomFieldValues.contentId, input.contentId)
            )
          );

        // Insert new values
        const rows = slugs
          .filter((slug) => slugToId.has(slug))
          .map((slug) => ({
            fieldDefinitionId: slugToId.get(slug)!,
            contentType: input.contentType,
            contentId: input.contentId,
            value: input.values[slug] ?? null,
          }));

        if (rows.length > 0) {
          await tx.insert(cmsCustomFieldValues).values(rows);
        }
      });

      return { saved: slugs.length };
    }),

  /** Get definitions filtered by content type */
  listForContentType: proc
    .input(z.object({ contentType: z.string().max(30) }))
    .query(async ({ ctx, input }) => {
      // Fetch all and filter in JS since JSONB array contains is complex in Drizzle
      const all = await ctx.db
        .select()
        .from(cmsCustomFieldDefinitions)
        .orderBy(asc(cmsCustomFieldDefinitions.sortOrder))
        .limit(500);

      return all.filter((def) => {
        const types = def.contentTypes as string[];
        return types.includes(input.contentType);
      });
    }),
});
