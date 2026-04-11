import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));

vi.mock('@/core/lib/infra/redis', () => ({ getRedis: vi.fn().mockReturnValue(null) }));
vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));
vi.mock('@/core/lib/api/trpc-rate-limit', () => ({ applyRateLimit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/core/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({ canAccessAdmin: vi.fn().mockReturnValue(true), can: vi.fn().mockReturnValue(true) }),
  },
  Role: { USER: 'user', EDITOR: 'editor', ADMIN: 'admin', SUPERADMIN: 'superadmin' },
}));

vi.mock('@/core/crud/admin-crud', () => ({
  parsePagination: vi.fn().mockImplementation((input: { page?: number; pageSize?: number }) => {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }),
  paginatedResult: vi.fn().mockImplementation(
    (items: unknown[], total: number, page: number, pageSize: number) => ({
      results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
    })
  ),
}));

vi.mock('@/core/lib/content/slug', () => ({
  slugify: vi.fn().mockImplementation((text: string) => text.toLowerCase().replace(/\s+/g, '-')),
}));

// Mock store schemas
vi.mock('@/core-store/schema/products', () => ({
  storeProducts: { id: 'store_products.id', name: 'store_products.name', slug: 'store_products.slug', status: 'store_products.status', type: 'store_products.type', priceCents: 'store_products.price_cents', comparePriceCents: 'store_products.compare_price_cents', currency: 'store_products.currency', featuredImage: 'store_products.featured_image', shortDescription: 'store_products.short_description', deletedAt: 'store_products.deleted_at', createdAt: 'store_products.created_at', stockQuantity: 'store_products.stock_quantity', trackInventory: 'store_products.track_inventory', digitalFileUrl: 'store_products.digital_file_url', downloadLimit: 'store_products.download_limit' },
  storeProductVariants: { id: 'store_product_variants.id', productId: 'store_product_variants.product_id', priceCents: 'store_product_variants.price_cents', sortOrder: 'store_product_variants.sort_order', sku: 'store_product_variants.sku', stockQuantity: 'store_product_variants.stock_quantity', name: 'store_product_variants.name', image: 'store_product_variants.image' },
  storeVariantGroups: { id: 'id', productId: 'product_id', sortOrder: 'sort_order' },
  storeProductImages: { id: 'id', productId: 'product_id', sortOrder: 'sort_order' },
  storeCategories: { id: 'id', slug: 'slug', sortOrder: 'sort_order' },
  storeProductCategories: { productId: 'product_id', categoryId: 'category_id' },
}));

vi.mock('@/core-store/schema/orders', () => ({
  storeOrders: { id: 'id', userId: 'user_id', orderNumber: 'order_number', status: 'status', totalCents: 'total_cents', currency: 'currency', createdAt: 'created_at' },
  storeOrderItems: { id: 'id', orderId: 'order_id' },
  storeOrderEvents: { id: 'id', orderId: 'order_id', createdAt: 'created_at' },
  storeDownloads: { id: 'id', orderId: 'order_id', token: 'token', userId: 'user_id', downloadCount: 'download_count', downloadLimit: 'download_limit', expiresAt: 'expires_at', fileUrl: 'file_url' },
  storeCarts: { id: 'id', userId: 'user_id', sessionId: 'session_id' },
  storeCartItems: { id: 'id', cartId: 'cart_id', productId: 'product_id', variantId: 'variant_id', quantity: 'quantity', unitPriceCents: 'unit_price_cents' },
  storeAddresses: { id: 'id' },
}));

vi.mock('@/core-store/schema/shipping-tax', () => ({
  storeShippingZones: { id: 'id' },
  storeShippingRates: { id: 'id', zoneId: 'zone_id', isActive: 'is_active', sortOrder: 'sort_order' },
  storeTaxRates: { id: 'id', country: 'country', taxClass: 'tax_class', isActive: 'is_active' },
  storeSettings: { key: 'key' },
}));

// ─── UUIDs ──────────────────────────────────────────────────────────────────
const PROD_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ORDER_ID = 'b1b1b1b1-c2c2-4d3d-8e4e-f5f5f5f5f5f5';
const RATE_ID = 'c2c2c2c2-d3d3-4e4e-8f5f-a6a6a6a6a6a6';
const CART_ID = 'd3d3d3d3-e4e4-4f5f-8a6a-b7b7b7b7b7b7';
const ITEM_ID = 'e4e4e4e4-f5f5-4a6a-8b7b-c8c8c8c8c8c8';
const VARIANT_ID = 'f5f5f5f5-a6a6-4b7b-8c8c-d9d9d9d9d9d9';
const _CAT_ID = '11111111-2222-4333-8444-555555555555';
const DL_TOKEN = '22222222-3333-4444-8555-666666666666';

// ─── Service mocks ──────���───────────────────────────────────────────────────

const mockGetOrCreateCart = vi.fn().mockResolvedValue(CART_ID);
const mockGetCartWithItems = vi.fn().mockResolvedValue({
  id: CART_ID, userId: 'user-1', sessionId: null, currency: 'EUR',
  items: [{ id: ITEM_ID, productId: PROD_ID, variantId: null, productName: 'Test Product', variantName: null, quantity: 2, unitPriceCents: 1000, totalCents: 2000, image: null, inStock: true }],
  subtotalCents: 2000, itemCount: 2,
});
const mockMergeCart = vi.fn().mockResolvedValue(undefined);

vi.mock('@/core-store/lib/cart-service', () => ({
  getOrCreateCart: (...args: unknown[]) => mockGetOrCreateCart(...args),
  getCartWithItems: (...args: unknown[]) => mockGetCartWithItems(...args),
  mergeCart: (...args: unknown[]) => mockMergeCart(...args),
}));

vi.mock('@/core-store/lib/tax-service', () => ({
  calculateTax: vi.fn().mockResolvedValue({ taxCents: 420, rate: 21, name: 'VAT 21%', priceIncludesTax: true, reverseCharge: false }),
  calculateOrderTax: vi.fn().mockResolvedValue({ totalTaxCents: 420, lineItemTax: [{ taxCents: 420, rate: 21, name: 'VAT 21%', priceIncludesTax: true, reverseCharge: false }] }),
}));

const mockGetShippingOptions = vi.fn().mockResolvedValue([
  { rateId: RATE_ID, zoneName: 'EU', name: 'Standard', rateCents: 500, estimatedDays: '3-5' },
]);
vi.mock('@/core-store/lib/shipping-service', () => ({
  getShippingOptions: (...args: unknown[]) => mockGetShippingOptions(...args),
}));

const mockCreateOrder = vi.fn().mockResolvedValue({ orderId: ORDER_ID, orderNumber: 'ORD-20260406-0001' });
const mockUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
const mockAssignInvoiceNumber = vi.fn().mockResolvedValue('INV-2026-00001');

vi.mock('@/core-store/lib/order-service', () => ({
  createOrder: (...args: unknown[]) => mockCreateOrder(...args),
  updateOrderStatus: (...args: unknown[]) => mockUpdateOrderStatus(...args),
  assignInvoiceNumber: (...args: unknown[]) => mockAssignInvoiceNumber(...args),
}));

const mockStoreDeps = {
  createPaymentCheckout: vi.fn().mockResolvedValue('https://checkout.stripe.com/pay/xxx'),
  sendNotification: vi.fn(),
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
};
vi.mock('@/core-store/deps', () => ({
  getStoreDeps: () => mockStoreDeps,
  setStoreDeps: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { storeProductsRouter } from '@/core-store/routers/products';
import { storeCartRouter } from '@/core-store/routers/cart';
import { storeCheckoutRouter } from '@/core-store/routers/checkout';
import { storeOrdersRouter } from '@/core-store/routers/orders';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thenable(data: unknown, extra: Record<string, unknown> = {}) {
  return { then: (r: (v: unknown) => void, e?: (v: unknown) => void) => Promise.resolve(data).then(r, e), ...extra };
}

function createSelectChain(data: unknown) {
  const limitMock = vi.fn().mockResolvedValue(data);
  const offsetMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const whereMock = vi.fn().mockReturnValue(thenable(data, { orderBy: orderByMock, limit: limitMock, offset: offsetMock }));
  const innerJoinMock = vi.fn().mockReturnValue(thenable(data, { where: whereMock, orderBy: orderByMock, limit: limitMock }));
  const fromMock = vi.fn().mockReturnValue(thenable(data, { where: whereMock, orderBy: orderByMock, limit: limitMock, offset: offsetMock, innerJoin: innerJoinMock, leftJoin: innerJoinMock }));
  return { from: fromMock, where: whereMock, orderBy: orderByMock, limit: limitMock, offset: offsetMock };
}

function createCtx(overrides: Record<string, unknown> = {}) {
  const selectChain = createSelectChain([]);
  return {
    session: { user: { id: 'user-1', email: 'test@test.com', role: 'admin' }, session: { id: 'session-1' } },
    headers: new Headers(),
    db: {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
      delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    },
    ...overrides,
  };
}

function createPublicCtx(overrides: Record<string, unknown> = {}) {
  return createCtx({ session: null, ...overrides });
}

const SHIPPING_ADDRESS = {
  firstName: 'John', lastName: 'Doe',
  address1: '123 Main St', city: 'Berlin', postalCode: '10115', country: 'DE',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('storeProductsRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── Admin CRUD ───────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a product with slug', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'Test Product', priceCents: 2999 });

      expect(result.id).toBeDefined();
      expect(result.slug).toBe('test-product');
      expect(ctx.db.insert).toHaveBeenCalled();
    });

    it('creates a digital product', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.create({
        name: 'E-Book', type: 'digital', priceCents: 999,
        digitalFileUrl: 'https://files.example.com/ebook.pdf', downloadLimit: 3,
      });

      expect(result.slug).toBe('e-book');
    });

    it('creates a variable product', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.create({ name: 'T-Shirt', type: 'variable' });

      expect(result.slug).toBe('t-shirt');
    });
  });

  describe('update', () => {
    it('updates product fields', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      await caller.update({ id: PROD_ID, name: 'Updated Name', status: 'published', priceCents: 3999 });

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft deletes a product', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      await caller.delete({ id: PROD_ID });

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  // ─── Public ────���──────────────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated published products', async () => {
      const ctx = createPublicCtx();
      const mockProducts = [{ id: PROD_ID, name: 'Product 1', slug: 'product-1' }];
      const chain = createSelectChain(mockProducts);
      ctx.db.select = vi.fn()
        .mockReturnValueOnce(chain)
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.list({ page: 1, pageSize: 20 });

      expect(result).toBeDefined();
    });

    it('accepts search and sort parameters', async () => {
      const ctx = createPublicCtx();
      ctx.db.select = vi.fn()
        .mockReturnValue(createSelectChain([]));

      const caller = storeProductsRouter.createCaller(ctx as never);
      await caller.list({ search: 'test', sort: 'price_asc' });
      // No error = params accepted
    });
  });

  describe('getBySlug', () => {
    it('throws NOT_FOUND for missing product', async () => {
      const ctx = createPublicCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeProductsRouter.createCaller(ctx as never);
      await expect(caller.getBySlug({ slug: 'nonexistent' })).rejects.toThrow('Product not found');
    });
  });

  // ─── Variants ────��────────────────────────────────────────────────────

  describe('addVariant', () => {
    it('creates a variant', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.addVariant({
        productId: PROD_ID, name: 'Small / Red', priceCents: 2999,
        options: { Size: 'S', Color: 'Red' },
      });

      expect(result.id).toBeDefined();
      expect(ctx.db.insert).toHaveBeenCalled();
    });
  });

  describe('updateVariant', () => {
    it('updates variant fields', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      await caller.updateVariant({ id: VARIANT_ID, priceCents: 3499, stockQuantity: 50 });

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  describe('deleteVariant', () => {
    it('deletes a variant', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      await caller.deleteVariant({ id: VARIANT_ID });

      expect(ctx.db.delete).toHaveBeenCalled();
    });
  });

  // ─── Categories ───���───────────────────────────────────────────────────

  describe('createCategory', () => {
    it('creates a category with slug', async () => {
      const ctx = createCtx();
      const caller = storeProductsRouter.createCaller(ctx as never);
      const result = await caller.createCategory({ name: 'Electronics' });

      expect(result.slug).toBe('electronics');
      expect(ctx.db.insert).toHaveBeenCalled();
    });
  });
});

// =========================================================================
// Cart Router
// =========================================================================

describe('storeCartRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('get', () => {
    it('returns empty cart when no user or session', async () => {
      const ctx = createPublicCtx();
      const caller = storeCartRouter.createCaller(ctx as never);
      const result = await caller.get({});

      expect(result.items).toEqual([]);
      expect(result.subtotalCents).toBe(0);
    });

    it('returns cart for logged-in user', async () => {
      const ctx = createCtx();
      const caller = storeCartRouter.createCaller(ctx as never);
      const result = await caller.get({});

      expect(mockGetOrCreateCart).toHaveBeenCalledWith('user-1', null);
      expect(result.subtotalCents).toBe(2000);
    });

    it('returns cart for anonymous session', async () => {
      const ctx = createPublicCtx();
      const caller = storeCartRouter.createCaller(ctx as never);
      const _result = await caller.get({ sessionId: 'anon-123' });

      expect(mockGetOrCreateCart).toHaveBeenCalledWith(null, 'anon-123');
    });
  });

  describe('addItem', () => {
    it('adds item to cart for logged-in user', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(
        createSelectChain([{ id: PROD_ID, priceCents: 1000, status: 'published', type: 'simple' }])
      );

      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.addItem({ productId: PROD_ID, quantity: 1 });

      expect(mockGetOrCreateCart).toHaveBeenCalledWith('user-1', null);
    });

    it('requires sessionId for anonymous users', async () => {
      const ctx = createPublicCtx();
      const caller = storeCartRouter.createCaller(ctx as never);

      await expect(
        caller.addItem({ productId: PROD_ID, quantity: 1 })
      ).rejects.toThrow('Session ID required');
    });

    it('throws NOT_FOUND for unpublished product', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(
        createSelectChain([{ id: PROD_ID, priceCents: 1000, status: 'draft', type: 'simple' }])
      );

      const caller = storeCartRouter.createCaller(ctx as never);
      await expect(
        caller.addItem({ productId: PROD_ID, quantity: 1 })
      ).rejects.toThrow('Product not found');
    });

    it('adds item with variant', async () => {
      const ctx = createCtx();
      // First select: product, second select: variant, third select: existing cart item check
      let callCount = 0;
      ctx.db.select = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createSelectChain([{ id: PROD_ID, priceCents: 1000, status: 'published', type: 'variable' }]);
        if (callCount === 2) return createSelectChain([{ priceCents: 1500 }]);
        return createSelectChain([]);
      });

      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.addItem({ productId: PROD_ID, variantId: VARIANT_ID, quantity: 1 });

      expect(ctx.db.insert).toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('removes item when quantity is 0', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ cartId: CART_ID }]));

      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.updateItem({ itemId: ITEM_ID, quantity: 0 });

      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('updates quantity when > 0', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ cartId: CART_ID }]));

      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.updateItem({ itemId: ITEM_ID, quantity: 5 });

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it('removes item from cart', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ cartId: CART_ID }]));

      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.removeItem({ itemId: ITEM_ID });

      expect(ctx.db.delete).toHaveBeenCalled();
    });
  });

  describe('merge', () => {
    it('merges anonymous cart into user cart', async () => {
      const ctx = createCtx();
      const caller = storeCartRouter.createCaller(ctx as never);
      await caller.merge({ sessionId: 'anon-123' });

      expect(mockMergeCart).toHaveBeenCalledWith('anon-123', 'user-1');
    });

    it('requires authentication', async () => {
      const ctx = createPublicCtx();
      const caller = storeCartRouter.createCaller(ctx as never);

      await expect(caller.merge({ sessionId: 'anon-123' })).rejects.toThrow('Login required');
    });
  });
});

// =========================================================================
// Checkout Router
// =========================================================================

describe('storeCheckoutRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getShippingOptions', () => {
    it('returns shipping options for country', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      const result = await caller.getShippingOptions({ country: 'DE' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Standard');
    });

    it('returns empty when no cart', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      const result = await caller.getShippingOptions({ country: 'DE' });

      expect(result).toEqual([]);
    });
  });

  describe('calculateTotals', () => {
    it('calculates totals with tax and shipping', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      const result = await caller.calculateTotals({ country: 'DE', shippingRateId: RATE_ID });

      expect(result.subtotalCents).toBe(2000);
      expect(result.taxCents).toBe(420);
      expect(result.shippingCents).toBe(500);
      expect(result.totalCents).toBe(2920);
    });

    it('calculates totals without shipping', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      const result = await caller.calculateTotals({ country: 'DE' });

      expect(result.shippingCents).toBe(0);
      expect(result.totalCents).toBe(2420);
    });

    it('throws when cart is empty', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      await expect(caller.calculateTotals({ country: 'DE' })).rejects.toThrow('Cart is empty');
    });
  });

  describe('placeOrder', () => {
    it('creates order, generates invoice, returns checkout URL', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      const result = await caller.placeOrder({ shippingAddress: SHIPPING_ADDRESS, paymentProviderId: 'stripe' });

      expect(result.orderId).toBe(ORDER_ID);
      expect(result.orderNumber).toBe('ORD-20260406-0001');
      expect(result.invoiceNumber).toBe('INV-2026-00001');
      expect(result.checkoutUrl).toContain('stripe.com');
      expect(mockCreateOrder).toHaveBeenCalled();
      expect(mockAssignInvoiceNumber).toHaveBeenCalledWith(ORDER_ID);
      expect(mockStoreDeps.createPaymentCheckout).toHaveBeenCalled();
      // Cart cleared
      expect(ctx.db.delete).toHaveBeenCalled();
    });

    it('rejects when items are out of stock', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));
      mockGetCartWithItems.mockResolvedValueOnce({
        id: CART_ID, userId: 'user-1', sessionId: null, currency: 'EUR',
        items: [{ id: ITEM_ID, productId: PROD_ID, variantId: null, productName: 'Sold Out', variantName: null, quantity: 1, unitPriceCents: 1000, totalCents: 1000, image: null, inStock: false }],
        subtotalCents: 1000, itemCount: 1,
      });

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      await expect(
        caller.placeOrder({ shippingAddress: SHIPPING_ADDRESS })
      ).rejects.toThrow('Out of stock: Sold Out');
    });

    it('rejects when cart is empty', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      await expect(
        caller.placeOrder({ shippingAddress: SHIPPING_ADDRESS })
      ).rejects.toThrow('Cart is empty');
    });

    it('uses billing address when provided', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([{ id: CART_ID }]));

      const billingAddress = { ...SHIPPING_ADDRESS, firstName: 'Jane' };

      const caller = storeCheckoutRouter.createCaller(ctx as never);
      await caller.placeOrder({ shippingAddress: SHIPPING_ADDRESS, billingAddress });

      const orderParams = mockCreateOrder.mock.calls[0][0];
      expect(orderParams.billingAddress.firstName).toBe('Jane');
      expect(orderParams.shippingAddress.firstName).toBe('John');
    });
  });
});

// =========================================================================
// Orders Router
// =========================================================================

describe('storeOrdersRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('myOrders', () => {
    it('returns paginated user orders', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn()
        .mockReturnValueOnce(createSelectChain([{ id: ORDER_ID, orderNumber: 'ORD-001', status: 'processing' }]))
        .mockReturnValueOnce(createSelectChain([{ count: 1 }]));

      const caller = storeOrdersRouter.createCaller(ctx as never);
      const result = await caller.myOrders({});

      expect(result).toBeDefined();
    });
  });

  describe('myOrderDetail', () => {
    it('throws NOT_FOUND for other user order', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeOrdersRouter.createCaller(ctx as never);
      await expect(caller.myOrderDetail({ id: ORDER_ID })).rejects.toThrow('Order not found');
    });
  });

  describe('getDownload', () => {
    it('throws NOT_FOUND for invalid token', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(createSelectChain([]));

      const caller = storeOrdersRouter.createCaller(ctx as never);
      await expect(caller.getDownload({ token: DL_TOKEN })).rejects.toThrow('Download not found');
    });
  });

  describe('updateStatus (admin)', () => {
    it('updates status and notifies customer', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(
        createSelectChain([{ userId: 'user-1', orderNumber: 'ORD-001' }])
      );

      const caller = storeOrdersRouter.createCaller(ctx as never);
      await caller.updateStatus({ orderId: ORDER_ID, status: 'shipped', trackingNumber: 'TRACK123' });

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        ORDER_ID, 'shipped', 'user-1', undefined,
        expect.objectContaining({ trackingNumber: 'TRACK123' }),
      );
      expect(mockStoreDeps.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', title: expect.stringContaining('shipped') }),
      );
    });

    it('sends notification with note', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn().mockReturnValue(
        createSelectChain([{ userId: 'user-1', orderNumber: 'ORD-001' }])
      );

      const caller = storeOrdersRouter.createCaller(ctx as never);
      await caller.updateStatus({ orderId: ORDER_ID, status: 'delivered', note: 'Left at door' });

      expect(mockStoreDeps.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Left at door' }),
      );
    });
  });

  describe('addNote (admin)', () => {
    it('adds admin note to order', async () => {
      const ctx = createCtx();
      const caller = storeOrdersRouter.createCaller(ctx as never);
      await caller.addNote({ orderId: ORDER_ID, note: 'Customer called about delivery' });

      expect(ctx.db.update).toHaveBeenCalled();
    });
  });

  describe('adminList', () => {
    it('returns paginated orders with filters', async () => {
      const ctx = createCtx();
      ctx.db.select = vi.fn()
        .mockReturnValueOnce(createSelectChain([]))
        .mockReturnValueOnce(createSelectChain([{ count: 0 }]));

      const caller = storeOrdersRouter.createCaller(ctx as never);
      const result = await caller.adminList({ status: 'processing', page: 1, pageSize: 10 });

      expect(result).toBeDefined();
    });
  });
});
