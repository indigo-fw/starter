import { DEFAULT_LOCALE } from '@/lib/constants';

/**
 * Merge locale-specific items with default-locale fallbacks.
 *
 * Deduplicates by `translationGroup` when available: if a locale version exists,
 * the default version is excluded. Items with null/missing translationGroup
 * are always included (no deduplication possible).
 *
 * Works with any item shape — tables without translationGroup (e.g. cmsTerms/tags)
 * simply include all items from both locales.
 *
 * Used by CMS list endpoints so non-default locale pages show content
 * even when translations don't exist yet — EN items fill the gaps.
 */
export function mergeWithLocaleFallback<T>(
  localeItems: T[],
  defaultItems: T[]
): T[] {
  const coveredGroups = new Set(
    localeItems
      .map((i) => (i as Record<string, unknown>).translationGroup)
      .filter((g): g is string => typeof g === 'string')
  );
  const fallbacks = defaultItems.filter((i) => {
    const group = (i as Record<string, unknown>).translationGroup;
    return typeof group !== 'string' || !coveredGroups.has(group);
  });
  return [...localeItems, ...fallbacks];
}

/**
 * Whether a locale-aware list query needs the merge-fallback path.
 * Returns false for default locale (simple DB query suffices).
 */
export function needsLocaleFallback(lang: string | undefined): boolean {
  return !!lang && lang !== DEFAULT_LOCALE;
}
