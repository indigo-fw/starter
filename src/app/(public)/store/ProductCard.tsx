import Image from 'next/image';
import { Link } from '@/components/Link';
import { Download, Package } from 'lucide-react';

function formatPrice(cents: number | null, currency = 'EUR'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: 'simple' | 'variable' | 'digital' | 'subscription' | 'bundle';
  priceCents: number | null;
  comparePriceCents: number | null;
  currency: string;
  featuredImage: string | null;
  shortDescription: string | null;
}

export function ProductCard({ product, translations }: { product: Product; translations: { sale: string; digital: string; fromVariants: string } }) {
  const hasDiscount = product.comparePriceCents && product.priceCents && product.comparePriceCents > product.priceCents;
  const isDigital = product.type === 'digital';

  return (
    <Link
      href={{ pathname: '/store/[slug]', params: { slug: product.slug } }}
      className="product-card"
    >
      <div className="product-card-image">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage}
            alt={product.name}
            width={400}
            height={400}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="product-card-image-placeholder">
            <Package className="h-10 w-10" />
          </div>
        )}
        <div className="product-card-badges">
          {isDigital && (
            <span className="product-card-badge product-card-badge-digital">
              <Download className="h-3 w-3" />
              {translations.digital}
            </span>
          )}
          {hasDiscount && (
            <span className="product-card-badge product-card-badge-sale">
              {translations.sale}
            </span>
          )}
        </div>
      </div>
      <div className="product-card-body">
        <span className="product-card-name">{product.name}</span>
        {product.shortDescription && (
          <span className="product-card-desc">{product.shortDescription}</span>
        )}
        <div className="product-card-footer">
          {product.priceCents != null ? (
            <>
              <span className="product-card-price">
                {formatPrice(product.priceCents, product.currency)}
              </span>
              {hasDiscount && (
                <span className="product-card-compare-price">
                  {formatPrice(product.comparePriceCents, product.currency)}
                </span>
              )}
            </>
          ) : product.type === 'variable' ? (
            <span className="product-card-price" style={{ color: 'var(--text-muted)' }}>
              {translations.fromVariants}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
