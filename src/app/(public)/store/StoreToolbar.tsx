'use client';

import { useState, useTransition } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useBlankTranslations } from '@/lib/translations';

export function StoreToolbar({
  currentSort,
  currentSearch,
}: {
  currentSort: string;
  currentSearch: string;
}) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentSearch);

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const sort = overrides.sort ?? currentSort;
    const q = overrides.q ?? search;
    if (sort && sort !== 'newest') p.set('sort', sort);
    if (q) p.set('q', q);
    const qs = p.toString();
    return `/store${qs ? `?${qs}` : ''}` as '/store';
  }

  function handleSearch() {
    startTransition(() => router.push(buildUrl({ q: search })));
  }

  return (
    <div className="store-toolbar">
      <div className="store-search">
        <Search className="store-search-icon" />
        <input
          type="search"
          placeholder={__('Search products...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch();
          }}
          aria-label={__('Search products')}
        />
      </div>
      <select
        className="store-sort"
        value={currentSort}
        onChange={(e) => {
          startTransition(() => router.push(buildUrl({ sort: e.target.value })));
        }}
        aria-label={__('Sort by')}
      >
        <option value="newest">{__('Newest')}</option>
        <option value="price_asc">{__('Price: Low to High')}</option>
        <option value="price_desc">{__('Price: High to Low')}</option>
        <option value="name">{__('Name')}</option>
      </select>
      {isPending && (
        <div className="store-loading-dot" aria-label={__('Loading')} />
      )}
    </div>
  );
}
