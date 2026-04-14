import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-inventory');

/**
 * Check if a product or variant has dropped below its low stock threshold
 * after an inventory change. Logs a warning when stock is low.
 *
 * Called from order-service after deducting inventory.
 *
 * TODO: Wire to admin notification system once admin userId resolution
 * is available via StoreDeps (e.g. deps.notifyAdmins()).
 */
export async function checkLowStock(
  productId: string,
  variantId?: string,
): Promise<void> {
  try {
    const [product] = await db
      .select({
        name: storeProducts.name,
        trackInventory: storeProducts.trackInventory,
        stockQuantity: storeProducts.stockQuantity,
        lowStockThreshold: storeProducts.lowStockThreshold,
      })
      .from(storeProducts)
      .where(eq(storeProducts.id, productId))
      .limit(1);

    if (!product || !product.trackInventory) {
      return;
    }

    const threshold = product.lowStockThreshold ?? 5;

    if (variantId) {
      const [variant] = await db
        .select({
          name: storeProductVariants.name,
          stockQuantity: storeProductVariants.stockQuantity,
        })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.id, variantId))
        .limit(1);

      if (!variant) return;

      const stock = variant.stockQuantity ?? 0;
      if (stock <= threshold) {
        logger.warn('Low stock alert — variant', {
          productId,
          productName: product.name,
          variantId,
          variantName: variant.name,
          stockQuantity: stock,
          lowStockThreshold: threshold,
        });
      }

      if (stock === 0) {
        logger.warn('Out of stock — variant', {
          productId,
          productName: product.name,
          variantId,
          variantName: variant.name,
        });
      }
    } else {
      const stock = product.stockQuantity ?? 0;
      if (stock <= threshold) {
        logger.warn('Low stock alert — product', {
          productId,
          productName: product.name,
          stockQuantity: stock,
          lowStockThreshold: threshold,
        });
      }

      if (stock === 0) {
        logger.warn('Out of stock — product', {
          productId,
          productName: product.name,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to check low stock', {
      productId,
      variantId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
