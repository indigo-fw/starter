'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextLink from 'next/link';
import { Loader2, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { useLocale } from '@/core/hooks';
import { localePath } from '@/lib/locale';

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  type: number;
  metaDescription: string | null;
  publishedAt: Date | null;
  url: string;
  headline: string;
}

interface SearchClientProps {
  initialQuery: string;
  initialPage: number;
  initialResults: SearchResult[];
  initialTotal: number;
  pageSize: number;
}

export default function SearchClient({
  initialQuery,
  initialPage,
  initialResults,
  initialTotal,
  pageSize,
}: SearchClientProps) {
  const __ = useBlankTranslations();
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inputValue, setInputValue] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track whether we're using client-side data or initial SSR data
  const isInitialRender = query === initialQuery && page === initialPage;

  const { data, isFetching } = trpc.contentSearch.fullTextSearch.useQuery(
    { query, lang: locale, page, pageSize },
    { enabled: query.length >= 1, placeholderData: (prev) => prev },
  );

  // tRPC results don't include locale prefix — apply it
  const tRPCResults = (data?.results ?? []).map((r) => ({
    ...r,
    url: localePath(r.url, locale),
  }));
  const results = isInitialRender && !data ? initialResults : tRPCResults;
  const total = isInitialRender && !data ? initialTotal : (data?.total ?? 0);
  const totalPages = Math.ceil(total / pageSize);

  // Sync URL when query/page changes (without full navigation)
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page > 1) params.set('page', String(page));
    const newUrl = `${localePath('/search', locale)}${params.toString() ? `?${params}` : ''}`;

    // Only update if different from current
    const currentQ = searchParams.get('q') ?? '';
    const currentPage = Number(searchParams.get('page')) || 1;
    if (currentQ !== query || currentPage !== page) {
      router.replace(newUrl, { scroll: false });
    }
  }, [query, page, locale, router, searchParams]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed === query) return;
      setQuery(trimmed);
      setPage(1);
    },
    [inputValue, query],
  );

  const goToPage = useCallback((p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-(--text-primary)">{__('Search')}</h1>

      <form className="mt-6" onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={__('Search content...')}
              className="input w-full px-4 py-2.5 pr-10"
              autoFocus
            />
            {isFetching && (
              <div className="absolute top-1/2 right-3 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-(--text-muted)" />
              </div>
            )}
          </div>
          <button
            type="submit"
            className="btn btn-primary rounded-md px-4 py-2.5 text-sm font-medium"
          >
            <Search className="h-4 w-4 sm:hidden" />
            <span className="hidden sm:inline">{__('Search')}</span>
          </button>
        </div>
      </form>

      {query && (
        <p className="mt-4 text-sm text-(--text-muted)">
          {isFetching
            ? __('Searching...')
            : __._n('1 result for "{query}"', '{total} results for "{query}"', total, { query, total })
          }
        </p>
      )}

      <div className="mt-6 space-y-6">
        {results.map((result) => (
          <article key={result.id} className="animate-in fade-in duration-200">
            <NextLink
              href={result.url}
              className="text-lg font-medium text-brand-700 dark:text-brand-400 hover:underline"
            >
              {result.title}
            </NextLink>
            <p className="mt-0.5 text-xs text-green-700 dark:text-green-400">
              {result.url}
            </p>
            {result.headline && (
              <p
                className="mt-1 text-sm text-(--text-secondary) [&_mark]:bg-yellow-200 dark:[&_mark]:bg-yellow-500/30"
                dangerouslySetInnerHTML={{ __html: result.headline }}
              />
            )}
          </article>
        ))}

        {query && !isFetching && results.length === 0 && (
          <p className="text-sm text-(--text-muted)">{__('No results found.')}</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <button
              onClick={() => goToPage(page - 1)}
              className="rounded-md border border-(--border-primary) px-3 py-1.5 text-sm hover:bg-(--bg-secondary) transition-colors"
            >
              {__('Previous')}
            </button>
          )}
          <span className="text-sm text-(--text-muted)">
            {__('Page {page} of {totalPages}', { page, totalPages })}
          </span>
          {page < totalPages && (
            <button
              onClick={() => goToPage(page + 1)}
              className="rounded-md border border-(--border-primary) px-3 py-1.5 text-sm hover:bg-(--bg-secondary) transition-colors"
            >
              {__('Next')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
