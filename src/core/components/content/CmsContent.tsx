import { ShortcodeRenderer, type ShortcodeComponentMap } from './ShortcodeRenderer';
import { resolveContentVars } from '@/core/lib/content/vars';

interface CmsContentProps {
  /** Raw markdown content from getCmsOverride(). */
  content: string;
  /** Shortcode component registry — pass from your project's config. */
  components: ShortcodeComponentMap;
  /** Optional className override for the outer section. */
  className?: string;
}

/**
 * Renders CMS markdown body content on coded route pages.
 *
 * Intended for SEO copy that the SEO team manages via CMS page overrides.
 * Uses ShortcodeRenderer for markdown + shortcode support.
 *
 * Usage in a coded route page:
 * ```tsx
 * const cms = await getCmsOverride(db, 'homepage', locale);
 * {cms?.content && <CmsContent content={cms.content} components={SHORTCODE_COMPONENTS} />}
 * ```
 */
export function CmsContent({ content, components, className }: CmsContentProps) {
  if (!content) return null;

  return (
    <section className={className ?? 'mx-auto max-w-4xl px-4 py-8 text-sm text-(--text-tertiary)'}>
      <div className="prose prose-gray dark:prose-invert max-w-none">
        <ShortcodeRenderer content={resolveContentVars(content)} components={components} />
      </div>
    </section>
  );
}
