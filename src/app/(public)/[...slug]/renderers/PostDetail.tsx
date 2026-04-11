import Image from 'next/image';
import { Link } from '@/components/Link';

import { PostType } from '@/core/types/cms';
import { PostCard } from '@/core/components/PostCard';
import { ShortcodeRenderer } from '@/core/components/content/ShortcodeRenderer';
import { StructuredData } from '@/core/components/seo/StructuredData';
import { buildArticleJsonLd, buildBreadcrumbJsonLd } from '@/core/lib/seo/json-ld';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { siteConfig } from '@/config/site';
import { getContentTypeByPostType } from '@/config/cms';
import { buildCanonicalUrl } from '@/core/lib/seo/canonical';
import { getLocale } from '@/lib/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import { localePath } from '@/lib/locale';
import { db } from '@/server/db';
import { getPostAuthorNames } from '@/core/crud/post-author-helpers';
import { getCachedPost, getCachedTRPC } from '../data';
import { getAncestors } from '../queries';

interface Props {
  slug: string;
  postType: number;
  preview?: string;
}

export async function PostDetail({ slug, postType, preview }: Props) {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const post = await getCachedPost(slug, postType, locale, preview);
  const api = await getCachedTRPC();

  const contentType = getContentTypeByPostType(postType);
  const isBlog = postType === PostType.BLOG;
  const isPage = postType === PostType.PAGE;

  // Parallel: tags + related posts + ancestors + authors
  const [postTags, relatedPosts, ancestors, authorNames] = await Promise.all([
    api.tags.getForObject({ objectId: post.id }).catch(() => [] as { id: string; name: string; slug: string }[]),
    isBlog
      ? api.cms.getRelatedPosts({ postId: post.id, lang: locale, limit: 4 }).catch(() => [])
      : Promise.resolve([]),
    isPage && post.parentId
      ? getAncestors(post.id).catch(() => [])
      : Promise.resolve([]),
    contentType.postFormFields?.authors
      ? getPostAuthorNames(db, post.id).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {preview && (
        <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          {__('Preview mode — this content is not yet published.')}
        </div>
      )}

      {/* Breadcrumb for hierarchical pages */}
      {ancestors.length > 0 && (
        <nav className="mb-6 text-sm text-(--text-muted)">
          {ancestors.map((a, i) => (
            <span key={a.slug}>
              <Link href={{ pathname: '/[slug]', params: { slug: a.slug } }} className="hover:text-(--text-secondary) hover:underline">
                {a.title}
              </Link>
              {i < ancestors.length && <span className="mx-1.5">/</span>}
            </span>
          ))}
          <span className="text-(--text-secondary)">{post.title}</span>
        </nav>
      )}

      {post.featuredImage && (
        <div className="relative mb-8 w-full" style={{ maxHeight: '400px', height: '400px' }}>
          <Image
            src={post.featuredImage}
            alt={post.featuredImageAlt ?? post.title}
            fill
            className="rounded-lg object-cover"
          />
        </div>
      )}

      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        {post.title}
      </h1>

      {(post.publishedAt || authorNames.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-(--text-muted)">
          {authorNames.length > 0 && (
            <span>{authorNames.join(', ')}</span>
          )}
          {authorNames.length > 0 && post.publishedAt && (
            <span aria-hidden="true">&middot;</span>
          )}
          {post.publishedAt && (
            <time dateTime={new Date(post.publishedAt).toISOString()}>
              {new Date(post.publishedAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
        </div>
      )}

      {/* Tags */}
      {postTags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {postTags.map((tag) => (
            <Link key={tag.slug} href={{ pathname: '/tag/[slug]', params: { slug: tag.slug } }} className="tag">
              {tag.name}
            </Link>
          ))}
        </div>
      )}

      <div className="prose prose-gray dark:prose-invert mt-8 max-w-none">
        <ShortcodeRenderer content={post.content} components={SHORTCODE_COMPONENTS} />
      </div>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="mt-12 border-t border-(--border-secondary) pt-8">
          <h2 className="text-xl font-semibold text-(--text-primary)">
            Related Posts
          </h2>
          <div className="mt-4 space-y-4">
            {relatedPosts.map((related) => {
              const relIsBlog = related.type === PostType.BLOG;
              const relHref = relIsBlog
                ? localePath(`/blog/${related.slug}`, locale)
                : localePath(`/${related.slug}`, locale);
              return (
                <PostCard
                  key={related.id}
                  title={related.title}
                  href={relHref}
                  metaDescription={related.metaDescription}
                  publishedAt={related.publishedAt}
                  locale={locale}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* JSON-LD: manual override or auto-generated */}
      {post.jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: post.jsonLd.replace(/<\//g, '<\\/'),
          }}
        />
      ) : (
        <StructuredData data={buildArticleJsonLd({
          title: post.title,
          description: post.metaDescription,
          url: buildCanonicalUrl(isBlog ? `/blog/${slug}` : `/${slug}`, locale),
          image: post.featuredImage,
          imageAlt: post.featuredImageAlt,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          authorNames: contentType.authorInJsonLd && authorNames.length > 0 ? authorNames : undefined,
          siteName: siteConfig.name,
          siteUrl: siteConfig.url,
          type: isBlog ? 'BlogPosting' : 'Article',
        })} />
      )}

      {/* BreadcrumbList for hierarchical pages */}
      {ancestors.length > 0 && (
        <StructuredData data={buildBreadcrumbJsonLd([
          ...ancestors.map((a) => ({
            name: a.title,
            url: buildCanonicalUrl(`/${a.slug}`, locale),
          })),
          { name: post.title, url: buildCanonicalUrl(`/${slug}`, locale) },
        ])} />
      )}
    </article>
  );
}
