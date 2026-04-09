'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, useTransition } from 'react';

export function StoreToolbar({
  currentSort,
  currentSearch,
}: {
  currentSort: string;
  currentSearch: string;
}) {
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

  return (
    <div className="store-toolbar">
      <div className="store-search">
        <input
          type="search"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              startTransition(() => router.push(buildUrl({ q: search })));
            }
          }}
        />
      </div>
      <select
        className="store-sort"
        value={currentSort}
        onChange={(e) => {
          startTransition(() => router.push(buildUrl({ sort: e.target.value })));
        }}
      >
        <option value="newest">Newest</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="name">Name</option>
      </select>
      {isPending && (
        <span className="text-sm text-(--text-muted)">Loading...</span>
      )}
    </div>
  );
}
