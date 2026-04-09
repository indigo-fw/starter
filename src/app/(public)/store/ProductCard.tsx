import { Link } from '@/i18n/navigation';
import { Download } from 'lucide-react';

function formatPrice(cents: number | null, currency = 'EUR'): string {
  if (cents == null) return '';
  return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: 'simple' | 'variable' | 'digital' | 'subscription';
  priceCents: number | null;
  comparePriceCents: number | null;
  currency: string;
  featuredImage: string | null;
  shortDescription: string | null;
}

export function ProductCard({ product }: { product: Product }) {
  const hasDiscount = product.comparePriceCents && product.priceCents && product.comparePriceCents > product.priceCents;
  const isDigital = product.type === 'digital';

  return (
    <Link
      href={{ pathname: '/store/[slug]', params: { slug: product.slug } }}
      className="product-card"
    >
      <div className="product-card-image">
        {product.featuredImage ? (
          <img src={product.featuredImage} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card-image-placeholder">
            <Download className="h-8 w-8" />
          </div>
        )}
        {isDigital && (
          <span
            className="product-card-badge product-card-badge-digital"
            style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }}
          >
            Digital
          </span>
        )}
        {hasDiscount && (
          <span
            className="product-card-badge product-card-badge-sale"
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
          >
            Sale
          </span>
        )}
      </div>
      <div className="product-card-body">
        <span className="product-card-name">{product.name}</span>
        {product.shortDescription && (
          <span className="product-card-desc">{product.shortDescription}</span>
        )}
        <div className="product-card-footer">
          {product.priceCents != null && (
            <span className="product-card-price">
              {formatPrice(product.priceCents, product.currency)}
            </span>
          )}
          {hasDiscount && (
            <span className="product-card-compare-price">
              {formatPrice(product.comparePriceCents, product.currency)}
            </span>
          )}
          {product.type === 'variable' && !product.priceCents && (
            <span className="product-card-price text-(--text-muted)">From variants</span>
          )}
        </div>
      </div>
    </Link>
  );
}
