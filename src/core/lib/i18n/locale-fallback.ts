import { DEFAULT_LOCALE } from '@/lib/constants';

/**
 * Merge locale-specific items with default-locale fallbacks.
 *
 * Deduplicates by `translationGroup`: if a locale version exists,
 * the default version is excluded. Items with null translationGroup
 * are always included (no deduplication possible).
 *
 * Used by CMS list endpoints so non-default locale pages show content
 * even when translations don't exist yet — EN items fill the gaps.
 */
export function mergeWithLocaleFallback<
  T extends { translationGroup: string | null },
>(localeItems: T[], defaultItems: T[]): T[] {
  const coveredGroups = new Set(
    localeItems
      .map((i) => i.translationGroup)
      .filter((g): g is string => g !== null)
  );
  const fallbacks = defaultItems.filter(
    (i) => !i.translationGroup || !coveredGroups.has(i.translationGroup)
  );
  return [...localeItems, ...fallbacks];
}

/**
 * Whether a locale-aware list query needs the merge-fallback path.
 * Returns false for default locale (simple DB query suffices).
 */
export function needsLocaleFallback(lang: string | undefined): boolean {
  return !!lang && lang !== DEFAULT_LOCALE;
}
