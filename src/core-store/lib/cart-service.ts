import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { storeCarts, storeCartItems } from '@/core-store/schema/orders';
import { storeProducts, storeProductVariants } from '@/core-store/schema/products';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('store-cart');

export interface CartWithItems {
  id: string;
  userId: string | null;
  sessionId: string | null;
  currency: string;
  items: CartItemDetail[];
  subtotalCents: number;
  itemCount: number;
}

export interface CartItemDetail {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  image: string | null;
  inStock: boolean;
  productType: string;
  subscriptionPlanId: string | null;
}

/**
 * Get or create a cart for a user or session.
 */
export async function getOrCreateCart(userId: string | null, sessionId: string | null): Promise<string> {
  if (!userId && !sessionId) throw new Error('Either userId or sessionId required');

  // Find existing cart
  const condition = userId
    ? eq(storeCarts.userId, userId)
    : eq(storeCarts.sessionId, sessionId!);

  const [existing] = await db
    .select({ id: storeCarts.id })
    .from(storeCarts)
    .where(condition)
    .limit(1);

  if (existing) return existing.id;

  // Create new cart
  const id = crypto.randomUUID();
  await db.insert(storeCarts).values({
    id,
    userId,
    sessionId,
  });

  return id;
}

/**
 * Merge anonymous cart into user cart on login.
 */
export async function mergeCart(sessionId: string, userId: string): Promise<void> {
  // Find anonymous cart
  const [anonCart] = await db
    .select({ id: storeCarts.id })
    .from(storeCarts)
    .where(eq(storeCarts.sessionId, sessionId))
    .limit(1);

  if (!anonCart) return;

  // Find or create user cart
  const userCartId = await getOrCreateCart(userId, null);

  if (anonCart.id === userCartId) return;

  // Move items from anonymous cart to user cart
  const anonItems = await db
    .select()
    .from(storeCartItems)
    .where(eq(storeCartItems.cartId, anonCart.id))
    .limit(100);

  for (const item of anonItems) {
    // Check if user cart already has this product+variant
    const condition = item.variantId
      ? and(eq(storeCartItems.cartId, userCartId), eq(storeCartItems.productId, item.productId), eq(storeCartItems.variantId, item.variantId))
      : and(eq(storeCartItems.cartId, userCartId), eq(storeCartItems.productId, item.productId));

    const [existing] = await db
      .select({ id: storeCartItems.id, quantity: storeCartItems.quantity })
      .from(storeCartItems)
      .where(condition)
      .limit(1);

    if (existing) {
      // Merge quantities
      await db.update(storeCartItems)
        .set({ quantity: existing.quantity + item.quantity })
        .where(eq(storeCartItems.id, existing.id));
    } else {
      // Move item
      await db.update(storeCartItems)
        .set({ cartId: userCartId })
        .where(eq(storeCartItems.id, item.id));
    }
  }

  // Delete anonymous cart
  await db.delete(storeCarts).where(eq(storeCarts.id, anonCart.id));

  logger.info('Cart merged', { sessionId, userId, itemsMoved: anonItems.length });
}

/**
 * Get cart with enriched item details.
 */
export async function getCartWithItems(cartId: string): Promise<CartWithItems | null> {
  const [cart] = await db
    .select()
    .from(storeCarts)
    .where(eq(storeCarts.id, cartId))
    .limit(1);

  if (!cart) return null;

  const rawItems = await db
    .select({
      id: storeCartItems.id,
      productId: storeCartItems.productId,
      variantId: storeCartItems.variantId,
      quantity: storeCartItems.quantity,
      unitPriceCents: storeCartItems.unitPriceCents,
      productName: storeProducts.name,
      productImage: storeProducts.featuredImage,
      productStock: storeProducts.stockQuantity,
      trackInventory: storeProducts.trackInventory,
      allowBackorders: storeProducts.allowBackorders,
      productType: storeProducts.type,
      subscriptionPlanId: storeProducts.subscriptionPlanId,
    })
    .from(storeCartItems)
    .innerJoin(storeProducts, eq(storeProducts.id, storeCartItems.productId))
    .where(eq(storeCartItems.cartId, cartId))
    .limit(100);

  // Enrich with variant info
  const variantIds = rawItems.map((i) => i.variantId).filter(Boolean) as string[];
  const variants = variantIds.length > 0
    ? await db
        .select({ id: storeProductVariants.id, name: storeProductVariants.name, image: storeProductVariants.image, stockQuantity: storeProductVariants.stockQuantity })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.productId, rawItems[0]?.productId ?? ''))
        .limit(100)
    : [];
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const items: CartItemDetail[] = rawItems.map((item) => {
    const variant = item.variantId ? variantMap.get(item.variantId) : null;
    const stock = variant ? variant.stockQuantity : item.productStock;
    const inStock = !item.trackInventory || item.allowBackorders || (stock ?? 0) >= item.quantity;

    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: variant?.name ?? null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.unitPriceCents * item.quantity,
      image: variant?.image ?? item.productImage,
      inStock,
      productType: item.productType,
      subscriptionPlanId: item.subscriptionPlanId ?? null,
    };
  });

  return {
    id: cart.id,
    userId: cart.userId,
    sessionId: cart.sessionId,
    currency: cart.currency,
    items,
    subtotalCents: items.reduce((sum, i) => sum + i.totalCents, 0),
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}
