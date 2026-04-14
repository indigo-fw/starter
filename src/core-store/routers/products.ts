import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { createTRPCRouter, publicProcedure, sectionProcedure } from '@/server/trpc';
import { storeProducts, storeProductVariants, storeVariantGroups, storeProductImages, storeCategories, storeProductCategories } from '@/core-store/schema/products';
import { storeAttributes, storeProductAttributeValues } from '@/core-store/schema/attributes';
import { parsePagination, paginatedResult } from '@/core/crud/admin-crud';
import { slugify } from '@/core/lib/content/slug';

const storeAdminProcedure = sectionProcedure('settings');

export const storeProductsRouter = createTRPCRouter({
  // ─── Public ───────────────────────────────────────────────────────────────

  /** List published products (storefront) */
  list: publicProcedure
    .input(z.object({
      categorySlug: z.string().max(255).optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
      attributes: z.record(z.string(), z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [
        eq(storeProducts.status, 'published'),
        isNull(storeProducts.deletedAt),
      ];

      if (input.search) {
        conditions.push(sql`${storeProducts.name} ILIKE ${'%' + input.search + '%'}`);
      }

      // Category filter: find product IDs in the category, then filter
      if (input.categorySlug) {
        const [cat] = await ctx.db
          .select({ id: storeCategories.id })
          .from(storeCategories)
          .where(eq(storeCategories.slug, input.categorySlug))
          .limit(1);

        if (cat) {
          const catProductIds = await ctx.db
            .select({ productId: storeProductCategories.productId })
            .from(storeProductCategories)
            .where(eq(storeProductCategories.categoryId, cat.id))
            .limit(500);

          const ids = catProductIds.map((r) => r.productId);
          if (ids.length > 0) {
            conditions.push(inArray(storeProducts.id, ids));
          } else {
            // No products in this category — force empty result
            conditions.push(sql`false`);
          }
        } else {
          conditions.push(sql`false`);
        }
      }

      // Attribute filters: AND logic — product must match ALL specified attributes
      if (input.attributes) {
        for (const [slug, value] of Object.entries(input.attributes)) {
          conditions.push(
            exists(
              ctx.db.select({ one: sql`1` })
                .from(storeProductAttributeValues)
                .innerJoin(storeAttributes, eq(storeAttributes.id, storeProductAttributeValues.attributeId))
                .where(and(
                  eq(storeProductAttributeValues.productId, storeProducts.id),
                  eq(storeAttributes.slug, slug),
                  eq(storeProductAttributeValues.value, value),
                ))
            )
          );
        }
      }

      const orderBy = input.sort === 'price_asc' ? storeProducts.priceCents
        : input.sort === 'price_desc' ? desc(storeProducts.priceCents)
        : input.sort === 'name' ? storeProducts.name
        : desc(storeProducts.createdAt);

      const [items, [countRow]] = await Promise.all([
        ctx.db
          .select({
            id: storeProducts.id,
            name: storeProducts.name,
            slug: storeProducts.slug,
            type: storeProducts.type,
            priceCents: storeProducts.priceCents,
            comparePriceCents: storeProducts.comparePriceCents,
            currency: storeProducts.currency,
            featuredImage: storeProducts.featuredImage,
            shortDescription: storeProducts.shortDescription,
          })
          .from(storeProducts)
          .where(and(...conditions))
          .orderBy(orderBy)
          .offset(offset)
          .limit(pageSize),
        ctx.db.select({ count: count() }).from(storeProducts).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get product detail by slug (storefront) */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().max(255) }))
    .query(async ({ ctx, input }) => {
      const [product] = await ctx.db
        .select()
        .from(storeProducts)
        .where(and(eq(storeProducts.slug, input.slug), eq(storeProducts.status, 'published'), isNull(storeProducts.deletedAt)))
        .limit(1);

      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });

      const [variants, images, variantGroups, productCategories] = await Promise.all([
        ctx.db.select().from(storeProductVariants).where(eq(storeProductVariants.productId, product.id)).orderBy(storeProductVariants.sortOrder).limit(100),
        ctx.db.select().from(storeProductImages).where(eq(storeProductImages.productId, product.id)).orderBy(storeProductImages.sortOrder).limit(50),
        ctx.db.select().from(storeVariantGroups).where(eq(storeVariantGroups.productId, product.id)).orderBy(storeVariantGroups.sortOrder).limit(10),
        ctx.db
          .select({ name: storeCategories.name, slug: storeCategories.slug })
          .from(storeProductCategories)
          .innerJoin(storeCategories, eq(storeProductCategories.categoryId, storeCategories.id))
          .where(eq(storeProductCategories.productId, product.id))
          .limit(50),
      ]);

      return { ...product, variants, images, variantGroups, categories: productCategories };
    }),

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  /** List all products (admin) */
  adminList: storeAdminProcedure
    .input(z.object({
      status: z.enum(['draft', 'published', 'archived']).optional(),
      type: z.enum(['simple', 'variable', 'digital', 'subscription']).optional(),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const { page, pageSize, offset } = parsePagination(input);

      const conditions = [isNull(storeProducts.deletedAt)];
      if (input.status) conditions.push(eq(storeProducts.status, input.status));
      if (input.type) conditions.push(eq(storeProducts.type, input.type));
      if (input.search) conditions.push(sql`${storeProducts.name} ILIKE ${'%' + input.search + '%'}`);

      const [items, [countRow]] = await Promise.all([
        ctx.db.select().from(storeProducts).where(and(...conditions)).orderBy(desc(storeProducts.createdAt)).offset(offset).limit(pageSize),
        ctx.db.select({ count: count() }).from(storeProducts).where(and(...conditions)),
      ]);

      return paginatedResult(items, countRow?.count ?? 0, page, pageSize);
    }),

  /** Get product for editing (admin) */
  adminGet: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [product] = await ctx.db.select().from(storeProducts).where(eq(storeProducts.id, input.id)).limit(1);
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });

      const [variants, images, variantGroups, categories] = await Promise.all([
        ctx.db.select().from(storeProductVariants).where(eq(storeProductVariants.productId, product.id)).orderBy(storeProductVariants.sortOrder).limit(100),
        ctx.db.select().from(storeProductImages).where(eq(storeProductImages.productId, product.id)).orderBy(storeProductImages.sortOrder).limit(50),
        ctx.db.select().from(storeVariantGroups).where(eq(storeVariantGroups.productId, product.id)).orderBy(storeVariantGroups.sortOrder).limit(10),
        ctx.db.select({ categoryId: storeProductCategories.categoryId }).from(storeProductCategories).where(eq(storeProductCategories.productId, product.id)).limit(50),
      ]);

      return { ...product, variants, images, variantGroups, categoryIds: categories.map((c) => c.categoryId) };
    }),

  /** Create product (admin) */
  create: storeAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['simple', 'variable', 'digital', 'subscription']).default('simple'),
      description: z.string().max(100000).optional(),
      shortDescription: z.string().max(500).optional(),
      priceCents: z.number().int().min(0).optional(),
      comparePriceCents: z.number().int().min(0).optional(),
      currency: z.string().length(3).default('EUR'),
      sku: z.string().max(100).optional(),
      trackInventory: z.boolean().default(false),
      stockQuantity: z.number().int().default(0),
      weightGrams: z.number().int().optional(),
      taxClass: z.string().max(50).default('standard'),
      requiresShipping: z.boolean().default(true),
      featuredImage: z.string().optional(),
      metaTitle: z.string().max(255).optional(),
      metaDescription: z.string().max(500).optional(),
      digitalFileUrl: z.string().optional(),
      downloadLimit: z.number().int().optional(),
      subscriptionPlanId: z.string().max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const slug = slugify(input.name);

      await ctx.db.insert(storeProducts).values({
        id,
        slug,
        ...input,
      });

      return { id, slug };
    }),

  /** Update product (admin) */
  update: storeAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      slug: z.string().max(255).optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      description: z.string().max(100000).optional(),
      shortDescription: z.string().max(500).optional(),
      priceCents: z.number().int().min(0).optional(),
      comparePriceCents: z.number().int().min(0).nullable().optional(),
      sku: z.string().max(100).optional(),
      trackInventory: z.boolean().optional(),
      stockQuantity: z.number().int().optional(),
      weightGrams: z.number().int().nullable().optional(),
      taxClass: z.string().max(50).optional(),
      requiresShipping: z.boolean().optional(),
      featuredImage: z.string().nullable().optional(),
      metaTitle: z.string().max(255).nullable().optional(),
      metaDescription: z.string().max(500).nullable().optional(),
      digitalFileUrl: z.string().nullable().optional(),
      downloadLimit: z.number().int().nullable().optional(),
      subscriptionPlanId: z.string().max(100).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await ctx.db.update(storeProducts).set({ ...fields, updatedAt: new Date() }).where(eq(storeProducts.id, id));
      return { success: true };
    }),

  /** Soft delete product (admin) */
  delete: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(storeProducts).set({ deletedAt: new Date() }).where(eq(storeProducts.id, input.id));
      return { success: true };
    }),

  // ─── Variants (admin) ────────────────────────────────────────────────────

  /** Add variant to product */
  addVariant: storeAdminProcedure
    .input(z.object({
      productId: z.string().uuid(),
      name: z.string().max(255),
      sku: z.string().max(100).optional(),
      priceCents: z.number().int().min(0),
      comparePriceCents: z.number().int().min(0).optional(),
      stockQuantity: z.number().int().default(0),
      weightGrams: z.number().int().optional(),
      options: z.record(z.string(), z.string()),
      image: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      await ctx.db.insert(storeProductVariants).values({ id, ...input });
      return { id };
    }),

  /** Update variant */
  updateVariant: storeAdminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().max(255).optional(),
      sku: z.string().max(100).optional(),
      priceCents: z.number().int().min(0).optional(),
      comparePriceCents: z.number().int().min(0).nullable().optional(),
      stockQuantity: z.number().int().optional(),
      weightGrams: z.number().int().nullable().optional(),
      options: z.record(z.string(), z.string()).optional(),
      image: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await ctx.db.update(storeProductVariants).set(fields).where(eq(storeProductVariants.id, id));
      return { success: true };
    }),

  /** Delete variant */
  deleteVariant: storeAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(storeProductVariants).where(eq(storeProductVariants.id, input.id));
      return { success: true };
    }),

  // ─── Categories (admin) ──────────────────────────────────────────────────

  /** List categories */
  listCategories: storeAdminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(storeCategories).orderBy(storeCategories.sortOrder).limit(200);
  }),

  /** Create category */
  createCategory: storeAdminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      parentId: z.string().uuid().optional(),
      image: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      const slug = slugify(input.name);
      await ctx.db.insert(storeCategories).values({ id, slug, ...input });
      return { id, slug };
    }),

  // ─── Bulk Operations (admin) ────────────────────────────────────────────

  /** Bulk update product status */
  bulkUpdateStatus: storeAdminProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(50),
      status: z.enum(['draft', 'published', 'archived']),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(storeProducts)
        .set({ status: input.status, updatedAt: new Date() })
        .where(inArray(storeProducts.id, input.ids));
      return { count: input.ids.length };
    }),

  /** Bulk soft-delete products */
  bulkDelete: storeAdminProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(storeProducts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
          inArray(storeProducts.id, input.ids),
          isNull(storeProducts.deletedAt),
        ));
      return { count: input.ids.length };
    }),

  /** Bulk update product prices (set, increase %, decrease %) */
  bulkUpdatePrice: storeAdminProcedure
    .input(z.object({
      ids: z.array(z.string().uuid()).min(1).max(50),
      adjustment: z.union([
        z.object({ type: z.literal('set'), priceCents: z.number().int().min(0) }),
        z.object({ type: z.literal('increase'), percent: z.number().min(0).max(1000) }),
        z.object({ type: z.literal('decrease'), percent: z.number().min(0).max(100) }),
      ]),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.adjustment.type === 'set') {
        await ctx.db.update(storeProducts)
          .set({ priceCents: input.adjustment.priceCents, updatedAt: new Date() })
          .where(inArray(storeProducts.id, input.ids));
      } else if (input.adjustment.type === 'increase') {
        const factor = 1 + input.adjustment.percent / 100;
        await ctx.db.update(storeProducts)
          .set({
            priceCents: sql`ROUND(${storeProducts.priceCents} * ${factor})::integer`,
            updatedAt: new Date(),
          })
          .where(inArray(storeProducts.id, input.ids));
      } else {
        const factor = 1 - input.adjustment.percent / 100;
        await ctx.db.update(storeProducts)
          .set({
            priceCents: sql`ROUND(${storeProducts.priceCents} * ${factor})::integer`,
            updatedAt: new Date(),
          })
          .where(inArray(storeProducts.id, input.ids));
      }
      return { count: input.ids.length };
    }),
});
