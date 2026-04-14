'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
  Search,
  Package,
  Loader2,
  ChevronRight,
  ArrowRight,
  LayoutGrid,
  List,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { formatPrice } from '@/core-store/lib/store-utils';
import { useSession } from '@/lib/auth-client';
import { WishlistButton } from '@/core-store/components/product/WishlistButton';
import { StarRating } from '@/core-store/components/product/StarRating';
import '@/core-store/components/product/store-grid.css';
import '@/core-store/components/product/WishlistButton.css';
import '@/core-store/components/product/store-reviews.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'name';
type LayoutMode = 'modern' | 'classic';
type ViewMode = 'grid' | 'list';

interface Product {
  id: string;
  type: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  priceCents: number | null;
  comparePriceCents: number | null;
  currency: string;
  featuredImage: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  sortOrder: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;
const LAYOUT_STORAGE_KEY = 'store-layout';

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function getSalePercent(price: number, compare: number): number {
  if (compare <= 0) return 0;
  return Math.round(((compare - price) / compare) * 100);
}

function getInitialLayout(): LayoutMode {
  if (typeof window === 'undefined') return 'modern';
  return (localStorage.getItem(LAYOUT_STORAGE_KEY) as LayoutMode) || 'modern';
}

/* ═══════════════════════════════════════════════════════════════════════════
   Product Card (shared between layouts)
   ═══════════════════════════════════════════════════════════════════════════ */

function ProductCard({
  product,
  __,
  wishlisted,
  rating,
}: {
  product: Product;
  __: (s: string) => string;
  wishlisted?: boolean;
  rating?: { averageRating: number; totalReviews: number };
}) {
  const hasSale =
    product.comparePriceCents != null &&
    product.priceCents != null &&
    product.comparePriceCents > product.priceCents;
  const isDigital = product.type === 'digital';
  const salePercent = hasSale
    ? getSalePercent(product.priceCents!, product.comparePriceCents!)
    : 0;

  return (
    <Link href={`/store/${product.slug}`} className="product-card">
      <div className="product-card-image">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage}
            alt={product.name}
            fill
            sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
          />
        ) : (
          <div className="product-card-image-placeholder">
            <Package size={48} />
          </div>
        )}
        {(hasSale || isDigital) && (
          <div className="product-card-badges">
            <span>
              {hasSale && (
                <span className="product-card-badge product-card-badge-sale">
                  -{salePercent}%
                </span>
              )}
            </span>
            <span>
              {isDigital && (
                <span className="product-card-badge product-card-badge-digital">
                  {__('Digital')}
                </span>
              )}
            </span>
          </div>
        )}
        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 1 }}>
          <WishlistButton productId={product.id} initialWishlisted={wishlisted} />
        </div>
      </div>
      <div className="product-card-body">
        <div className="product-card-name">{product.name}</div>
        {product.shortDescription && (
          <div className="product-card-desc">{product.shortDescription}</div>
        )}
        <div className="product-card-footer">
          <span className="product-card-price">
            {formatPrice(product.priceCents, product.currency)}
          </span>
          {hasSale && (
            <span className="product-card-compare-price">
              {formatPrice(product.comparePriceCents, product.currency)}
            </span>
          )}
        </div>
        {rating && rating.totalReviews > 0 && (
          <StarRating rating={rating.averageRating} totalReviews={rating.totalReviews} size="sm" />
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   List View Card (classic layout)
   ═══════════════════════════════════════════════════════════════════════════ */

function ProductListCard({
  product,
  __,
  wishlisted,
  rating,
}: {
  product: Product;
  __: (s: string) => string;
  wishlisted?: boolean;
  rating?: { averageRating: number; totalReviews: number };
}) {
  const hasSale =
    product.comparePriceCents != null &&
    product.priceCents != null &&
    product.comparePriceCents > product.priceCents;
  const isDigital = product.type === 'digital';
  const salePercent = hasSale
    ? getSalePercent(product.priceCents!, product.comparePriceCents!)
    : 0;

  return (
    <Link
      href={`/store/${product.slug}`}
      className="flex gap-4 p-4 rounded-xl bg-(--surface-secondary) border border-(--border-subtle) hover:border-(--border-primary) transition-colors no-underline text-inherit"
    >
      <div className="w-[120px] h-[120px] rounded-lg overflow-hidden shrink-0 bg-(--surface-primary) relative">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage}
            alt={product.name}
            fill
            sizes="120px"
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-(--text-muted) opacity-40">
            <Package size={32} />
          </div>
        )}
        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 1 }}>
          <WishlistButton productId={product.id} initialWishlisted={wishlisted} />
        </div>
      </div>
      <div className="flex flex-col flex-1 min-w-0 py-0.5">
        <div className="flex items-start gap-2">
          <span className="text-[0.9375rem] font-semibold text-(--text-primary) truncate">
            {product.name}
          </span>
          {hasSale && (
            <span className="product-card-badge product-card-badge-sale shrink-0">
              -{salePercent}%
            </span>
          )}
          {isDigital && (
            <span className="product-card-badge product-card-badge-digital shrink-0">
              {__('Digital')}
            </span>
          )}
        </div>
        {product.shortDescription && (
          <p className="text-[0.8125rem] text-(--text-muted) leading-relaxed line-clamp-2 mt-1">
            {product.shortDescription}
          </p>
        )}
        <div className="flex items-baseline gap-2 mt-auto pt-1">
          <span className="text-[1.0625rem] font-bold text-(--text-primary)">
            {formatPrice(product.priceCents, product.currency)}
          </span>
          {hasSale && (
            <span className="text-[0.8125rem] text-(--text-muted) line-through">
              {formatPrice(product.comparePriceCents, product.currency)}
            </span>
          )}
        </div>
        {rating && rating.totalReviews > 0 && (
          <StarRating rating={rating.averageRating} totalReviews={rating.totalReviews} size="sm" />
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Skeleton Loaders
   ═══════════════════════════════════════════════════════════════════════════ */

function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="store-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="product-card" style={{ pointerEvents: 'none' }}>
          <div className="product-card-image">
            <div className="skeleton-box" />
          </div>
          <div className="product-card-body">
            <div className="skeleton-line" style={{ width: '75%' }} />
            <div className="skeleton-line" style={{ width: '100%', marginTop: 6 }} />
            <div className="skeleton-line" style={{ width: '40%', marginTop: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 p-4 rounded-xl bg-(--surface-secondary) border border-(--border-subtle)"
        >
          <div className="w-[120px] h-[120px] rounded-lg overflow-hidden shrink-0">
            <div className="skeleton-box" />
          </div>
          <div className="flex flex-col flex-1 gap-2 py-1">
            <div className="skeleton-line" style={{ width: '50%' }} />
            <div className="skeleton-line" style={{ width: '80%' }} />
            <div className="skeleton-line" style={{ width: '30%', marginTop: 'auto' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sort Dropdown
   ═══════════════════════════════════════════════════════════════════════════ */

function SortSelect({
  value,
  onChange,
  __,
}: {
  value: SortOption;
  onChange: (v: SortOption) => void;
  __: (s: string) => string;
}) {
  return (
    <select
      className="store-sort"
      value={value}
      onChange={(e) => onChange(e.target.value as SortOption)}
    >
      <option value="newest">{__('Newest')}</option>
      <option value="price_asc">{__('Price: Low to High')}</option>
      <option value="price_desc">{__('Price: High to Low')}</option>
      <option value="name">{__('Name A-Z')}</option>
    </select>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Pagination
   ═══════════════════════════════════════════════════════════════════════════ */

function Pagination({
  page,
  totalPages,
  onPageChange,
  __,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  __: (s: string) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 mt-10">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          'border border-(--border-primary) bg-(--surface-secondary)',
          page <= 1
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:border-(--border-primary) hover:bg-(--surface-hover) cursor-pointer',
        )}
      >
        {__('Previous')}
      </button>
      <span className="text-sm text-(--text-muted)">
        {__('Page')} {page} {__('of')} {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          'border border-(--border-primary) bg-(--surface-secondary)',
          page >= totalPages
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:border-(--border-primary) hover:bg-(--surface-hover) cursor-pointer',
        )}
      >
        {__('Next')}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Layout Switcher
   ═══════════════════════════════════════════════════════════════════════════ */

function LayoutSwitcher({
  layout,
  onToggle,
}: {
  layout: LayoutMode;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
        'border border-(--border-primary) bg-(--surface-secondary) text-(--text-muted)',
        'hover:text-(--text-primary) hover:border-(--border-primary) cursor-pointer',
      )}
      title={layout === 'modern' ? 'Switch to classic layout' : 'Switch to modern layout'}
    >
      {layout === 'modern' ? <SlidersHorizontal size={14} /> : <LayoutGrid size={14} />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hero Section (modern layout)
   ═══════════════════════════════════════════════════════════════════════════ */

function HeroProduct({ product, __ }: { product: Product; __: (s: string) => string }) {
  return (
    <Link href={`/store/${product.slug}`} className="store-hero">
      <div className="store-hero-image">
        {product.featuredImage ? (
          <Image
            src={product.featuredImage}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-(--text-muted) opacity-30">
            <Package size={80} />
          </div>
        )}
      </div>
      <div className="store-hero-content">
        <div className="product-card-badge product-card-badge-sale">{__('Sale')}</div>
        <h2 className="store-hero-title">{product.name}</h2>
        {product.shortDescription && (
          <p className="store-hero-desc">{product.shortDescription}</p>
        )}
        <div className="store-hero-price">
          <span className="store-hero-price-current">
            {formatPrice(product.priceCents, product.currency)}
          </span>
          {product.comparePriceCents != null && (
            <span className="store-hero-price-compare">
              {formatPrice(product.comparePriceCents, product.currency)}
            </span>
          )}
        </div>
        <span className="store-hero-cta">
          {__('Shop now')} <ArrowRight size={16} />
        </span>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Classic Sidebar
   ═══════════════════════════════════════════════════════════════════════════ */

function ClassicSidebar({
  categories,
  activeSlug,
  onSelectCategory,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  onApplyPrice,
  onClearPrice,
  hasPriceFilter,
  filterableAttributes,
  __,
}: {
  categories: Category[];
  activeSlug: string | null;
  onSelectCategory: (slug: string | null) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (v: string) => void;
  onPriceMaxChange: (v: string) => void;
  onApplyPrice: () => void;
  onClearPrice: () => void;
  hasPriceFilter: boolean;
  filterableAttributes?: { id: string; name: string; slug: string; values: string[] }[];
  __: (s: string) => string;
}) {
  const rootCategories = categories.filter((c) => !c.parentId);

  function renderCategory(cat: Category, depth = 0) {
    const children = categories.filter((c) => c.parentId === cat.id);
    const isActive = activeSlug === cat.slug;

    return (
      <div key={cat.id}>
        <button
          onClick={() => onSelectCategory(isActive ? null : cat.slug)}
          className={cn(
            'w-full text-left text-sm py-1.5 px-3 rounded-lg transition-colors cursor-pointer',
            isActive
              ? 'bg-brand-500/10 text-brand-500 font-medium'
              : 'text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)',
          )}
          style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
        >
          {cat.name}
        </button>
        {children.length > 0 && (
          <div className="ml-1">
            {children.map((child) => renderCategory(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="w-[280px] shrink-0 sticky top-[calc(var(--app-header-h,3.5rem)+1.5rem)] self-start">
      {/* Categories */}
      <div className="border-b border-(--border-subtle) pb-4 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2 px-3">
          {__('Categories')}
        </h3>
        <button
          onClick={() => onSelectCategory(null)}
          className={cn(
            'w-full text-left text-sm py-1.5 px-3 rounded-lg transition-colors cursor-pointer',
            !activeSlug
              ? 'bg-brand-500/10 text-brand-500 font-medium'
              : 'text-(--text-secondary) hover:bg-(--surface-hover) hover:text-(--text-primary)',
          )}
        >
          {__('All Products')}
        </button>
        {rootCategories.map((cat) => renderCategory(cat))}
      </div>

      {/* Price Range */}
      <div className="border-b border-(--border-subtle) pb-4 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-3 px-3">
          {__('Price Range')}
        </h3>
        <div className="flex gap-2 px-3">
          <input
            type="number"
            placeholder={__('Min')}
            value={priceMin}
            onChange={(e) => onPriceMinChange(e.target.value)}
            className={cn(
              'w-full h-9 px-2.5 rounded-lg text-sm',
              'border border-(--border-primary) bg-(--surface-secondary) text-(--text-primary)',
              'outline-none focus:border-brand-400 transition-colors',
            )}
          />
          <input
            type="number"
            placeholder={__('Max')}
            value={priceMax}
            onChange={(e) => onPriceMaxChange(e.target.value)}
            className={cn(
              'w-full h-9 px-2.5 rounded-lg text-sm',
              'border border-(--border-primary) bg-(--surface-secondary) text-(--text-primary)',
              'outline-none focus:border-brand-400 transition-colors',
            )}
          />
        </div>
        <div className="flex gap-2 mt-2 px-3">
          <button
            onClick={onApplyPrice}
            className={cn(
              'flex-1 h-8 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              'bg-brand-500 text-white hover:bg-brand-600',
            )}
          >
            {__('Apply')}
          </button>
          {hasPriceFilter && (
            <button
              onClick={onClearPrice}
              className={cn(
                'h-8 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                'border border-(--border-primary) text-(--text-muted) hover:text-(--text-primary)',
              )}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Attribute Filters */}
      {/* TODO: Server-side attribute filtering can be added to the products router for full filtering support */}
      {filterableAttributes?.map((attr) => (
        <div key={attr.id} className="border-b border-(--border-subtle) pb-4 mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-(--text-muted) mb-2 px-3">
            {attr.name}
          </h3>
          {attr.values.map((val) => (
            <div
              key={val}
              className="w-full text-left text-sm py-1.5 px-3 rounded-lg text-(--text-secondary)"
            >
              {val}
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Store Page Client
   ═══════════════════════════════════════════════════════════════════════════ */

export function StorePageClient() {
  const __ = useBlankTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  /* ── URL state ────────────────────────────────────────────────────────── */

  const urlCategory = searchParams.get('category') || null;
  const urlSearch = searchParams.get('q') || '';
  const urlSort = (searchParams.get('sort') as SortOption) || 'newest';
  const urlPage = parseInt(searchParams.get('page') || '1', 10);

  /* ── Local state ──────────────────────────────────────────────────────── */

  const [layout, setLayout] = useState<LayoutMode>('modern');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [appliedPriceMin, setAppliedPriceMin] = useState<number | null>(null);
  const [appliedPriceMax, setAppliedPriceMax] = useState<number | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  /* ── Initialize layout from localStorage (client only) ────────────────── */

  useEffect(() => {
    setLayout(getInitialLayout());
  }, []);

  /* ── Debounce search ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  /* ── URL sync ─────────────────────────────────────────────────────────── */

  const updateUrl = useCallback(
    (params: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '' || value === '1' && key === 'page') {
          sp.delete(key);
        } else {
          sp.set(key, value);
        }
      }
      const qs = sp.toString();
      router.push(qs ? `/store?${qs}` : '/store', { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (debouncedSearch !== urlSearch) {
      updateUrl({ q: debouncedSearch || null, page: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const handleCategoryChange = useCallback(
    (slug: string | null) => {
      updateUrl({ category: slug, page: null });
      setMobileSidebarOpen(false);
    },
    [updateUrl],
  );

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      updateUrl({ sort: sort === 'newest' ? null : sort, page: null });
    },
    [updateUrl],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      updateUrl({ page: page <= 1 ? null : String(page) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [updateUrl],
  );

  const toggleLayout = useCallback(() => {
    setLayout((prev) => {
      const next = prev === 'modern' ? 'classic' : 'modern';
      localStorage.setItem(LAYOUT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const handleApplyPrice = useCallback(() => {
    setAppliedPriceMin(priceMin ? parseFloat(priceMin) : null);
    setAppliedPriceMax(priceMax ? parseFloat(priceMax) : null);
  }, [priceMin, priceMax]);

  const handleClearPrice = useCallback(() => {
    setPriceMin('');
    setPriceMax('');
    setAppliedPriceMin(null);
    setAppliedPriceMax(null);
  }, []);

  /* ── Queries ──────────────────────────────────────────────────────────── */

  const { data: session } = useSession();

  const categoriesQuery = trpc.storeProducts.listCategories.useQuery();
  const categories = categoriesQuery.data ?? [];

  const productsQuery = trpc.storeProducts.list.useQuery({
    categorySlug: urlCategory ?? undefined,
    search: debouncedSearch || undefined,
    page: urlPage,
    pageSize: PAGE_SIZE,
    sort: urlSort,
  });

  const products = productsQuery.data?.results ?? [];
  const totalPages = productsQuery.data?.totalPages ?? 1;
  const total = productsQuery.data?.total ?? 0;
  const isLoading = productsQuery.isLoading;

  const productIds = useMemo(() => products.map((p) => p.id), [products]);

  /* ── Wishlist batch check (auth-gated) ───────────────────────────────── */

  const { data: wishlistData } = trpc.storeWishlist.checkMany.useQuery(
    { productIds },
    { enabled: !!session?.user && productIds.length > 0 },
  );
  const wishlistedIds = useMemo(
    () => new Set(wishlistData?.wishlistedIds ?? []),
    [wishlistData],
  );

  /* ── Ratings batch query ─────────────────────────────────────────────── */

  const { data: ratingsData } = trpc.storeReviews.getProductRatings.useQuery(
    { productIds },
    { enabled: productIds.length > 0 },
  );
  const ratingsMap = useMemo(
    () => new Map((ratingsData ?? []).map((r) => [r.productId, r])),
    [ratingsData],
  );

  /* ── Filterable attributes (classic sidebar) ─────────────────────────── */

  const { data: filterableAttributes } = trpc.storeAttributes.listFilterable.useQuery(
    { categorySlug: urlCategory ?? undefined },
  );

  /* ── Derived data ─────────────────────────────────────────────────────── */

  const activeCategory = categories.find((c) => c.slug === urlCategory) ?? null;

  // Client-side price filtering (server doesn't support price range)
  const filteredProducts = useMemo(() => {
    if (appliedPriceMin == null && appliedPriceMax == null) return products;
    return products.filter((p) => {
      if (p.priceCents == null) return false;
      const price = p.priceCents / 100;
      if (appliedPriceMin != null && price < appliedPriceMin) return false;
      if (appliedPriceMax != null && price > appliedPriceMax) return false;
      return true;
    });
  }, [products, appliedPriceMin, appliedPriceMax]);

  // Hero: first on-sale product (modern layout only)
  const heroProduct = useMemo(() => {
    if (layout !== 'modern') return null;
    return filteredProducts.find(
      (p) =>
        p.comparePriceCents != null &&
        p.priceCents != null &&
        p.comparePriceCents > p.priceCents,
    ) ?? null;
  }, [filteredProducts, layout]);

  const gridProducts = useMemo(() => {
    if (!heroProduct) return filteredProducts;
    return filteredProducts.filter((p) => p.id !== heroProduct.id);
  }, [filteredProducts, heroProduct]);

  /* ══════════════════════════════════════════════════════════════════════
     Render — Modern Layout
     ══════════════════════════════════════════════════════════════════════ */

  function renderModernLayout() {
    return (
      <>
        {/* Category Tabs */}
        {categories.length > 0 && (
          <div className="store-category-tabs">
            <button
              className="store-category-tab"
              data-active={!urlCategory}
              onClick={() => handleCategoryChange(null)}
            >
              {__('All')}
            </button>
            {categories
              .filter((c) => !c.parentId)
              .map((cat) => (
                <button
                  key={cat.id}
                  className="store-category-tab"
                  data-active={urlCategory === cat.slug}
                  onClick={() => handleCategoryChange(cat.slug)}
                >
                  {cat.name}
                </button>
              ))}
          </div>
        )}

        {/* Hero */}
        {heroProduct && !debouncedSearch && urlPage === 1 && (
          <HeroProduct product={heroProduct} __={__} />
        )}

        {/* Grid */}
        {isLoading ? (
          <GridSkeleton />
        ) : gridProducts.length === 0 ? (
          <EmptyState __={__} />
        ) : (
          <div className="store-grid">
            {gridProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                __={__}
                wishlisted={wishlistedIds.has(product.id)}
                rating={ratingsMap.get(product.id)}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render — Classic Layout
     ══════════════════════════════════════════════════════════════════════ */

  function renderClassicLayout() {
    return (
      <div className="flex gap-8 relative">
        {/* Mobile sidebar toggle */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className={cn(
            'md:hidden flex items-center gap-1.5 mb-4 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer',
            'border border-(--border-primary) bg-(--surface-secondary) text-(--text-secondary)',
          )}
        >
          <SlidersHorizontal size={14} />
          {__('Filters')}
        </button>

        {/* Sidebar — desktop */}
        <div className="hidden md:block">
          <ClassicSidebar
            categories={categories}
            activeSlug={urlCategory}
            onSelectCategory={handleCategoryChange}
            priceMin={priceMin}
            priceMax={priceMax}
            onPriceMinChange={setPriceMin}
            onPriceMaxChange={setPriceMax}
            onApplyPrice={handleApplyPrice}
            onClearPrice={handleClearPrice}
            hasPriceFilter={appliedPriceMin != null || appliedPriceMax != null}
            filterableAttributes={filterableAttributes}
            __={__}
          />
        </div>

        {/* Sidebar — mobile overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-(--surface-primary) p-4 overflow-y-auto shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-(--text-primary)">{__('Filters')}</h3>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 rounded-md hover:bg-(--surface-hover) cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              <ClassicSidebar
                categories={categories}
                activeSlug={urlCategory}
                onSelectCategory={handleCategoryChange}
                priceMin={priceMin}
                priceMax={priceMax}
                onPriceMinChange={setPriceMin}
                onPriceMaxChange={setPriceMax}
                onApplyPrice={handleApplyPrice}
                onClearPrice={handleClearPrice}
                hasPriceFilter={appliedPriceMin != null || appliedPriceMax != null}
                filterableAttributes={filterableAttributes}
                __={__}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="store-breadcrumb">
            <Link href="/store">{__('Store')}</Link>
            {activeCategory && (
              <>
                <ChevronRight size={12} />
                <span>{activeCategory.name}</span>
              </>
            )}
          </div>

          {/* Sort bar */}
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <span className="text-sm text-(--text-muted)">
              {__('Showing')} {filteredProducts.length} {__('of')} {total} {__('products')}
            </span>
            <div className="flex items-center gap-2">
              <SortSelect value={urlSort} onChange={handleSortChange} __={__} />
              <div className="flex rounded-lg border border-(--border-primary) overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2 transition-colors cursor-pointer',
                    viewMode === 'grid'
                      ? 'bg-brand-500 text-white'
                      : 'bg-(--surface-secondary) text-(--text-muted) hover:text-(--text-primary)',
                  )}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-2 transition-colors cursor-pointer',
                    viewMode === 'list'
                      ? 'bg-brand-500 text-white'
                      : 'bg-(--surface-secondary) text-(--text-muted) hover:text-(--text-primary)',
                  )}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Products */}
          {isLoading ? (
            viewMode === 'grid' ? <GridSkeleton /> : <ListSkeleton />
          ) : filteredProducts.length === 0 ? (
            <EmptyState __={__} />
          ) : viewMode === 'grid' ? (
            <div className="store-grid" data-classic>
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  __={__}
                  wishlisted={wishlistedIds.has(product.id)}
                  rating={ratingsMap.get(product.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredProducts.map((product) => (
                <ProductListCard
                  key={product.id}
                  product={product}
                  __={__}
                  wishlisted={wishlistedIds.has(product.id)}
                  rating={ratingsMap.get(product.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render — Empty State
     ══════════════════════════════════════════════════════════════════════ */

  function EmptyState({ __ }: { __: (s: string) => string }) {
    return (
      <div className="store-empty">
        <Package size={48} className="store-empty-icon" />
        <h3 className="store-empty-title">{__('No products found')}</h3>
        <p className="store-empty-text">
          {debouncedSearch
            ? __('Try adjusting your search terms or clearing filters.')
            : __('Check back soon for new products.')}
        </p>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Main Render
     ══════════════════════════════════════════════════════════════════════ */

  return (
    <main className="app-container py-10">
      {/* Header */}
      <div className="store-header">
        <h1 className="store-title">{__('Store')}</h1>
        <p className="store-subtitle">{__('Browse our collection of products')}</p>
      </div>

      {/* Toolbar */}
      <div className="store-toolbar">
        <div className="store-search">
          <Search className="store-search-icon" />
          <input
            type="text"
            placeholder={__('Search products...')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {layout === 'modern' && (
          <SortSelect value={urlSort} onChange={handleSortChange} __={__} />
        )}
        {isLoading && <Loader2 size={16} className="animate-spin text-(--text-muted)" />}
        <div className="ml-auto">
          <LayoutSwitcher layout={layout} onToggle={toggleLayout} />
        </div>
      </div>

      {/* Layout */}
      {layout === 'modern' ? renderModernLayout() : renderClassicLayout()}

      {/* Pagination */}
      <Pagination
        page={urlPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        __={__}
      />
    </main>
  );
}
