import type { Metadata } from 'next';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { Package, ArrowRight } from 'lucide-react';

import { siteConfig } from '@/config/site';
import { serverTRPC } from '@/lib/trpc/server';
import { getServerTranslations } from '@/lib/translations-server';
import '@/core-store/components/product/store-grid.css';

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
  searchParams: Promise<{ page?: string; sort?: string; q?: string; cat?: string }>;
}

export default async function StorePage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const sort = (['newest', 'price_asc', 'price_desc', 'name'].includes(params.sort ?? '')
    ? params.sort
    : 'newest') as 'newest' | 'price_asc' | 'price_desc' | 'name';
  const search = params.q ?? undefined;
  const categorySlug = params.cat ?? undefined;

  const __ = await getServerTranslations();
  const isFiltered = !!search || !!categorySlug || page > 1;

  let data;
  let categories: { id: string; name: string; slug: string }[] = [];
  let featured;
  try {
    const api = await serverTRPC();
    [data, categories] = await Promise.all([
      api.storeProducts.list({ page, pageSize: 20, sort, search, categorySlug }),
      api.storeProducts.listCategories(),
    ]);

    // Grab first product with a discount as featured (only on first unfiltered page)
    if (!isFiltered && data.results.length > 0) {
      featured = data.results.find((p) => p.comparePriceCents && p.priceCents && p.comparePriceCents > p.priceCents);
    }
  } catch {
    data = null;
  }

  const cardTranslations = {
    sale: __('Sale'),
    digital: __('Digital'),
    fromVariants: __('From variants'),
  };

  const products = data?.results ?? [];
  // Don't show featured product in grid if it's the featured hero
  const gridProducts = featured ? products.filter((p) => p.id !== featured.id) : products;

  return (
    <div className="app-container py-12">
      {/* ── Featured Hero ── */}
      {featured && (
        <Link
          href={{ pathname: '/store/[slug]', params: { slug: featured.slug } }}
          className="store-hero"
        >
          <div className="store-hero-image">
            {featured.featuredImage ? (
              <Image
                src={featured.featuredImage}
                alt={featured.name}
                width={600}
                height={600}
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="product-card-image-placeholder" style={{ height: '100%' }}>
                <Package className="h-16 w-16" />
              </div>
            )}
          </div>
          <div className="store-hero-content">
            <span className="product-card-badge product-card-badge-sale">{__('Sale')}</span>
            <h2 className="store-hero-title">{featured.name}</h2>
            {featured.shortDescription && (
              <p className="store-hero-desc">{featured.shortDescription}</p>
            )}
            <div className="store-hero-price">
              <span className="store-hero-price-current">
                {new Intl.NumberFormat('en', { style: 'currency', currency: featured.currency, minimumFractionDigits: 2 }).format((featured.priceCents ?? 0) / 100)}
              </span>
              {featured.comparePriceCents && (
                <span className="store-hero-price-compare">
                  {new Intl.NumberFormat('en', { style: 'currency', currency: featured.currency, minimumFractionDigits: 2 }).format(featured.comparePriceCents / 100)}
                </span>
              )}
            </div>
            <span className="store-hero-cta">
              {__('Shop Now')} <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      )}

      {/* ── Header ── */}
      <div className="store-header">
        <h1 className="store-title">{featured ? __('All Products') : __('Store')}</h1>
      </div>

      {/* ── Category Tabs ── */}
      {categories.length > 0 && (
        <div className="store-category-tabs">
          <Link
            href={{ pathname: '/store' }}
            className="store-category-tab"
            data-active={!categorySlug ? 'true' : undefined}
          >
            {__('All')}
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={{ pathname: '/store', query: { cat: cat.slug } }}
              className="store-category-tab"
              data-active={categorySlug === cat.slug ? 'true' : undefined}
            >
              {cat.name}
            </Link>
          ))}
        </div>
      )}

      <StoreToolbar currentSort={sort} currentSearch={search ?? ''} />

      {gridProducts.length > 0 ? (
        <>
          <div className="store-grid">
            {gridProducts.map((product) => (
              <ProductCard key={product.id} product={product} translations={cardTranslations} />
            ))}
          </div>

          {data && data.totalPages > 1 && (
            <div className="pagination mt-10">
              {page > 1 && (
                <Link
                  href={{ pathname: '/store', query: {
                    ...(page > 2 ? { page: String(page - 1) } : {}),
                    ...(sort !== 'newest' ? { sort } : {}),
                    ...(search ? { q: search } : {}),
                    ...(categorySlug ? { cat: categorySlug } : {}),
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
                    ...(categorySlug ? { cat: categorySlug } : {}),
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
