import type { Metadata } from 'next';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema';
import { ContentStatus } from '@/core/types/cms';
import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { getCmsOverride } from '@/lib/cms-override';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { ilikePattern } from '@/core/crud/drizzle-utils';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { getServerTranslations } from '@/lib/translations-server';
import SearchClient from './SearchClient';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, 'search', locale).catch(() => null);
  return {
    title: cms?.seo.seoTitle || `${__('Search')} | ${siteConfig.name}`,
    description: cms?.seo.metaDescription || undefined,
    robots: { index: false, follow: true },
  };
}

const PAGE_SIZE = 10;

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const page = Math.max(1, Number(params.page) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const locale = await getLocale();

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

  if (query.length >= 1) {
    if (query.length >= 3) {
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
          .limit(PAGE_SIZE),
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
        return { ...item, url: localePath(rawUrl, locale) };
      });
    } else {
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
          .limit(PAGE_SIZE),
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
        return { ...item, url: localePath(rawUrl, locale), headline: item.metaDescription ?? '' };
      });
    }
  }

  return (
    <SearchClient
      initialQuery={query}
      initialPage={page}
      initialResults={results}
      initialTotal={total}
      pageSize={PAGE_SIZE}
    />
  );
}
