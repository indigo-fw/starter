import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { Package } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { getServerTranslations } from '@/lib/translations-server';
import '@/core-store/components/store.css';

import { StoreToolbar } from './StoreToolbar';
import { ProductCard } from './ProductCard';

export async function generateMetadata(): Promise<Metadata> {
  const __ = await getServerTranslations();
  return {
    title: `${__('Store')} | ${siteConfig.name}`,
    description: __('Browse our products'),
  };
}

interface Props {
  searchParams: Promise<{ page?: string; sort?: string; q?: string }>;
}

export default async function StorePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const sort = (['newest', 'price_asc', 'price_desc', 'name'].includes(params.sort ?? '')
    ? params.sort
    : 'newest') as 'newest' | 'price_asc' | 'price_desc' | 'name';
  const search = params.q ?? undefined;

  const __ = await getServerTranslations();

  let data;
  try {
    const api = await serverTRPC();
    data = await api.storeProducts.list({ page, pageSize: 20, sort, search });
  } catch {
    data = null;
  }

  const cardTranslations = {
    sale: __('Sale'),
    digital: __('Digital'),
    fromVariants: __('From variants'),
  };

  return (
    <div className="app-container py-12">
      <div className="store-header">
        <h1 className="store-title">{__('Store')}</h1>
        <p className="store-subtitle">{__('Browse our products')}</p>
      </div>

      <StoreToolbar currentSort={sort} currentSearch={search ?? ''} />

      {data && data.results.length > 0 ? (
        <>
          <div className="store-grid">
            {data.results.map((product) => (
              <ProductCard key={product.id} product={product} translations={cardTranslations} />
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="pagination mt-10">
              {page > 1 && (
                <Link
                  href={{ pathname: '/store', query: {
                    ...(page > 2 ? { page: String(page - 1) } : {}),
                    ...(sort !== 'newest' ? { sort } : {}),
                    ...(search ? { q: search } : {}),
                  }}}
                  className="pagination-btn"
                >
                  {__('Previous')}
                </Link>
              )}
              <span className="pagination-info">
                {__('Page {page} of {totalPages}', { page, totalPages: data.totalPages })}
              </span>
              {page < data.totalPages && (
                <Link
                  href={{ pathname: '/store', query: {
                    page: String(page + 1),
                    ...(sort !== 'newest' ? { sort } : {}),
                    ...(search ? { q: search } : {}),
                  }}}
                  className="pagination-btn"
                >
                  {__('Next')}
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="store-empty">
          <Package className="h-16 w-16 store-empty-icon" />
          <p className="store-empty-title">
            {search ? __('No products found') : __('Coming soon')}
          </p>
          <p className="store-empty-text">
            {search ? __('Try a different search term') : __('Check back soon for new products')}
          </p>
        </div>
      )}
    </div>
  );
}
