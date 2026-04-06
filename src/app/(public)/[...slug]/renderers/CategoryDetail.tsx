import { PostType } from '@/core/types/cms';
import { PostCard } from '@/core/components/PostCard';
import { ShortcodeRenderer } from '@/core/components/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { localePath } from '@/lib/locale';
import { getLocale } from '@/lib/locale-server';
import { getCachedCategory, getCachedTRPC } from '../data';

interface Props {
  slug: string;
}

export async function CategoryDetail({ slug }: Props) {
  const locale = await getLocale();
  const cat = await getCachedCategory(slug, locale);

  // Sequential: listPublished needs cat.id from getBySlug above
  const api = await getCachedTRPC();
  const posts = await api.cms.listPublished({
    type: PostType.BLOG,
    lang: locale,
    categoryId: cat.id,
    pageSize: 20,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        {cat.title}
      </h1>

      {cat.text && (
        <div className="prose prose-gray dark:prose-invert mt-6 max-w-none">
          <ShortcodeRenderer content={cat.text} components={SHORTCODE_COMPONENTS} />
        </div>
      )}

      {posts.results.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-(--text-primary)">
            Posts in this category
          </h2>
          <div className="mt-4 space-y-6">
            {posts.results.map((post) => (
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
          </div>
        </div>
      )}
    </div>
  );
}
