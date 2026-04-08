/**
 * Shared translation types and utilities.
 *
 * This file is safe for both client and server imports — it contains no
 * React hooks or server-only dependencies.
 */

import type { Formats } from 'next-intl';

export type TranslationValues = Record<string, string | number | Date>;

/** Context separator used to encode per-string context into JSON keys. */
export const CONTEXT_SEPARATOR = '::';

export type TranslationFn = {
  /** Simple translation: __('Save') or __('Hello {name}', { name }) */
  (key: string, values?: TranslationValues, formats?: Formats): string;

  /**
   * Plural translation: __._n('1 item', '%d items', count)
   *
   * Works with PO plural entries (msgid_plural + msgstr[0]/msgstr[1]).
   * The PO→JSON transform converts these to ICU plural format automatically.
   * At runtime, looks up the singular key with { count } as the value.
   */
  _n: (singular: string, plural: string, count: number, values?: TranslationValues) => string;

  /**
   * Context translation: __._x('Post', 'verb')
   *
   * Disambiguates identical strings with different meanings.
   * In PO: msgctxt "General::verb" + msgid "Post".
   * In JSON: key is "Post::verb" under the namespace.
   * POEdit shows the context field for translators.
   */
  _x: (key: string, context: string, values?: TranslationValues) => string;
};

/**
 * Wraps a next-intl translation function to apply the dot→@@@ key transform.
 * The PO→JSON pipeline replaces dots with @@@ (because next-intl uses dots
 * for nested key access), so we do the same at lookup time.
 */
export const createTranslationFunction = (
  t: (
    key: string,
    values?: TranslationValues,
    formats?: Formats
  ) => string
): TranslationFn => {
  const fn = ((key: string, values?: TranslationValues, formats?: Formats) => {
    const transformedKey = key.replace(/\./g, '@@@');
    return t(transformedKey, values, formats);
  }) as TranslationFn;

  fn._n = (singular: string, _plural: string, count: number, values?: TranslationValues) => {
    return fn(singular, { count, ...values });
  };

  fn._x = (key: string, context: string, values?: TranslationValues) => {
    return fn(`${key}${CONTEXT_SEPARATOR}${context}`, values);
  };

  return fn;
};

/**
 * Detect next-intl's silent missing-key fallback: "Namespace.transformedKey".
 * Exact match against the transformed key avoids false positives on real translations
 * that happen to start with the namespace (e.g. "General information about...").
 */
function fixMissingKeyFallback(
  result: string,
  namespace: string,
  transformedKey: string
): string {
  if (result === `${namespace}.${transformedKey}`) {
    return transformedKey.replace(/@@@/g, '.');
  }
  return result;
}

/**
 * Wrap a raw TranslationFn with safe missing-key fallback.
 * When next-intl silently returns "Namespace.key" for missing keys (instead of
 * throwing), this strips the prefix and returns the plain English key.
 */
export function wrapWithFallback(
  wrapped: TranslationFn,
  namespace: string
): TranslationFn {
  const fn = ((
    key: string,
    values?: TranslationValues,
    formats?: Formats
  ) => {
    try {
      const result = wrapped(key, values, formats);
      return fixMissingKeyFallback(
        result,
        namespace,
        key.replace(/\./g, '@@@')
      );
    } catch {
      return key;
    }
  }) as TranslationFn;

  fn._n = (singular, plural, count, values) => {
    try {
      const result = wrapped._n(singular, plural, count, values);
      return fixMissingKeyFallback(
        result,
        namespace,
        singular.replace(/\./g, '@@@')
      );
    } catch {
      return count === 1 ? singular : plural;
    }
  };

  fn._x = (key, context, values) => {
    try {
      const result = wrapped._x(key, context, values);
      const transformedKey = `${key.replace(/\./g, '@@@')}${CONTEXT_SEPARATOR}${context}`;
      if (result === `${namespace}.${transformedKey}`) return key;
      return result;
    } catch {
      return key;
    }
  };

  return fn;
}
