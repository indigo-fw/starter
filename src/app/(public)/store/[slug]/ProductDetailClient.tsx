'use client';

import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Check, Package, Download, Truck } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Link } from '@/i18n/navigation';

function formatPrice(cents: number | null | undefined, currency = 'EUR'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

function getSessionId(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )cart_session=([^;]*)/);
  if (match) return match[1]!;
  const id = crypto.randomUUID();
  document.cookie = `cart_session=${id};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  return id;
}

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

interface VariantGroup {
  id: string;
  name: string;
}

interface Image {
  id: string;
  url: string;
  alt: string | null;
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
  images: Image[];
  variantGroups: VariantGroup[];
}

export function ProductDetailClient({ product }: { product: Product }) {
  const isVariable = product.type === 'variable' && product.variants.length > 0;
  const isDigital = product.type === 'digital';

  // Build unique option values per group
  const optionGroups = product.variantGroups.map((group) => {
    const values = [...new Set(product.variants.map((v) => (v.options as Record<string, string>)[group.name]).filter(Boolean))];
    return { name: group.name, values };
  });

  // Selection state
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const defaultSelections: Record<string, string> = {};
  if (defaultVariant) {
    for (const group of optionGroups) {
      defaultSelections[group.name] = (defaultVariant.options as Record<string, string>)[group.name] ?? group.values[0] ?? '';
    }
  }

  const [selections, setSelections] = useState<Record<string, string>>(defaultSelections);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [mainImage, setMainImage] = useState(product.featuredImage);
  const sessionIdRef = useRef('');

  useEffect(() => {
    sessionIdRef.current = getSessionId();
  }, []);

  // Find selected variant
  const selectedVariant = isVariable
    ? product.variants.find((v) => {
        const opts = v.options as Record<string, string>;
        return optionGroups.every((g) => opts[g.name] === selections[g.name]);
      })
    : null;

  const activePriceCents = isVariable ? selectedVariant?.priceCents : product.priceCents;
  const activeComparePriceCents = isVariable ? selectedVariant?.comparePriceCents : product.comparePriceCents;

  // Gallery images
  const allImages = [
    ...(product.featuredImage ? [{ url: product.featuredImage, alt: product.name }] : []),
    ...product.images.filter((img) => img.url !== product.featuredImage),
  ];

  const utils = trpc.useUtils();
  const addToCart = trpc.storeCart.addItem.useMutation({
    onSuccess: () => {
      utils.storeCart.get.invalidate();
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
  });

  function handleAddToCart() {
    addToCart.mutate({
      sessionId: sessionIdRef.current || undefined,
      productId: product.id,
      variantId: selectedVariant?.id,
      quantity,
    });
  }

  return (
    <>
      <nav className="mb-6 text-sm text-(--text-muted)">
        <Link href="/store" className="hover:text-(--text-primary) transition-colors">Store</Link>
        <span className="mx-2">/</span>
        <span className="text-(--text-secondary)">{product.name}</span>
      </nav>

      <div className="product-detail">
        {/* ── Gallery ── */}
        <div className="product-gallery">
          <div className="product-gallery-main">
            {mainImage ? (
              <img src={mainImage} alt={product.name} />
            ) : (
              <div className="product-card-image-placeholder" style={{ height: '100%' }}>
                <Package className="h-16 w-16" />
              </div>
            )}
          </div>
          {allImages.length > 1 && (
            <div className="product-gallery-thumbs">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  className="product-gallery-thumb"
                  data-active={mainImage === img.url ? 'true' : undefined}
                  onClick={() => setMainImage(img.url)}
                >
                  <img src={img.url} alt={img.alt ?? ''} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <div className="product-info">
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
          </div>

          {product.shortDescription && (
            <p className="product-info-description">{product.shortDescription}</p>
          )}

          {/* Variant selectors */}
          {isVariable && optionGroups.map((group) => (
            <div key={group.name} className="variant-group">
              <span className="variant-group-label">{group.name}</span>
              <div className="variant-options">
                {group.values.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="variant-option"
                    data-selected={selections[group.name] === value ? 'true' : undefined}
                    onClick={() => {
                      const next = { ...selections, [group.name]: value };
                      setSelections(next);
                      // Update image if variant has one
                      const v = product.variants.find((vr) => {
                        const opts = vr.options as Record<string, string>;
                        return optionGroups.every((g) => opts[g.name] === next[g.name]);
                      });
                      if (v?.image) setMainImage(v.image);
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Add to cart */}
          <div className="add-to-cart-row">
            <div className="quantity-control">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
              <span>{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(99, quantity + 1))}>+</button>
            </div>
            <button
              type="button"
              className="btn-add-to-cart"
              onClick={handleAddToCart}
              disabled={addToCart.isPending || (isVariable && !selectedVariant)}
            >
              {added ? (
                <>
                  <Check className="h-4 w-4" />
                  Added!
                </>
              ) : addToCart.isPending ? (
                'Adding...'
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </>
              )}
            </button>
          </div>

          {/* Meta */}
          <div className="product-meta-list">
            {product.sku && <span>SKU: {selectedVariant?.sku ?? product.sku}</span>}
            {isDigital && (
              <span><Download className="h-3.5 w-3.5" /> Instant digital download</span>
            )}
            {product.requiresShipping && (
              <span><Truck className="h-3.5 w-3.5" /> Shipping required</span>
            )}
            {!product.requiresShipping && !isDigital && (
              <span>No shipping required</span>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div className="product-info-description" style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              {product.description}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
