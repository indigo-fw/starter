import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeBundleItems } from '@/core-store/schema/bundles';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-bundles');

// ─── Get Bundle Components ────────────────────────────────────────────────

export async function getBundleComponents(bundleProductId: string) {
  const components = await db
    .select({
      id: storeBundleItems.id,
      componentProductId: storeBundleItems.componentProductId,
      componentVariantId: storeBundleItems.componentVariantId,
      quantity: storeBundleItems.quantity,
      sortOrder: storeBundleItems.sortOrder,
      productName: storeProducts.name,
      priceCents: storeProducts.priceCents,
    })
    .from(storeBundleItems)
    .innerJoin(storeProducts, eq(storeProducts.id, storeBundleItems.componentProductId))
    .where(eq(storeBundleItems.bundleProductId, bundleProductId))
    .orderBy(storeBundleItems.sortOrder)
    .limit(100);

  return components;
}

// ─── Check Bundle Availability ────────────────────────────────────────────

export async function checkBundleAvailability(
  bundleProductId: string,
  requestedQty = 1,
): Promise<boolean> {
  const components = await db
    .select({
      componentProductId: storeBundleItems.componentProductId,
      componentVariantId: storeBundleItems.componentVariantId,
      quantity: storeBundleItems.quantity,
    })
    .from(storeBundleItems)
    .where(eq(storeBundleItems.bundleProductId, bundleProductId))
    .limit(100);

  for (const component of components) {
    const requiredQty = component.quantity * requestedQty;

    if (component.componentVariantId) {
      const [variant] = await db
        .select({ stockQuantity: storeProductVariants.stockQuantity })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.id, component.componentVariantId))
        .limit(1);

      if (!variant || (variant.stockQuantity ?? 0) < requiredQty) return false;
    } else {
      const [product] = await db
        .select({
          stockQuantity: storeProducts.stockQuantity,
          trackInventory: storeProducts.trackInventory,
          allowBackorders: storeProducts.allowBackorders,
        })
        .from(storeProducts)
        .where(eq(storeProducts.id, component.componentProductId))
        .limit(1);

      if (!product) return false;
      if (!product.trackInventory || product.allowBackorders) continue;
      if ((product.stockQuantity ?? 0) < requiredQty) return false;
    }
  }

  return true;
}

// ─── Calculate Bundle Price ───────────────────────────────────────────────

export async function calculateBundlePrice(bundleProductId: string): Promise<number> {
  // If the bundle product has its own price set, use that (fixed pricing)
  const [bundle] = await db
    .select({ priceCents: storeProducts.priceCents })
    .from(storeProducts)
    .where(eq(storeProducts.id, bundleProductId))
    .limit(1);

  if (bundle?.priceCents) return bundle.priceCents;

  // Otherwise sum component prices * quantities
  const components = await getBundleComponents(bundleProductId);

  return components.reduce((sum, c) => sum + (c.priceCents ?? 0) * c.quantity, 0);
}

// ─── Deduct Bundle Inventory ──────────────────────────────────────────────

export async function deductBundleInventory(
  bundleProductId: string,
  orderQuantity: number,
): Promise<void> {
  const components = await db
    .select({
      componentProductId: storeBundleItems.componentProductId,
      componentVariantId: storeBundleItems.componentVariantId,
      quantity: storeBundleItems.quantity,
    })
    .from(storeBundleItems)
    .where(eq(storeBundleItems.bundleProductId, bundleProductId))
    .limit(100);

  for (const component of components) {
    const deductQty = component.quantity * orderQuantity;

    if (component.componentVariantId) {
      await db.update(storeProductVariants)
        .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} - ${deductQty}` })
        .where(eq(storeProductVariants.id, component.componentVariantId));
    } else {
      await db.update(storeProducts)
        .set({ stockQuantity: sql`${storeProducts.stockQuantity} - ${deductQty}` })
        .where(eq(storeProducts.id, component.componentProductId));
    }
  }

  logger.info('Bundle inventory deducted', { bundleProductId, orderQuantity, componentCount: components.length });
}

// ─── Restore Bundle Inventory ─────────────────────────────────────────────

export async function restoreBundleInventory(
  bundleProductId: string,
  orderQuantity: number,
): Promise<void> {
  const components = await db
    .select({
      componentProductId: storeBundleItems.componentProductId,
      componentVariantId: storeBundleItems.componentVariantId,
      quantity: storeBundleItems.quantity,
    })
    .from(storeBundleItems)
    .where(eq(storeBundleItems.bundleProductId, bundleProductId))
    .limit(100);

  for (const component of components) {
    const restoreQty = component.quantity * orderQuantity;

    if (component.componentVariantId) {
      await db.update(storeProductVariants)
        .set({ stockQuantity: sql`${storeProductVariants.stockQuantity} + ${restoreQty}` })
        .where(eq(storeProductVariants.id, component.componentVariantId));
    } else {
      await db.update(storeProducts)
        .set({ stockQuantity: sql`${storeProducts.stockQuantity} + ${restoreQty}` })
        .where(eq(storeProducts.id, component.componentProductId));
    }
  }

  logger.info('Bundle inventory restored', { bundleProductId, orderQuantity, componentCount: components.length });
}
