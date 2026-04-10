import Image from 'next/image';
import { ShortcodeRenderer } from '@/core/components/content/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { getLocale } from '@/lib/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import { getCachedPortfolio } from '../data';

interface Props {
  slug: string;
  preview?: string;
}

export async function PortfolioDetail({ slug, preview }: Props) {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const item = await getCachedPortfolio(slug, locale, preview);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {preview && (
        <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          {__('Preview mode — this content is not yet published.')}
        </div>
      )}

      {item.featuredImage && (
        <div className="relative mb-8 w-full" style={{ maxHeight: '400px', height: '400px' }}>
          <Image
            src={item.featuredImage}
            alt={item.featuredImageAlt ?? item.title}
            fill
            className="rounded-lg object-cover"
          />
        </div>
      )}

      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        {item.title}
      </h1>

      {/* Project metadata bar */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-(--text-muted)">
        {item.clientName && (
          <span>
            <span className="font-medium text-(--text-secondary)">{item.clientName}</span>
          </span>
        )}
        {item.completedAt && (
          <time>
            {new Date(item.completedAt).toLocaleDateString(locale, {
              year: 'numeric',
              month: 'long',
            })}
          </time>
        )}
        {item.projectUrl && (
          <a
            href={item.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:text-brand-700 hover:underline"
          >
            Visit Project
          </a>
        )}
      </div>

      {/* Tech stack chips */}
      {item.techStack && item.techStack.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.techStack.map((tech) => (
            <span key={tech} className="tag">
              {tech}
            </span>
          ))}
        </div>
      )}

      {item.content && (
        <div className="prose prose-gray dark:prose-invert mt-8 max-w-none">
          <ShortcodeRenderer content={item.content} components={SHORTCODE_COMPONENTS} />
        </div>
      )}
    </article>
  );
}
