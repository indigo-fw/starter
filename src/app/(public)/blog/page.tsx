import { Link } from '@/components/Link';
import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';
import { getContentType } from '@/config/cms';
import { serverTRPC } from '@/lib/trpc/server';
import { PostType } from '@/core/types/cms';
import { PostCard } from '@/core/components/PostCard';
import { BlogSidebar } from '@/components/public/BlogSidebar';
import { db } from '@/server/db';
import { getCmsOverride } from '@/lib/cms-override';
import { buildPageTitle } from '@/core/lib/content/title-template';
import { CmsContent } from '@/core/components';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { getLocale } from '@/lib/locale-server';
import { localePath } from '@/lib/locale';
import { getServerTranslations } from '@/lib/translations-server';

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, 'blog', locale).catch(() => null);

  const ct = getContentType('blog')!;
  const title = buildPageTitle({
    configTemplate: ct.titleTemplate,
    seoTitle: cms?.seo.seoTitle,
    fallbackTitle: __('Blog'),
    sitename: siteConfig.name,
    page,
    pageLabel: __('Page'),
  });

  return {
    title,
    description: cms?.seo.metaDescription || __('Latest blog posts'),
    ...(cms?.seo.noindex && { robots: { index: false, follow: false } }),
  };
}

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function BlogListPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, 'blog', locale).catch(() => null);
  let data;
  try {
    const api = await serverTRPC();
    data = await api.cms.listPublished({
      type: PostType.BLOG,
      lang: locale,
      page,
      pageSize: 10,
    });
  } catch {
    data = null;
  }

  return (
    <div className="app-container py-12">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div>
          <h1 className="text-3xl font-bold text-(--text-primary)">{__('Blog')}</h1>

          {data && data.results.length > 0 ? (
            <div className="mt-8 space-y-8">
              {data.results.map((post) => (
                <PostCard
                  key={post.id}
                  title={post.title}
                  href={localePath(`/blog/${post.slug}`, locale)}
                  metaDescription={post.metaDescription}
                  publishedAt={post.publishedAt}
                  tags={post.tags}
                  locale={locale}
                />
              ))}

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="pagination">
                  {page > 1 && (
                    <Link
                      href={{ pathname: '/blog', query: { page: String(page - 1) } }}
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
                      href={{ pathname: '/blog', query: { page: String(page + 1) } }}
                      className="pagination-btn"
                    >
                      {__('Next')}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-8 text-(--text-muted)">{__('No blog posts yet.')}</p>
          )}
        </div>

        {/* Sidebar — hidden on mobile */}
        <div className="hidden lg:block">
          <BlogSidebar lang={locale} />
        </div>
      </div>

      {cms?.content && (
        <CmsContent content={cms.content} components={SHORTCODE_COMPONENTS} />
      )}
    </div>
  );
}
