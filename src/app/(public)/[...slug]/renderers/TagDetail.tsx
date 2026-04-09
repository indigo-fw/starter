import NextLink from 'next/link';
import { Link } from '@/i18n/navigation';
import { Rss } from 'lucide-react';

import { PostType } from '@/core/types/cms';
import { PostCard } from '@/core/components/PostCard';
import { TagCloud } from '@/core/components/TagCloud';
import { localePath } from '@/lib/locale';
import { getLocale } from '@/lib/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import { getCachedTag, getCachedTRPC } from '../data';

interface Props {
  slug: string;
  currentPage: number;
}

export async function TagDetail({ slug, currentPage }: Props) {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const tag = await getCachedTag(slug, locale);
  const api = await getCachedTRPC();

  // Parallel: blog posts + pages + portfolio items with this tag
  const [blogPosts, pagePosts, portfolioItems] = await Promise.all([
    api.cms.listPublished({
      type: PostType.BLOG,
      lang: locale,
      tagId: tag.id,
      page: currentPage,
      pageSize: 20,
    }),
    api.cms.listPublished({
      type: PostType.PAGE,
      lang: locale,
      tagId: tag.id,
      pageSize: 50,
    }),
    api.portfolio.listPublished({
      lang: locale,
      tagId: tag.id,
      pageSize: 50,
    }),
  ]);

  const allResults = [...blogPosts.results, ...pagePosts.results];
  const totalPages = blogPosts.totalPages;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
          {__('Tag')}: {tag.name}
        </h1>
        <NextLink
          href={`/api/feed/tag/${tag.slug}?lang=${locale}`}
          className="rounded-full p-1.5 text-(--text-muted) transition-colors hover:bg-orange-50 dark:hover:bg-orange-500/15 hover:text-orange-500"
          title={__('RSS Feed')}
        >
          <Rss className="h-5 w-5" />
        </NextLink>
      </div>

      {allResults.length > 0 || portfolioItems.results.length > 0 ? (
        <div className="mt-10 space-y-6">
          {allResults.map((post) => {
            const isBlog = post.type === PostType.BLOG;
            const href = localePath(isBlog ? `/blog/${post.slug}` : `/${post.slug}`, locale);
            return (
              <PostCard
                key={post.id}
                title={post.title}
                href={href}
                metaDescription={post.metaDescription}
                publishedAt={post.publishedAt}
                tags={post.tags}
                locale={locale}
              />
            );
          })}

          {/* Portfolio items with this tag */}
          {portfolioItems.results.map((item) => (
            <PostCard
              key={item.id}
              title={item.title}
              href={localePath(`/portfolio/${item.slug}`, locale)}
              metaDescription={item.metaDescription}
              publishedAt={item.completedAt}
              locale={locale}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <nav className="flex items-center justify-between pt-4">
              {currentPage > 1 ? (
                <Link
                  href={{ pathname: '/tag/[slug]', params: { slug }, query: { page: String(currentPage - 1) } }}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  &larr; {__('Previous')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-(--text-muted)">
                {__('Page {page} of {totalPages}', { page: currentPage, totalPages })}
              </span>
              {currentPage < totalPages ? (
                <Link
                  href={{ pathname: '/tag/[slug]', params: { slug }, query: { page: String(currentPage + 1) } }}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  {__('Next')} &rarr;
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      ) : (
        <p className="mt-6 text-(--text-muted)">{__('No content found with this tag.')}</p>
      )}

      {/* Tag Cloud */}
      <TagCloud
        lang={locale}
        sectionTitle={__('Browse More Tags')}
        sectionClassName="mt-12 border-t border-(--border-secondary) pt-8"
      />
    </div>
  );
}
