import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { CONTENT_TYPES } from '@/config/cms';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { ilikePattern } from '@/core/crud/drizzle-utils';
import NextLink from 'next/link';
import { Link } from '@/i18n/navigation';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { getServerTranslations } from '@/lib/translations-server';

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.q ?? '';
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  let results: Array<{
    id: string;
    title: string;
    slug: string;
    type: number;
    metaDescription: string | null;
    publishedAt: Date | null;
    url: string;
    headline: string;
  }> = [];
  let total = 0;

  const locale = await getLocale();
  const __ = await getServerTranslations();

  if (query.length >= 1) {
    const hasSearchVector = query.length >= 3;

    if (hasSearchVector) {
      const tsConfig = sql`cms_ts_config(${locale})`;
      const tsQuery = sql`plainto_tsquery(${tsConfig}, ${query})`;
      const conditions = and(
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        eq(cmsPosts.lang, locale),
        isNull(cmsPosts.deletedAt),
        sql`${cmsPosts.searchVector} @@ ${tsQuery}`
      );

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: cmsPosts.id,
            title: cmsPosts.title,
            slug: cmsPosts.slug,
            type: cmsPosts.type,
            metaDescription: cmsPosts.metaDescription,
            publishedAt: cmsPosts.publishedAt,
            headline: sql<string>`ts_headline(${tsConfig}, regexp_replace(coalesce(${cmsPosts.content}, ''), '<[^>]*>', '', 'g'), ${tsQuery}, 'MaxWords=35, MinWords=15, StartSel=<mark>, StopSel=</mark>')`.as('headline'),
          })
          .from(cmsPosts)
          .where(conditions)
          .orderBy(desc(sql`ts_rank(${cmsPosts.searchVector}, ${tsQuery})`))
          .offset(offset)
          .limit(pageSize),
        db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPosts)
          .where(conditions),
      ]);

      total = Number(countResult[0]?.count ?? 0);
      results = items.map((item) => {
        const ct = CONTENT_TYPES.find((c) => c.postType === item.type);
        const rawUrl = ct
          ? ct.urlPrefix === '/' ? `/${item.slug}` : `${ct.urlPrefix}${item.slug}`
          : `/${item.slug}`;
        const url = localePath(rawUrl, locale);
        return { ...item, url };
      });
    } else {
      // ILIKE fallback for short queries
      const pattern = ilikePattern(query);
      const conditions = and(
        eq(cmsPosts.status, ContentStatus.PUBLISHED),
        eq(cmsPosts.lang, locale),
        isNull(cmsPosts.deletedAt),
        or(ilike(cmsPosts.title, pattern), ilike(cmsPosts.content, pattern))
      );

      const [items, countResult] = await Promise.all([
        db
          .select({
            id: cmsPosts.id,
            title: cmsPosts.title,
            slug: cmsPosts.slug,
            type: cmsPosts.type,
            metaDescription: cmsPosts.metaDescription,
            publishedAt: cmsPosts.publishedAt,
          })
          .from(cmsPosts)
          .where(conditions)
          .orderBy(desc(cmsPosts.publishedAt))
          .offset(offset)
          .limit(pageSize),
        db
          .select({ count: sql<number>`count(*)` })
          .from(cmsPosts)
          .where(conditions),
      ]);

      total = Number(countResult[0]?.count ?? 0);
      results = items.map((item) => {
        const ct = CONTENT_TYPES.find((c) => c.postType === item.type);
        const rawUrl = ct
          ? ct.urlPrefix === '/' ? `/${item.slug}` : `${ct.urlPrefix}${item.slug}`
          : `/${item.slug}`;
        const url = localePath(rawUrl, locale);
        return { ...item, url, headline: item.metaDescription ?? '' };
      });
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-(--text-primary)">{__('Search')}</h1>

      <form className="mt-6" action={localePath('/search', locale)} method="GET">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder={__('Search content...')}
            className="input flex-1 px-4 py-2.5"
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary rounded-md px-4 py-2.5 text-sm font-medium"
          >
            {__('Search')}
          </button>
        </div>
      </form>

      {query && (
        <p className="mt-4 text-sm text-(--text-muted)">
          {__._n('1 result for "{query}"', '{total} results for "{query}"', total, { query, total })}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {results.map((result) => (
          <article key={result.id}>
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
      </div>

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={{ pathname: '/search', query: { q: query, page: String(page - 1) } }}
              className="rounded-md border border-(--border-primary) px-3 py-1.5 text-sm"
            >
              {__('Previous')}
            </Link>
          )}
          <span className="text-sm text-(--text-muted)">
            {__('Page {page} of {totalPages}', { page, totalPages })}
          </span>
          {page < totalPages && (
            <Link
              href={{ pathname: '/search', query: { q: query, page: String(page + 1) } }}
              className="rounded-md border border-(--border-primary) px-3 py-1.5 text-sm"
            >
              {__('Next')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
