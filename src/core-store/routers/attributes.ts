import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { storeAttributes, storeProductAttributeValues } from '@/core-store/schema/attributes';
import { storeProducts, storeCategories, storeProductCategories } from '@/core-store/schema/products';
import { slugify } from '@/core/lib/content/slug';

const storeAdminProcedure = sectionProcedure('settings');

export const storeAttributesRouter = createTRPCRouter({
  // ─── Public ───────────────────────────────────────────────────────────────

  /** List filterable attributes with available values (storefront faceted filters) */
  listFilterable: publicProcedure
    .input(z.object({
      categorySlug: z.string().max(255).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Get filterable attributes
      const attributes = await ctx.db
        .select()
        .from(storeAttributes)
        .where(eq(storeAttributes.filterable, true))
        .orderBy(storeAttributes.sortOrder)
        .limit(50);

      if (attributes.length === 0) return [];

      // Build conditions for published products
      const productConditions = [
        eq(storeProducts.status, 'published'),
        isNull(storeProducts.deletedAt),
      ];

      // If categorySlug, restrict to products in that category
      let productIdFilter: string[] | null = null;
      if (input?.categorySlug) {
        const [cat] = await ctx.db
          .select({ id: storeCategories.id })
          .from(storeCategories)
          .where(eq(storeCategories.slug, input.categorySlug))
          .limit(1);

        if (cat) {
          const catProducts = await ctx.db
            .select({ productId: storeProductCategories.productId })
            .from(storeProductCategories)
            .where(eq(storeProductCategories.categoryId, cat.id))
            .limit(500);

          productIdFilter = catProducts.map((r) => r.productId);
          if (productIdFilter.length === 0) return [];
        } else {
          return [];
        }
      }

      // Get published product IDs (with optional category filter)
      const publishedProducts = await ctx.db
        .select({ id: storeProducts.id })
        .from(storeProducts)
        .where(and(
          ...productConditions,
          ...(productIdFilter ? [inArray(storeProducts.id, productIdFilter)] : []),
        ))
        .limit(1000);

      const publishedIds = publishedProducts.map((p) => p.id);
      if (publishedIds.length === 0) return [];

      // Get attribute values that exist on published products
      const attributeValues = await ctx.db
        .select({
          attributeId: storeProductAttributeValues.attributeId,
          value: storeProductAttributeValues.value,
        })
        .from(storeProductAttributeValues)
        .where(and(
          inArray(storeProductAttributeValues.productId, publishedIds),
          inArray(storeProductAttributeValues.attributeId, attributes.map((a) => a.id)),
        ))
        .limit(5000);

      // Group values per attribute (deduplicated)
      const valuesByAttribute = new Map<string, Set<string>>();
      for (const row of attributeValues) {
        let set = valuesByAttribute.get(row.attributeId);
        if (!set) {
          set = new Set();
          valuesByAttribute.set(row.attributeId, set);
        }
        set.add(row.value);
      }

      // Return only attributes that have at least one value in published products
      return attributes
        .filter((a) => valuesByAttribute.has(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          type: a.type,
          values: Array.from(valuesByAttribute.get(a.id)!).sort(),
        }));
    }),

  // ─── Admin ────────────────────────────────────────────────────────────────

  /** List all attributes with usage count */
  adminListAttributes: storeAdminProcedure
    .query(async ({ ctx }) => {
      const attributes = await ctx.db
        .select({
          id: storeAttributes.id,
          name: storeAttributes.name,
          slug: storeAttributes.slug,
          type: storeAttributes.type,
          values: storeAttributes.values,
          filterable: storeAttributes.filterable,
          sortOrder: storeAttributes.sortOrder,
          createdAt: storeAttributes.createdAt,
          usageCount: sql<number>`(
            SELECT COUNT(*)::int FROM store_product_attribute_values
            WHERE attribute_id = ${storeAttributes.id}
          )`,
        })
        .from(storeAttributes)
        .orderBy(storeAttributes.sortOrder)
        .limit(200);

      return attributes;
    }),

  /** Create attribute */
  createAttribute: storeAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['select', 'text', 'number']).default('select'),
      values: z.array(z.string().max(255)).max(200).optional(),
      filterable: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const slug = slugify(input.name);

      await ctx.db.insert(storeAttributes).values({
        id,
        name: input.name,
        slug,
        type: input.type,
        values: input.values ?? null,
        filterable: input.filterable,
      });

      return { id, slug };
    }),

  /** Update attribute */
  updateAttribute: storeAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(100).optional(),
      values: z.array(z.string().max(255)).max(200).optional(),
      filterable: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;

      const existing = await ctx.db
        .select({ id: storeAttributes.id })
        .from(storeAttributes)
        .where(eq(storeAttributes.id, id))
        .limit(1);

      if (existing.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Attribute not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (fields.name !== undefined) {
        updateData.name = fields.name;
        updateData.slug = slugify(fields.name);
      }
      if (fields.values !== undefined) updateData.values = fields.values;
      if (fields.filterable !== undefined) updateData.filterable = fields.filterable;
      if (fields.sortOrder !== undefined) updateData.sortOrder = fields.sortOrder;

      if (Object.keys(updateData).length > 0) {
        await ctx.db.update(storeAttributes).set(updateData).where(eq(storeAttributes.id, id));
      }

      return { success: true };
    }),

  /** Delete attribute (cascades to product attribute values) */
  deleteAttribute: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(storeAttributes).where(eq(storeAttributes.id, input.id));
      return { success: true };
    }),

  /** Set attribute values for a product (replaces existing) */
  setProductAttributes: storeAdminProcedure
    .input(z.object({
      productId: z.string().uuid(),
      attributes: z.array(z.object({
        attributeId: z.string().uuid(),
        value: z.string().max(255),
      })).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        // Remove existing attribute values for this product
        await tx
          .delete(storeProductAttributeValues)
          .where(eq(storeProductAttributeValues.productId, input.productId));

        // Insert new values
        if (input.attributes.length > 0) {
          await tx.insert(storeProductAttributeValues).values(
            input.attributes.map((attr) => ({
              productId: input.productId,
              attributeId: attr.attributeId,
              value: attr.value,
            })),
          );
        }
      });

      return { success: true };
    }),

  /** Get attribute values for a product with attribute metadata */
  getProductAttributes: storeAdminProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          attributeId: storeProductAttributeValues.attributeId,
          value: storeProductAttributeValues.value,
          attributeName: storeAttributes.name,
          attributeSlug: storeAttributes.slug,
          attributeType: storeAttributes.type,
          attributeValues: storeAttributes.values,
          filterable: storeAttributes.filterable,
        })
        .from(storeProductAttributeValues)
        .innerJoin(storeAttributes, eq(storeProductAttributeValues.attributeId, storeAttributes.id))
        .where(eq(storeProductAttributeValues.productId, input.productId))
        .orderBy(storeAttributes.sortOrder)
        .limit(50);

      return rows;
    }),
});
