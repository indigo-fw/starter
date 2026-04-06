/**
 * Translation helpers — client-safe, powered by next-intl.
 *
 * `useAdminTranslations(namespace?)` — admin/core client components (next-intl hook).
 *   Requires messages loaded by the dashboard layout (public + admin merged).
 *   Do NOT use in components rendered on public pages — the admin namespace won't exist.
 *
 * `useBlankTranslations()` — public/shared client components (identity function).
 *   Returns keys as-is. Use for components that render outside the dashboard layout.
 *
 * `dataTranslations(namespace)` — module-scope extraction marker (identity at runtime).
 *
 * For server components, use `getServerTranslations` from
 * `@/core/lib/translations-server` (or the re-export at `@/lib/translations-server`).
 *
 * The PO→JSON pipeline replaces dots with @@@ in keys, so we apply the same
 * transform at lookup time to match.
 */

import { useTranslations as useBaseTranslations } from 'next-intl';
import type { Formats } from 'next-intl';
import { createTranslationFunction, type TranslationFn, type TranslationValues } from './translation-shared';

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
  const wrapped = createTranslationFunction(t);
  const fn = ((key: string, values?: TranslationValues, formats?: Formats) => {
    try {
      return wrapped(key, values, formats);
    } catch {
      // Missing key — return the raw key (reverse @@@ transform if present)
      return key.replace(/@@@/g, '.');
    }
  }) as TranslationFn;
  fn._n = (singular, plural, count, values) => {
    try {
      return wrapped._n(singular, plural, count, values);
    } catch {
      return count === 1 ? singular : plural;
    }
  };
  fn._x = (key, context, values) => {
    try {
      return wrapped._x(key, context, values);
    } catch {
      return key;
    }
  };
  return fn;
}

/**
 * No-op translation hook — returns the key as-is without lookup.
 * Use in public/shared components that render outside the dashboard layout
 * (where admin message namespaces aren't available).
 */
export const useBlankTranslations = (): TranslationFn => blankTranslator;

/** Alias */
export const useTranslations = useAdminTranslations;

const blankTranslator: TranslationFn = Object.assign(
  (key: string) => key,
  {
    _n: (singular: string, plural: string, count: number) => count === 1 ? singular : plural,
    _x: (key: string) => key,
  },
);

/**
 * Module-scope extraction marker — identity function at runtime.
 *
 * Use for translatable strings in data constants outside components/handlers.
 * The generate-po script extracts these keys under the given namespace.
 * At render time, translate via `useAdminTranslations(sameNamespace)` (admin) or `useBlankTranslations()` (public).
 */
export const dataTranslations = (_namespace: string): TranslationFn =>
  blankTranslator;
