import type { Logger } from '@/core/lib/infra/logger';

import { translate } from './translation-service';

/**
 * Creates a field translator that translates non-null strings
 * and falls back to the original value on failure.
 * Preserves nullability: null in → null out, string in → string out.
 */
export function createFieldTranslator(
  targetLang: string,
  sourceLang: string,
  logger: Logger
) {
  return async <T extends string | null>(
    field: string,
    value: T
  ): Promise<T> => {
    if (!value) return value;
    try {
      return (await translate(value, targetLang, sourceLang)) as T;
    } catch (e) {
      logger.warn(`Translation failed for "${field}"`, {
        error: String(e),
      });
      return value;
    }
  };
}
