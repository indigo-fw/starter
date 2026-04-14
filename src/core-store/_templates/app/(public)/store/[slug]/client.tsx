'use client';

import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Loader2, Package, ChevronRight, Truck, Download, Shield, ArrowLeft } from 'lucide-react';
import { formatPrice } from '@/core-store/lib/store-utils';
import { ProductGallery } from '@/core-store/components/product/ProductGallery';
import { VariantSelector } from '@/core-store/components/product/VariantSelector';
import { AddToCartForm } from '@/core-store/components/cart/AddToCartForm';
import { WishlistButton } from '@/core-store/components/product/WishlistButton';
import { StarRating } from '@/core-store/components/product/StarRating';
import { ReviewForm } from '@/core-store/components/product/ReviewForm';
import '@/core-store/components/product/store-detail.css';
import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/product/WishlistButton.css';
import '@/core-store/components/product/store-reviews.css';

export function StoreProductDetailClient() {
  const __ = useBlankTranslations();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: product, isLoading, error } = trpc.storeProducts.getBySlug.useQuery(
    { slug },
    { enabled: !!slug },
  );

  const [selections, setSelections] = useState<Record<string, string>>({});

  // Build option groups from variant groups + variants
  const optionGroups = useMemo(() => {
    if (!product || product.type !== 'variable') return [];

    return product.variantGroups.map((group) => {
      const values = new Set<string>();
      for (const variant of product.variants) {
        const val = (variant.options as Record<string, string>)?.[group.name];
        if (val) values.add(val);
      }
      return { name: group.name, values: [...values] };
    });
  }, [product]);

  // Initialize selections from default variant
  const defaultVariant = useMemo(() => {
    if (!product) return null;
    return product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;
  }, [product]);

  // Set default selections once
  useEffect(() => {
    if (defaultVariant && Object.keys(selections).length === 0) {
      const opts = defaultVariant.options as Record<string, string> | null;
      if (opts) setSelections(opts);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVariant]);

  // Find matching variant based on current selections
  const selectedVariant = useMemo(() => {
    if (!product || product.type !== 'variable') return null;

    return product.variants.find((v) => {
      const opts = v.options as Record<string, string> | null;
      if (!opts) return false;
      return Object.entries(selections).every(([k, val]) => opts[k] === val);
    }) ?? null;
  }, [product, selections]);

  // Effective price (variant overrides product price)
  const currentPrice = selectedVariant?.priceCents ?? product?.priceCents ?? null;
  const comparePrice = selectedVariant?.comparePriceCents ?? product?.comparePriceCents ?? null;
  const currency = product?.currency ?? 'EUR';

  const discountPercent = useMemo(() => {
    if (!comparePrice || !currentPrice || comparePrice <= currentPrice) return null;
    return Math.round(((comparePrice - currentPrice) / comparePrice) * 100);
  }, [currentPrice, comparePrice]);

  // Rating
  const { data: ratingData } = trpc.storeReviews.getProductRating.useQuery(
    { productId: product?.id ?? '' },
    { enabled: !!product },
  );

  // Reviews
  const [reviewPage, setReviewPage] = useState(1);
  const { data: reviewsData } = trpc.storeReviews.listByProduct.useQuery(
    { productId: product?.id ?? '', page: reviewPage, pageSize: 5 },
    { enabled: !!product },
  );

  // Related products — prefer configured relations, fallback to category-based
  const { data: relatedFromRelations } = trpc.storeRelations.getRelated.useQuery(
    { productId: product?.id ?? '', type: 'related', limit: 4 },
    { enabled: !!product },
  );

  const firstCategorySlug = product?.categories?.[0]?.slug;
  const { data: relatedFromCategory } = trpc.storeProducts.list.useQuery(
    { pageSize: 4, categorySlug: firstCategorySlug },
    { enabled: !!product && (!relatedFromRelations || relatedFromRelations.length === 0) },
  );

  const relatedProducts = useMemo(() => {
    // Prefer configured relations, fallback to category-based
    if (relatedFromRelations && relatedFromRelations.length > 0) {
      return relatedFromRelations;
    }
    if (!relatedFromCategory?.results || !product) return [];
    return relatedFromCategory.results.filter((item) => item.id !== product.id).slice(0, 4);
  }, [relatedFromRelations, relatedFromCategory, product]);

  function handleVariantSelect(name: string, value: string) {
    setSelections((prev) => ({ ...prev, [name]: value }));
  }

  // ── Loading state ──

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  // ── Not found state ──

  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Package className="h-12 w-12" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          {__('Product not found')}
        </h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {__('The product you are looking for does not exist or has been removed.')}
        </p>
        <Link
          href="/store"
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--color-brand-500)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          {__('Back to Store')}
        </Link>
      </div>
    );
  }

  const isDigital = product.type === 'digital';
  const isVariable = product.type === 'variable';

  // Stock status for current variant
  const stockQty = selectedVariant?.stockQuantity ?? product.stockQuantity;
  const isOutOfStock = product.trackInventory && stockQty != null && stockQty <= 0;

  return (
    <>
      {/* ── Breadcrumb ── */}
      <nav className="store-breadcrumb">
        <Link href="/store">{__('Store')}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {product.categories?.[0] && (
          <>
            <Link href={`/store?category=${product.categories[0].slug}`}>
              {product.categories[0].name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span>{product.name}</span>
      </nav>

      {/* ── Main detail grid ── */}
      <div className="product-detail">
        {/* Left: Gallery */}
        <ProductGallery
          featuredImage={product.featuredImage}
          images={product.images.map((img) => ({ url: img.url, alt: img.alt ?? null }))}
          productName={product.name}
        />

        {/* Right: Info panel */}
        <div className="product-info" style={{ position: 'sticky', top: '2rem', alignSelf: 'start' }}>
          {/* Digital badge */}
          {isDigital && (
            <span className="product-type-badge product-type-badge-digital">
              <Download className="h-3.5 w-3.5" />
              {__('Digital Product')}
            </span>
          )}

          {/* Title */}
          <div className="flex items-start justify-between gap-2">
            <h1 className="product-info-title">{product.name}</h1>
            <WishlistButton productId={product.id} />
          </div>

          {/* Price */}
          <div className="product-info-price">
            <span className="product-info-price-current">
              {formatPrice(currentPrice, currency)}
            </span>
            {comparePrice && comparePrice > (currentPrice ?? 0) && (
              <span className="product-info-price-compare">
                {formatPrice(comparePrice, currency)}
              </span>
            )}
            {discountPercent && (
              <span className="product-info-discount">-{discountPercent}%</span>
            )}
          </div>

          {/* Star rating */}
          {ratingData && ratingData.totalReviews > 0 && (
            <StarRating rating={ratingData.averageRating} totalReviews={ratingData.totalReviews} size="md" />
          )}

          {/* Short description */}
          {product.shortDescription && (
            <p className="product-info-description">{product.shortDescription}</p>
          )}

          {/* Stock status */}
          {product.trackInventory && (
            <p
              className="text-sm font-medium"
              style={{ color: isOutOfStock ? 'var(--color-danger-600)' : 'var(--color-success-600)' }}
            >
              {isOutOfStock
                ? __('Out of stock')
                : stockQty != null && stockQty <= 5
                  ? __('Only %d left in stock').replace('%d', String(stockQty))
                  : __('In stock')}
            </p>
          )}

          {/* Variant selector */}
          {isVariable && optionGroups.length > 0 && (
            <VariantSelector
              optionGroups={optionGroups}
              selections={selections}
              onSelect={handleVariantSelect}
            />
          )}

          {/* Add to cart */}
          <AddToCartForm
            productId={product.id}
            variantId={selectedVariant?.id}
            disabled={isOutOfStock || (isVariable && !selectedVariant)}
          />

          {/* Product meta */}
          <div className="product-meta-list">
            {(selectedVariant?.sku ?? product.sku) && (
              <span>
                <Package className="h-3.5 w-3.5" />
                {__('SKU')}: {selectedVariant?.sku ?? product.sku}
              </span>
            )}
            {!isDigital && product.weightGrams != null && product.weightGrams > 0 && (
              <span>
                <Package className="h-3.5 w-3.5" />
                {__('Weight')}: {product.weightGrams}g
              </span>
            )}
            {isDigital ? (
              <>
                <span>
                  <Download className="h-3.5 w-3.5" />
                  {__('Digital download')}
                </span>
                {product.downloadLimit != null && (
                  <span>
                    <Shield className="h-3.5 w-3.5" />
                    {__('Download limit')}: {product.downloadLimit}
                  </span>
                )}
              </>
            ) : product.requiresShipping ? (
              <span>
                <Truck className="h-3.5 w-3.5" />
                {__('Shipping required')}
              </span>
            ) : (
              <span>
                <Truck className="h-3.5 w-3.5" />
                {__('Free shipping')}
              </span>
            )}
          </div>

          {/* Expandable sections */}
          {product.description && (
            <details className="product-description-full" open>
              <summary className="product-description-heading" style={{ cursor: 'pointer', listStyle: 'none' }}>
                {__('Description')}
              </summary>
              <div
                className="product-info-description"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            </details>
          )}

          {!isDigital && product.requiresShipping && (
            <details className="product-description-full">
              <summary className="product-description-heading" style={{ cursor: 'pointer', listStyle: 'none' }}>
                {__('Shipping Information')}
              </summary>
              <p className="product-info-description">
                {__('This product requires shipping. Shipping costs are calculated at checkout based on your location.')}
              </p>
            </details>
          )}
        </div>
      </div>

      {/* ── Related products ── */}
      {relatedProducts.length > 0 && (
        <section style={{ marginTop: '4rem' }}>
          <h2
            className="product-description-heading"
            style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}
          >
            {__('You may also like')}
          </h2>
          <div className="store-grid">
            {relatedProducts.map((item: { id: string; slug: string; name: string; featuredImage: string | null; priceCents: number | null; comparePriceCents: number | null; currency: string; shortDescription?: string | null }) => (
              <Link key={item.id} href={`/store/${item.slug}`} className="product-card">
                <div className="product-card-image">
                  {item.featuredImage ? (
                    <Image
                      src={item.featuredImage}
                      alt={item.name}
                      width={400}
                      height={500}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="product-card-image-placeholder">
                      <Package className="h-10 w-10" />
                    </div>
                  )}
                  {item.comparePriceCents && item.comparePriceCents > (item.priceCents ?? 0) && (
                    <div className="product-card-badges">
                      <span className="product-card-badge product-card-badge-sale">
                        {__('Sale')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="product-card-body">
                  <span className="product-card-name">{item.name}</span>
                  {item.shortDescription && (
                    <span className="product-card-desc">{item.shortDescription}</span>
                  )}
                  <div className="product-card-footer">
                    <span className="product-card-price">
                      {formatPrice(item.priceCents, item.currency ?? 'EUR')}
                    </span>
                    {item.comparePriceCents && item.comparePriceCents > (item.priceCents ?? 0) && (
                      <span className="product-card-compare-price">
                        {formatPrice(item.comparePriceCents, item.currency ?? 'EUR')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Reviews ── */}
      {product && (
        <section style={{ marginTop: '4rem' }}>
          <h2 className="product-description-heading" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
            {__('Customer Reviews')}
          </h2>

          {/* Review Summary */}
          {reviewsData?.aggregate && reviewsData.aggregate.totalReviews > 0 && (
            <div className="review-summary">
              <div className="review-summary-score">
                <div className="review-summary-number">
                  {reviewsData.aggregate.averageRating.toFixed(1)}
                </div>
                <StarRating rating={reviewsData.aggregate.averageRating} size="md" />
                <div className="review-summary-label">
                  {reviewsData.aggregate.totalReviews} {__('reviews')}
                </div>
              </div>
              <div className="review-summary-bars">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = reviewsData.aggregate.ratingDistribution[stars] ?? 0;
                  const pct = reviewsData.aggregate.totalReviews > 0
                    ? (count / reviewsData.aggregate.totalReviews) * 100
                    : 0;
                  return (
                    <div key={stars} className="review-summary-bar">
                      <span>{stars}★</span>
                      <div className="review-summary-bar-track">
                        <div className="review-summary-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review list */}
          {reviewsData?.results.map((review: { id: string; rating: number; title: string | null; body: string | null; verifiedPurchase: boolean; createdAt: Date | string }) => (
            <div key={review.id} className="review-card">
              <div className="review-card-header">
                <StarRating rating={review.rating} size="sm" />
                {review.verifiedPurchase && (
                  <span className="review-card-badge">{__('Verified Purchase')}</span>
                )}
                <span className="review-card-date">
                  {new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
              {review.title && <div className="review-card-title">{review.title}</div>}
              {review.body && <p className="review-card-body">{review.body}</p>}
            </div>
          ))}

          {/* Pagination for reviews */}
          {reviewsData && reviewsData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setReviewPage(p => Math.max(1, p - 1))}
                disabled={reviewPage <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
              >
                {__('Previous')}
              </button>
              <span className="text-sm text-(--text-muted)">
                {__('Page')} {reviewPage} {__('of')} {reviewsData.totalPages}
              </span>
              <button
                onClick={() => setReviewPage(p => Math.min(reviewsData.totalPages, p + 1))}
                disabled={reviewPage >= reviewsData.totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
              >
                {__('Next')}
              </button>
            </div>
          )}

          {/* Write a review form */}
          <div style={{ marginTop: '2rem' }}>
            <ReviewForm productId={product.id} />
          </div>
        </section>
      )}
    </>
  );
}
