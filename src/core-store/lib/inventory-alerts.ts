import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-inventory');

/**
 * Check if a product or variant has dropped below its low stock threshold
 * after an inventory change. Logs a warning when stock is low.
 * Triggers back-in-stock notifications when stock is restored.
 *
 * Called from order-service after deducting or restoring inventory.
 *
 * TODO: Wire to admin notification system once admin userId resolution
 * is available via StoreDeps (e.g. deps.notifyAdmins()).
 */
export async function checkLowStock(
  productId: string,
  variantId?: string,
  /** Previous stock quantity before the change (enables transition detection) */
  previousStock?: number,
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
          alert: 'low_stock',
        });
      }

      if (stock === 0) {
        logger.warn('Out of stock — variant', {
          productId,
          productName: product.name,
          variantId,
          variantName: variant.name,
          alert: 'out_of_stock',
        });
      }

      // Back-in-stock: stock was restored from 0 (or unknown) to positive
      if (stock > 0 && previousStock !== undefined && previousStock <= 0) {
        triggerBackInStock(productId, variantId);
      }
    } else {
      const stock = product.stockQuantity ?? 0;

      if (stock <= threshold) {
        logger.warn('Low stock alert — product', {
          productId,
          productName: product.name,
          stockQuantity: stock,
          lowStockThreshold: threshold,
          alert: 'low_stock',
        });
      }

      if (stock === 0) {
        logger.warn('Out of stock — product', {
          productId,
          productName: product.name,
          alert: 'out_of_stock',
        });
      }

      // Back-in-stock: stock was restored from 0 (or unknown) to positive
      if (stock > 0 && previousStock !== undefined && previousStock <= 0) {
        triggerBackInStock(productId);
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

/**
 * Fire-and-forget trigger for back-in-stock notifications.
 * Uses dynamic import to avoid circular dependency with back-in-stock-service.
 */
function triggerBackInStock(productId: string, variantId?: string): void {
  import('./back-in-stock-service')
    .then(({ notifySubscribers }) => notifySubscribers(productId, variantId))
    .then((result) => {
      if (result.notified > 0) {
        logger.info('Back-in-stock notifications sent', {
          productId,
          variantId,
          notified: result.notified,
        });
      }
    })
    .catch((err) => {
      logger.error('Failed to send back-in-stock notifications', {
        productId,
        variantId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
