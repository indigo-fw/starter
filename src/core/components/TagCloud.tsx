import Link from 'next/link';

import { serverTRPC } from '@/lib/trpc/server';
import { localePath } from '@/core/lib/i18n/locale';
import { DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';

interface Props {
  lang?: string;
  limit?: number;
  /** When provided, wraps the cloud in a <section> with this title */
  sectionTitle?: string;
  /** CSS class for the section wrapper */
  sectionClassName?: string;
  /** CSS class for an inner container div (e.g. max-width + padding) */
  containerClassName?: string;
}

export async function TagCloud({
  lang = DEFAULT_LOCALE,
  limit = 20,
  sectionTitle,
  sectionClassName,
  containerClassName,
}: Props) {
  const locale = lang as Locale;
  let tags: { id: string; name: string; slug: string; count: number }[] = [];

  try {
    const api = await serverTRPC();
    tags = await api.tags.listPopular({ lang, limit });
  } catch {
    return null;
  }

  if (tags.length === 0) return null;

  // Calculate size tiers based on count distribution
  const counts = tags.map((t) => Number(t.count));
  const sorted = [...counts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  const top20Threshold = sorted[Math.floor(sorted.length * 0.8)] ?? median;

  function getSizeClass(count: number): string {
    if (count >= top20Threshold && top20Threshold > median) {
      return 'text-base font-semibold';
    }
    if (count >= median) {
      return 'text-sm font-medium';
    }
    return 'text-xs';
  }

  const cloud = (
    <div className="tag-cloud flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Link
          key={tag.id}
          href={localePath(`/tag/${tag.slug}`, locale)}
          className={`inline-block rounded-full border border-(--border-primary) bg-(--surface-primary) px-3 py-1 text-(--text-secondary) transition-colors hover:border-brand-300 dark:hover:border-[oklch(0.65_0.17_var(--brand-hue)_/_0.30)] hover:bg-brand-50 dark:hover:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] hover:text-brand-700 dark:hover:text-brand-400 ${getSizeClass(Number(tag.count))}`}
        >
          {tag.name}
          <span className="ml-1 text-(--text-muted)">({Number(tag.count)})</span>
        </Link>
      ))}
    </div>
  );

  if (sectionTitle) {
    const content = (
      <>
        <h2 className="text-lg font-semibold text-(--text-primary)">{sectionTitle}</h2>
        <div className="mt-4">{cloud}</div>
      </>
    );

    return (
      <section className={sectionClassName}>
        {containerClassName ? (
          <div className={containerClassName}>{content}</div>
        ) : (
          content
        )}
      </section>
    );
  }

  return cloud;
}
