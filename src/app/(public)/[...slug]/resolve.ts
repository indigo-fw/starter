import { CONTENT_TYPES } from '@/config/cms';
import { localePath } from '@/lib/locale';
import { LOCALES, IS_MULTILINGUAL } from '@/lib/constants';
import type { Locale } from '@/lib/constants';
import type { ContentTypeDeclaration } from '@/config/cms';

/**
 * Resolve a URL slug array to a content type + slug string.
 *
 * Examples:
 *   ['blog', 'my-post']  → { contentType: blogCt, slug: 'my-post' }
 *   ['privacy-policy']   → { contentType: pageCt, slug: 'privacy-policy' }
 *   ['category', 'tech'] → { contentType: categoryCt, slug: 'tech' }
 */
export function resolveSlug(segments: string[]): {
  contentType: ContentTypeDeclaration;
  slug: string;
} | null {
  if (segments.length === 0) return null;

  // Check if first segment matches a content type's listSegment
  for (const ct of CONTENT_TYPES) {
    if (ct.urlPrefix !== '/' && segments[0] === ct.listSegment) {
      if (segments.length === 2) {
        return { contentType: ct, slug: segments[1]! };
      }
      return null;
    }
  }

  // Root-level: try page content type
  const pageCt = CONTENT_TYPES.find((ct) => ct.id === 'page');
  if (pageCt && segments.length === 1) {
    return { contentType: pageCt, slug: segments[0]! };
  }

  return null;
}

/**
 * Build hreflang `alternates.languages` from translation siblings.
 * Pure function — all inputs explicit, no env/config dependencies.
 * Returns undefined when there's only one locale or no siblings exist.
 */
export function buildAlternates(
  baseUrl: string,
  siblings: { lang: string; slug: string }[],
  currentLocale: Locale,
  currentSlug: string,
  urlPrefix: string
): Record<string, string> | undefined {
  if (!IS_MULTILINGUAL) return undefined;

  const languages: Record<string, string> = {};

  // Current locale
  const currentPath = urlPrefix === '/' ? `/${currentSlug}` : `${urlPrefix}${currentSlug}`;
  languages[currentLocale] = `${baseUrl}${localePath(currentPath, currentLocale)}`;

  // Siblings
  for (const sibling of siblings) {
    if (!(LOCALES as readonly string[]).includes(sibling.lang)) continue;
    const sibLocale = sibling.lang as Locale;
    const sibPath = urlPrefix === '/' ? `/${sibling.slug}` : `${urlPrefix}${sibling.slug}`;
    languages[sibLocale] = `${baseUrl}${localePath(sibPath, sibLocale)}`;
  }

  if (Object.keys(languages).length <= 1) return undefined;

  // x-default: fallback for unmatched languages → default locale version
  const defaultLocale = LOCALES[0];
  if (currentLocale === defaultLocale) {
    // Current page IS the default locale version
    languages['x-default'] = languages[defaultLocale]!;
  } else {
    // Check if a default locale translation exists in siblings
    const defaultSibling = siblings.find((s) => s.lang === defaultLocale);
    if (defaultSibling) {
      const sibPath = urlPrefix === '/' ? `/${defaultSibling.slug}` : `${urlPrefix}${defaultSibling.slug}`;
      languages['x-default'] = `${baseUrl}${localePath(sibPath, defaultLocale)}`;
    }
    // If no default locale version exists, omit x-default entirely
  }

  return languages;
}
