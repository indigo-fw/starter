'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Heart, Loader2, Package, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/core-store/lib/store-utils';
import '@/core-store/components/product/store-grid.css';

export default function WishlistPage() {
  const __ = useBlankTranslations();
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.storeWishlist.list.useQuery({
    page,
    pageSize: 20,
  });

  const toggle = trpc.storeWishlist.toggle.useMutation({
    onSuccess: () => {
      utils.storeWishlist.list.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  if (!data?.results.length) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">{__('My Wishlist')}</h1>
        <div className="store-empty">
          <Heart className="h-12 w-12 store-empty-icon" />
          <p className="store-empty-title">{__('Your wishlist is empty')}</p>
          <p className="store-empty-text">
            {__('Save products you love and come back to them later.')}
          </p>
          <Link
            href="/store"
            className="mt-4 inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
          >
            {__('Browse Store')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{__('My Wishlist')}</h1>

      <div className="store-grid">
        {data.results.map((item) => (
          <div key={item.productId} className="product-card">
            <Link href={`/store/${item.slug}`} className="product-card-image">
              {item.featuredImage ? (
                <img src={item.featuredImage} alt={item.name} />
              ) : (
                <div className="product-card-image-placeholder">
                  <Package className="h-10 w-10" />
                </div>
              )}
              {item.comparePriceCents != null && (item.priceCents ?? 0) > 0 && item.comparePriceCents > (item.priceCents ?? 0) && (
                <div className="product-card-badges">
                  <span className="product-card-badge product-card-badge-sale">
                    {__('Sale')}
                  </span>
                </div>
              )}
            </Link>
            <div className="product-card-body">
              <Link
                href={`/store/${item.slug}`}
                className="product-card-name hover:text-brand-600 transition-colors"
              >
                {item.name}
              </Link>
              <div className="product-card-footer">
                <span className="product-card-price">
                  {formatPrice(item.priceCents, item.currency)}
                </span>
                {item.comparePriceCents != null && (item.priceCents ?? 0) > 0 && item.comparePriceCents > (item.priceCents ?? 0) && (
                  <span className="product-card-compare-price">
                    {formatPrice(item.comparePriceCents, item.currency)}
                  </span>
                )}
              </div>
              <button
                onClick={() => toggle.mutate({ productId: item.productId })}
                disabled={toggle.isPending}
                className={cn(
                  'mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  'border border-(--border-primary) text-(--text-muted) hover:border-red-400 hover:text-red-600',
                )}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {__('Remove')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
          >
            {__('Previous')}
          </button>
          <span className="text-sm text-(--text-secondary)">
            {__('Page')} {page} {__('of')} {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-(--border-primary) disabled:opacity-40"
          >
            {__('Next')}
          </button>
        </div>
      )}
    </div>
  );
}
