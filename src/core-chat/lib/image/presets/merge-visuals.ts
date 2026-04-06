/**
 * Merge base visual enums with sparse overrides.
 *
 * Presets only need to specify what DIFFERS from the base.
 * For example, an anime preset overrides source tags but keeps the same outfits.
 *
 * Merges per-entry: if override has an entry with the same key, its fields
 * are shallow-merged over the base entry. New entries are added.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Deep-merge visual enum objects.
 * For each category (VISUAL_OUTFIT, etc.): merges entries by key.
 * For each entry: shallow-merges fields (override wins).
 */
export function mergeVisuals(
  base: any,
  overrides: Record<string, any>,
): any {
  const result = { ...base };

  for (const [categoryKey, overrideCategory] of Object.entries(overrides)) {
    if (!overrideCategory || typeof overrideCategory !== 'object') continue;
    const baseCategory = base[categoryKey];
    if (!baseCategory || typeof baseCategory !== 'object') {
      result[categoryKey] = overrideCategory;
      continue;
    }

    const merged = { ...baseCategory };
    for (const [entryKey, overrideEntry] of Object.entries(overrideCategory)) {
      if (!overrideEntry || typeof overrideEntry !== 'object') continue;
      const baseEntry = baseCategory[entryKey];
      if (baseEntry && typeof baseEntry === 'object') {
        merged[entryKey] = { ...baseEntry, ...overrideEntry };
      } else {
        merged[entryKey] = overrideEntry;
      }
    }
    result[categoryKey] = merged;
  }

  return result;
}
