import Image from 'next/image';
import { Link } from '@/i18n/navigation';

import { PostType } from '@/core/types/cms';
import { PostCard } from '@/core/components/PostCard';
import { ShortcodeRenderer } from '@/core/components/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { localePath } from '@/lib/locale';
import { getLocale } from '@/lib/locale-server';
import { getCachedPost, getCachedTRPC } from '../data';
import { getAncestors } from '../queries';

interface Props {
  slug: string;
  postType: number;
  preview?: string;
}

export async function PostDetail({ slug, postType, preview }: Props) {
  const locale = await getLocale();
  const post = await getCachedPost(slug, postType, locale, preview);
  const api = await getCachedTRPC();

  const isBlog = postType === PostType.BLOG;
  const isPage = postType === PostType.PAGE;

  // Parallel: tags + related posts + ancestors
  const [postTags, relatedPosts, ancestors] = await Promise.all([
    api.tags.getForObject({ objectId: post.id }).catch(() => [] as { id: string; name: string; slug: string }[]),
    isBlog
      ? api.cms.getRelatedPosts({ postId: post.id, lang: locale, limit: 4 }).catch(() => [])
      : Promise.resolve([]),
    isPage && post.parentId
      ? getAncestors(post.id).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {preview && (
        <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          Preview mode — this content is not yet published.
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

      {post.publishedAt && (
        <time className="mt-3 block text-sm text-(--text-muted)">
          {new Date(post.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
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

      {/* JSON-LD */}
      {post.jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: post.jsonLd.replace(/<\//g, '<\\/'),
          }}
        />
      )}
    </article>
  );
}
