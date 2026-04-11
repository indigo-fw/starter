'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ChevronDown, ChevronUp } from 'lucide-react';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { DEFAULT_LOCALE } from '@/lib/constants';
export function useListViewState<
  TTab extends string,
  TSort extends string,
>(config: {
  tabs: ReadonlySet<TTab>;
  sortKeys: ReadonlySet<TSort>;
  defaultTab: TTab;
  defaultSort: TSort;
  /** Available locale codes for language filtering. Defaults to [DEFAULT_LOCALE]. */
  locales?: readonly string[];
}) {
  const { tabs, sortKeys, defaultTab, defaultSort, locales = [DEFAULT_LOCALE] } = config;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? ''
  );
  const [debouncedSearch, setDebouncedSearch] = useState(
    () => searchParams.get('q') ?? ''
  );
  const [selectedLang, setSelectedLang] = useState<string>(() => {
    const v = searchParams.get('lang');
    return v && locales.includes(v) ? v : 'all';
  });
  const [activeTab, setActiveTab] = useState<TTab>(() => {
    const v = searchParams.get('tab') as TTab | null;
    return v && tabs.has(v) ? v : defaultTab;
  });
  const [page, setPage] = useState(() => {
    const v = Number(searchParams.get('page'));
    return v > 0 ? v : 1;
  });
  const [sortBy, setSortBy] = useState<TSort>(() => {
    const v = searchParams.get('sort') as TSort | null;
    return v && sortKeys.has(v) ? v : defaultSort;
  });
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => {
    const v = searchParams.get('dir');
    return v === 'asc' ? 'asc' : 'desc';
  });

  const updateUrl = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(params)) {
        if (value && value !== '') {
          sp.set(key, value);
        } else {
          sp.delete(key);
        }
      }
      if (sp.get('tab') === defaultTab) sp.delete('tab');
      if (sp.get('lang') === 'all') sp.delete('lang');
      if (sp.get('sort') === defaultSort) sp.delete('sort');
      if (sp.get('dir') === 'desc') sp.delete('dir');
      if (sp.get('page') === '1') sp.delete('page');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, {
        scroll: false,
      });
    },
    [searchParams, router, pathname, defaultTab, defaultSort]
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setDebouncedSearch(value);
        setPage(1);
        updateUrl({ q: value, page: '' });
      }, 300);
    },
    [updateUrl]
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleTabChange = useCallback(
    (tab: TTab) => {
      setActiveTab(tab);
      setPage(1);
      updateUrl({ tab, page: '' });
    },
    [updateUrl]
  );

  const handleLangChange = useCallback(
    (lang: string) => {
      setSelectedLang(lang);
      setPage(1);
      updateUrl({ lang, page: '' });
    },
    [updateUrl]
  );

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      updateUrl({ page: String(p) });
    },
    [updateUrl]
  );

  const toggleSort = useCallback(
    (col: TSort) => {
      if (sortBy === col) {
        const newDir = sortDir === 'asc' ? 'desc' : 'asc';
        setSortDir(newDir);
        updateUrl({ dir: newDir });
      } else {
        setSortBy(col);
        setSortDir('desc');
        updateUrl({ sort: col, dir: '' });
      }
    },
    [sortBy, sortDir, updateUrl]
  );

  return {
    searchQuery,
    debouncedSearch,
    selectedLang,
    activeTab,
    page,
    sortBy,
    sortDir,
    handleSearchChange,
    handleTabChange,
    handleLangChange,
    handlePageChange,
    toggleSort,
  };
}

/** Shared sort direction indicator for admin table headers. */
export function SortIcon({
  col,
  sortBy,
  sortDir,
}: {
  col: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
}) {
  if (sortBy !== col) return null;
  return sortDir === 'asc' ? (
    <ChevronUp size={14} />
  ) : (
    <ChevronDown size={14} />
  );
}
