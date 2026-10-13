/**
 * Translation helpers — client-safe, powered by next-intl.
 *
 * `useAdminTranslations(namespace?)` — admin/core client components (next-intl hook).
 *   Requires messages loaded by the dashboard layout (public + admin merged).
 *   Do NOT use in components rendered on public pages — the admin namespace won't exist.
 *
 * `useBlankTranslations()` — public/shared client components (no catalog lookup).
 *   Returns the key with `{values}` filled in. Use for components that render
 *   outside the dashboard layout.
 *
 * `dataTranslations(namespace)` — module-scope extraction marker (identity at runtime).
 *
 * For server components, use `getServerTranslations` from
 * `@/core/lib/i18n/translations-server` (or the re-export at `@/lib/translations-server`).
 *
 * The PO→JSON pipeline replaces dots with @@@ in keys, so we apply the same
 * transform at lookup time to match.
 */
import { useMemo } from 'react';

import {
  type TranslationFn,
  type TranslationValues,
  createTranslationFunction,
  fillFallback,
  wrapWithFallback,
} from './translation-shared';
import { useTranslations as useBaseTranslations } from 'next-intl';

export type { TranslationFn, TranslationValues } from './translation-shared';

/** Client-side translation hook — wraps next-intl's useTranslations with safe fallback.
 *
 * Uses a two-component pattern to satisfy rules-of-hooks:
 * `useAdminTranslations` always calls the hook unconditionally.
 * If the context is missing, wrap the component in `<AdminTranslationsGuard>`.
 *
 * For components that may render outside the dashboard layout,
 * use `useBlankTranslations()` instead.
 */
export function useAdminTranslations(
  namespace: string = 'General'
): TranslationFn {
  const t = useBaseTranslations(namespace);
  // Stable identity: `__` lands in useMemo/useCallback/useEffect dependency
  // lists all over the dashboard. A fresh function every render would
  // silently re-run every one of those on every render.
  return useMemo(
    () => wrapWithFallback(createTranslationFunction(t), namespace),
    [t, namespace]
  );
}

/**
 * No-op translation hook — returns the key as-is without lookup.
 * Use in public/shared components that render outside the dashboard layout
 * (where admin message namespaces aren't available).
 */
export const useBlankTranslations = (): TranslationFn => blankTranslator;

/** Alias */
export const useTranslations = useAdminTranslations;

// Not a pure identity: values are still substituted, otherwise
// __('Page {page} of {totalPages}', { page, totalPages }) renders its braces.
const blankTranslator: TranslationFn = Object.assign(
  (key: string, values?: TranslationValues) => fillFallback(key, values),
  {
    _n: (
      singular: string,
      plural: string,
      count: number,
      values?: TranslationValues
    ) => fillFallback(count === 1 ? singular : plural, { count, ...values }),
    _x: (key: string, _context: string, values?: TranslationValues) =>
      fillFallback(key, values),
  }
);

/**
 * Module-scope extraction marker for translatable data constants.
 * Returns the key as-is at runtime (identity function).
 *
 * WHY: The PO extractor can only pick up __('literal') calls.
 * When a string is defined in a module-scope constant and later passed
 * as a variable — __(item.label) — the extractor can't trace it back.
 * Wrapping with dataTranslations registers the key for extraction.
 *
 * USAGE (two steps — both required):
 *   // 1. At definition: register keys for PO extraction
 *   const _d = dataTranslations('General');
 *   const ITEMS = [{ label: _d('Occupation') }];
 *
 *   // 2. At render: actually translate at runtime
 *   {__(item.label)}
 *
 * Step 1 ensures the key lands in the PO file.
 * Step 2 performs the real translation lookup.
 */
export const dataTranslations = (_namespace: string): TranslationFn =>
  blankTranslator;
