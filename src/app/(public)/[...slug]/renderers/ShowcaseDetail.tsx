import Image from 'next/image';
import { ShortcodeRenderer } from '@/core/components/ShortcodeRenderer';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';
import { getLocale } from '@/lib/locale-server';
import { getServerTranslations } from '@/lib/translations-server';
import { getCachedShowcase } from '../data';

interface Props {
  slug: string;
  preview?: string;
}

export async function ShowcaseDetail({ slug, preview }: Props) {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const item = await getCachedShowcase(slug, locale, preview);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      {preview && (
        <div className="mb-6 rounded-md bg-yellow-50 dark:bg-yellow-500/15 border border-yellow-200 dark:border-yellow-500/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          {__('Preview mode — this content is not yet published.')}
        </div>
      )}

      {item.cardType === 'video' && item.mediaUrl && (
        <div className="mb-8 aspect-video w-full overflow-hidden rounded-lg">
          <iframe
            src={item.mediaUrl}
            className="h-full w-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title={item.title}
          />
        </div>
      )}

      {item.cardType === 'image' && item.mediaUrl && (
        <div className="relative mb-8 w-full" style={{ maxHeight: '400px', height: '400px' }}>
          <Image
            src={item.mediaUrl}
            alt={item.title}
            fill
            className="rounded-lg object-cover"
          />
        </div>
      )}

      <h1 className="text-3xl font-bold text-(--text-primary) sm:text-4xl">
        {item.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-(--text-muted)">
        <span className="inline-block rounded-full bg-(--surface-secondary) px-2.5 py-0.5 text-xs font-medium capitalize">
          {item.cardType}
        </span>
      </div>

      {item.description && (
        <div className="prose prose-gray dark:prose-invert mt-8 max-w-none">
          <ShortcodeRenderer content={item.description} components={SHORTCODE_COMPONENTS} />
        </div>
      )}
    </article>
  );
}
