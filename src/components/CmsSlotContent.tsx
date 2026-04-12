import { getPageCmsOverride } from '@/core/lib/seo/cms-override';
import { CmsContent } from '@/core/components';
import { SHORTCODE_COMPONENTS } from '@/config/shortcodes';

/**
 * Server component — renders CMS content for a coded route page.
 *
 * Fetches the CMS page override by slug, renders markdown + shortcodes
 * if content exists, renders nothing otherwise. Drop at the bottom of
 * any coded route page to let the SEO team add managed content.
 *
 * @example
 * // At the bottom of src/app/(public)/portfolio/page.tsx:
 * <CmsSlotContent slug="portfolio" />
 *
 * // Homepage:
 * <CmsSlotContent slug="" />
 */
export async function CmsSlotContent({
  slug,
  className,
}: {
  slug: string;
  className?: string;
}) {
  const cms = await getPageCmsOverride(slug);
  if (!cms?.content) return null;
  return <CmsContent content={cms.content} components={SHORTCODE_COMPONENTS} className={className} />;
}
