import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { CONTENT_TYPES } from '@/config/cms';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { Link } from '@/components/Link';
import { Search } from 'lucide-react';
import { getLocale } from '@/lib/locale-server';

import { getServerTranslations } from '@/lib/translations-server';

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function ShowcaseSearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.q ?? '';
  const locale = await getLocale();
  const __ = await getServerTranslations();

  let results: Array<{
    id: string;
    title: string;
    slug: string;
    type: number;
    metaDescription: string | null;
    url: string;
  }> = [];

  if (query.length >= 1) {
    const pattern = `%${query}%`;
    const items = await db
      .select({
        id: cmsPosts.id,
        title: cmsPosts.title,
        slug: cmsPosts.slug,
        type: cmsPosts.type,
        metaDescription: cmsPosts.metaDescription,
      })
      .from(cmsPosts)
      .where(
        and(
          eq(cmsPosts.status, ContentStatus.PUBLISHED),
          eq(cmsPosts.lang, locale),
          isNull(cmsPosts.deletedAt),
          or(
            ilike(cmsPosts.title, pattern),
            ilike(cmsPosts.slug, pattern),
          ),
        ),
      )
      .orderBy(desc(cmsPosts.publishedAt))
      .limit(20);

    results = items.map((item) => {
      const ct = CONTENT_TYPES.find((c) => c.postType === item.type);
      const url = ct?.urlPrefix === '/' ? `/${item.slug}` : `${ct?.urlPrefix ?? '/'}${item.slug}`;
      return { ...item, url };
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-(--text-primary)">
        {query ? __('Results for "{query}"', { query }) : __('Search')}
      </h1>

      {query && results.length === 0 && (
        <p className="mt-6 text-(--text-muted)">{__('No results found for "{query}"', { query })}</p>
      )}

      {results.length > 0 && (
        <div className="mt-6 space-y-4">
          {results.map((item) => (
            <Link
              key={item.id}
              href={item.url}
              className="block rounded-lg border border-(--border-primary) p-4 transition-colors hover:bg-(--surface-secondary)"
            >
              <h2 className="font-semibold text-(--text-primary)">{item.title}</h2>
              {item.metaDescription && (
                <p className="mt-1 text-sm text-(--text-muted) line-clamp-2">
                  {item.metaDescription}
                </p>
              )}
              <p className="mt-1 text-xs text-(--text-muted)">{item.url}</p>
            </Link>
          ))}
        </div>
      )}

      {!query && (
        <div className="mt-12 flex flex-col items-center text-center text-(--text-muted)">
          <Search className="h-12 w-12 mb-4 opacity-30" />
          <p>{__('Use the search bar above or press')} <kbd className="rounded border border-(--border-primary) px-1.5 py-0.5 text-xs font-mono">/</kbd> {__('to search.')}</p>
        </div>
      )}
    </div>
  );
}
