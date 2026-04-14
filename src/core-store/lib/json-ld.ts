/**
 * JSON-LD structured data builders for store pages.
 * Extends the simple product-json-ld.ts with full variant + review support,
 * and adds a store-aware BreadcrumbList builder.
 *
 * Follows Google Search Central Product rich results guidelines:
 * - Product: name, description, image, sku, brand, offers (multi-variant), aggregateRating
 * - BreadcrumbList: Home > Store > Category > Product
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductVariantInput {
  name: string;
  priceCents: number;
  currency: string;
  sku?: string | null;
  inStock: boolean;
  image?: string | null;
}

interface ReviewSummary {
  averageRating: number;
  reviewCount: number;
}

interface CategoryInput {
  name: string;
  slug: string;
}

interface ProductInput {
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  featuredImage?: string | null;
  sku?: string | null;
  priceCents?: number | null;
  currency: string;
  inStock: boolean;
  /** Brand extracted from product attributes */
  brand?: string | null;
}

// ---------------------------------------------------------------------------
// Product JSON-LD
// ---------------------------------------------------------------------------

/**
 * Build a full Product JSON-LD object with multi-variant offers
 * and aggregate rating from reviews.
 */
export function buildProductJsonLd(params: {
  product: ProductInput;
  variants?: ProductVariantInput[];
  reviews?: ReviewSummary | null;
  siteUrl: string;
  categories?: CategoryInput[];
}): Record<string, unknown> {
  const { product, variants, reviews, siteUrl, categories } = params;

  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: `${siteUrl}/store/${product.slug}`,
  };

  const description = product.description ?? product.shortDescription;
  if (description) data.description = description;

  if (product.featuredImage) data.image = product.featuredImage;
  if (product.sku) data.sku = product.sku;
  if (product.brand) data.brand = { '@type': 'Brand', name: product.brand };

  if (categories?.length) {
    data.category = categories.map((c) => c.name).join(' > ');
  }

  // --- Offers ---
  if (variants && variants.length > 0) {
    const offers = variants.map((v) => buildOffer(v, siteUrl, product.slug));
    data.offers = offers.length === 1 ? offers[0] : offers;
  } else if (product.priceCents != null) {
    data.offers = {
      '@type': 'Offer',
      price: centsToPrice(product.priceCents),
      priceCurrency: product.currency,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${siteUrl}/store/${product.slug}`,
    };
  }

  // --- Aggregate Rating ---
  if (reviews && reviews.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviews.averageRating,
      reviewCount: reviews.reviewCount,
    };
  }

  return data;
}

// ---------------------------------------------------------------------------
// Store Breadcrumb JSON-LD
// ---------------------------------------------------------------------------

/**
 * Build a BreadcrumbList JSON-LD for store pages.
 * Pattern: Home > Store > Category (optional) > Product (optional)
 */
export function buildStoreBreadcrumbJsonLd(params: {
  siteUrl: string;
  category?: CategoryInput | null;
  product?: { name: string; slug: string } | null;
}): Record<string, unknown> {
  const { siteUrl, category, product } = params;

  const items: Array<{ name: string; url: string }> = [
    { name: 'Home', url: siteUrl },
    { name: 'Store', url: `${siteUrl}/store` },
  ];

  if (category) {
    items.push({
      name: category.name,
      url: `${siteUrl}/store/category/${category.slug}`,
    });
  }

  if (product) {
    items.push({
      name: product.name,
      url: `${siteUrl}/store/${product.slug}`,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function buildOffer(
  variant: ProductVariantInput,
  siteUrl: string,
  productSlug: string,
): Record<string, unknown> {
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    name: variant.name,
    price: centsToPrice(variant.priceCents),
    priceCurrency: variant.currency,
    availability: variant.inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    url: `${siteUrl}/store/${productSlug}`,
  };

  if (variant.sku) offer.sku = variant.sku;
  if (variant.image) offer.image = variant.image;

  return offer;
}
