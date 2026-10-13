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
  _n: (
    singular: string,
    plural: string,
    count: number,
    values?: TranslationValues
  ) => string;

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
  t: (key: string, values?: TranslationValues, formats?: Formats) => string
): TranslationFn => {
  const fn = ((key: string, values?: TranslationValues, formats?: Formats) => {
    const transformedKey = key.replace(/\./g, '@@@');
    return t(transformedKey, values, formats);
  }) as TranslationFn;

  fn._n = (
    singular: string,
    _plural: string,
    count: number,
    values?: TranslationValues
  ) => {
    return fn(singular, { count, ...values });
  };

  fn._x = (key: string, context: string, values?: TranslationValues) => {
    return fn(`${key}${CONTEXT_SEPARATOR}${context}`, values);
  };

  return fn;
};

/**
 * English fallback for a key the catalog cannot serve: fill `{name}` values
 * (and `%d`/`%s` from `count`) the way the catalog would, so a missing key
 * reads as English ("Page 2 of 5") rather than as a template
 * ("Page {page} of {totalPages}"). Unknown placeholders are left untouched so
 * a typo in a call site stays visible instead of silently vanishing.
 */
export function fillFallback(text: string, values?: TranslationValues): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}|%[ds]/g, (match, name?: string) => {
    const value = name === undefined ? values.count : values[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * What next-intl returns for a message it cannot serve (missing key, ICU
 * formatting error): "Namespace.key" with the key exactly as looked up (dots
 * already @@@). This mirrors use-intl's default, which the client provider
 * uses; i18n/request.ts passes this same function on the server so both sides
 * produce ONE form — the same in dev and prod — and wrapWithFallback() can
 * recognise it everywhere. Diverging forms (e.g. a dev-only namespace prefix)
 * made the server render the raw template while the client rendered English.
 */
export function getMessageFallback({
  key,
  namespace,
}: {
  key: string;
  namespace?: string;
}): string {
  return namespace ? `${namespace}.${key}` : key;
}

/**
 * Wrap a raw TranslationFn with safe missing-key fallback: when next-intl
 * returns the getMessageFallback() form (or throws), return the English key
 * with its values filled instead. Exact match against the transformed key
 * avoids false positives on real translations that happen to start with the
 * namespace (e.g. "General information about...").
 */
export function wrapWithFallback(
  wrapped: TranslationFn,
  namespace: string
): TranslationFn {
  const isMissing = (result: string, lookupKey: string) =>
    result ===
    getMessageFallback({ key: lookupKey.replace(/\./g, '@@@'), namespace });

  const fn = ((key: string, values?: TranslationValues, formats?: Formats) => {
    try {
      const result = wrapped(key, values, formats);
      return isMissing(result, key) ? fillFallback(key, values) : result;
    } catch {
      return fillFallback(key, values);
    }
  }) as TranslationFn;

  fn._n = (singular, plural, count, values) => {
    const english = () =>
      fillFallback(count === 1 ? singular : plural, { count, ...values });
    try {
      const result = wrapped._n(singular, plural, count, values);
      return isMissing(result, singular) ? english() : result;
    } catch {
      return english();
    }
  };

  fn._x = (key, context, values) => {
    try {
      const result = wrapped._x(key, context, values);
      return isMissing(result, `${key}${CONTEXT_SEPARATOR}${context}`)
        ? fillFallback(key, values)
        : result;
    } catch {
      return fillFallback(key, values);
    }
  };

  return fn;
}
