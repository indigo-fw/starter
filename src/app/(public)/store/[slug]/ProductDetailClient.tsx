'use client';

import { useState, useCallback } from 'react';
import { Download, Truck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';
import { formatPrice } from '@/core-store/lib/store-utils';
import { ProductGallery } from '@/core-store/components/ProductGallery';
import { VariantSelector } from '@/core-store/components/VariantSelector';
import { AddToCartForm } from '@/core-store/components/AddToCartForm';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  name: string;
  sku: string | null;
  priceCents: number;
  comparePriceCents: number | null;
  stockQuantity: number | null;
  options: unknown;
  image: string | null;
  isDefault: boolean;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: 'simple' | 'variable' | 'digital' | 'subscription';
  description: string | null;
  shortDescription: string | null;
  priceCents: number | null;
  comparePriceCents: number | null;
  currency: string;
  sku: string | null;
  trackInventory: boolean;
  stockQuantity: number | null;
  requiresShipping: boolean;
  featuredImage: string | null;
  variants: Variant[];
  images: { id: string; url: string; alt: string | null }[];
  variantGroups: { id: string; name: string }[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ProductDetailClient({ product }: { product: Product }) {
  const __ = useBlankTranslations();
  const isVariable = product.type === 'variable' && product.variants.length > 0;
  const isDigital = product.type === 'digital';

  // Build option groups from variant data
  const optionGroups = product.variantGroups.map((group) => {
    const values = [...new Set(
      product.variants
        .map((v) => (v.options as Record<string, string>)[group.name])
        .filter(Boolean),
    )];
    return { name: group.name, values };
  });

  // Default selections from default variant
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const defaultSelections: Record<string, string> = {};
  if (defaultVariant) {
    for (const group of optionGroups) {
      defaultSelections[group.name] = (defaultVariant.options as Record<string, string>)[group.name] ?? group.values[0] ?? '';
    }
  }

  const [selections, setSelections] = useState<Record<string, string>>(defaultSelections);

  // Find the variant matching current selections
  const selectedVariant = isVariable
    ? product.variants.find((v) => {
        const opts = v.options as Record<string, string>;
        return optionGroups.every((g) => opts[g.name] === selections[g.name]);
      })
    : null;

  const activePriceCents = isVariable ? selectedVariant?.priceCents : product.priceCents;
  const activeComparePriceCents = isVariable ? selectedVariant?.comparePriceCents : product.comparePriceCents;
  const activeSku = isVariable ? (selectedVariant?.sku ?? product.sku) : product.sku;

  const discountPct = activeComparePriceCents && activePriceCents && activeComparePriceCents > activePriceCents
    ? Math.round((1 - activePriceCents / activeComparePriceCents) * 100)
    : null;

  // Gallery needs to update when variant with image is selected
  const galleryRef = { current: null as ((url: string) => void) | null };

  const handleVariantSelect = useCallback((name: string, value: string) => {
    const next = { ...selections, [name]: value };
    setSelections(next);
    // If the new variant has a specific image, switch to it
    const v = product.variants.find((vr) => {
      const opts = vr.options as Record<string, string>;
      return optionGroups.every((g) => opts[g.name] === next[g.name]);
    });
    if (v?.image) galleryRef.current?.(v.image);
  }, [selections, product.variants, optionGroups]);

  return (
    <>
      <nav className="store-breadcrumb" aria-label={__('Breadcrumb')}>
        <Link href="/store">{__('Store')}</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>

      <div className="product-detail">
        <ProductGallery
          featuredImage={product.featuredImage}
          images={product.images}
          productName={product.name}
        />

        <div className="product-info">
          {isDigital && (
            <span className="product-type-badge product-type-badge-digital">
              <Download className="h-3.5 w-3.5" />
              {__('Digital Product')}
            </span>
          )}

          <h1 className="product-info-title">{product.name}</h1>

          <div className="product-info-price">
            {activePriceCents != null && (
              <span className="product-info-price-current">
                {formatPrice(activePriceCents, product.currency)}
              </span>
            )}
            {activeComparePriceCents != null && activeComparePriceCents > (activePriceCents ?? 0) && (
              <span className="product-info-price-compare">
                {formatPrice(activeComparePriceCents, product.currency)}
              </span>
            )}
            {discountPct && (
              <span className="product-info-discount">−{discountPct}%</span>
            )}
          </div>

          {product.shortDescription && (
            <p className="product-info-description">{product.shortDescription}</p>
          )}

          {isVariable && (
            <VariantSelector
              optionGroups={optionGroups}
              selections={selections}
              onSelect={handleVariantSelect}
            />
          )}

          <AddToCartForm
            productId={product.id}
            variantId={selectedVariant?.id}
            disabled={isVariable && !selectedVariant}
          />

          <div className="product-meta-list">
            {activeSku && <span>{__('SKU')}: {activeSku}</span>}
            {isDigital && (
              <span><Download className="h-3.5 w-3.5" /> {__('Instant digital download')}</span>
            )}
            {product.requiresShipping && (
              <span><Truck className="h-3.5 w-3.5" /> {__('Shipping required')}</span>
            )}
            {!product.requiresShipping && !isDigital && (
              <span>{__('No shipping required')}</span>
            )}
          </div>

          {product.description && (
            <div className="product-description-full">
              <h2 className="product-description-heading">{__('Description')}</h2>
              <div className="product-info-description">{product.description}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
