import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock drizzle
vi.mock('drizzle-orm', () => ({
  count: vi.fn().mockReturnValue('count'),
}));

// Mock schemas
vi.mock('../schema/products', () => ({
  storeProducts: {},
  storeProductVariants: {},
  storeVariantGroups: {},
  storeProductImages: {},
  storeCategories: {},
  storeProductCategories: {},
}));

vi.mock('../schema/shipping-tax', () => ({
  storeShippingZones: {},
  storeShippingRates: {},
  storeTaxRates: {},
}));

vi.mock('../schema/discount-codes', () => ({
  storeDiscountCodes: {},
}));

vi.mock('../schema/reviews', () => ({
  storeReviews: {},
}));

vi.mock('../schema/attributes', () => ({
  storeAttributes: {},
  storeProductAttributeValues: {},
}));

vi.mock('../schema/relations', () => ({
  storeRelatedProducts: {},
}));

vi.mock('../lib/placeholder-image', () => ({
  placeholderImage: vi.fn().mockReturnValue('data:image/svg+xml,placeholder'),
}));

import { seedStore, hasStoreData } from '../seed';

describe('seedStore', () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn(),
    }),
  });

  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue([{ count: 0 }]),
  });

  const mockDb = {
    insert: mockInsert,
    select: mockSelect,
  } as unknown as Parameters<typeof seedStore>[0];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts categories, products, variants, images, shipping zones, rates, and tax rates', async () => {
    await seedStore(mockDb, 'superadmin-id');

    // categories, products, product-categories, variant groups,
    // t-shirt variants, hoodie variants, product images, shipping zones,
    // shipping rates, tax rates, discount codes, attributes,
    // product attribute values, related products, reviews = 15 insert calls
    expect(mockInsert).toHaveBeenCalledTimes(15);
  });

  it('returns empty object (no userIds/orgIds created)', async () => {
    const result = await seedStore(mockDb, 'superadmin-id');
    expect(result).toEqual({});
  });
});

describe('hasStoreData', () => {
  it('returns false when count is 0', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue([{ count: 0 }]),
      }),
    } as unknown as Parameters<typeof hasStoreData>[0];

    const result = await hasStoreData(mockDb);
    expect(result).toBe(false);
  });

  it('returns true when count > 0', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue([{ count: 5 }]),
      }),
    } as unknown as Parameters<typeof hasStoreData>[0];

    const result = await hasStoreData(mockDb);
    expect(result).toBe(true);
  });
});
