/**
 * JSON-LD structured data builder for schema.org Product type.
 * Used by storefront product pages to emit rich results.
 *
 * Follows Google Search Central Product rich results guidelines:
 * - Product: name, description, image, sku, brand, offers, aggregateRating
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductJsonLdInput {
  name: string;
  description: string;
  slug: string;
  image?: string | null;
  priceCents: number | null;
  comparePriceCents?: number | null;
  currency: string;
  sku?: string | null;
  inStock: boolean;
  brand?: string;
  ratingValue?: number | null;
  reviewCount?: number | null;
  siteUrl: string;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Build Product JSON-LD per Google rich results spec */
export function buildProductJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    url: `${input.siteUrl}/store/${input.slug}`,
  };

  if (input.image) data.image = input.image;
  if (input.sku) data.sku = input.sku;
  if (input.brand) data.brand = { '@type': 'Brand', name: input.brand };

  if (input.priceCents != null) {
    const offer: Record<string, unknown> = {
      '@type': 'Offer',
      price: (input.priceCents / 100).toFixed(2),
      priceCurrency: input.currency,
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    };
    if (input.comparePriceCents && input.comparePriceCents > input.priceCents) {
      offer.priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
    data.offers = offer;
  }

  if (input.ratingValue != null && input.reviewCount != null && input.reviewCount > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.ratingValue,
      reviewCount: input.reviewCount,
    };
  }

  return data;
}
