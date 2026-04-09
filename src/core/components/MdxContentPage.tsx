import Image from 'next/image';
import type { FileContent } from '@/core/lib/content-loader';
import '@/core/styles/mdx-components.css';

interface Props {
  content: FileContent;
  html: string;
}

/**
 * Renders file-based MDX content with layout matching its frontmatter type.
 * Used by the catch-all route when a .mdx file overrides DB content.
 */
export function MdxContentPage({ content, html }: Props) {
  const { frontmatter } = content;
  const type = frontmatter.type ?? 'page';

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {frontmatter.image && (
        <div className="relative mb-8 w-full" style={{ maxHeight: '400px', height: '400px' }}>
          <Image
            src={frontmatter.image}
            alt={frontmatter.imageAlt ?? frontmatter.title ?? ''}
            fill
            className="rounded-lg object-cover"
          />
        </div>
      )}

      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        {frontmatter.title}
      </h1>

      {type === 'post' && frontmatter.date && (
        <time className="mt-3 block text-sm text-(--text-muted)">
          {new Date(frontmatter.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      )}

      {frontmatter.tags && frontmatter.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {frontmatter.tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}

      <div
        className="prose prose-gray dark:prose-invert mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />

    </article>
  );
}
