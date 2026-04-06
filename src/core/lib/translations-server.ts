/**
 * Server-only translation helpers — powered by next-intl/server.
 *
 * `getServerTranslations(namespace?)` — for server components and route handlers.
 *
 * Separated from translations.ts to avoid importing server-only modules
 * in client component bundles.
 */

import 'server-only';

import { getTranslations as getBaseTranslations } from 'next-intl/server';
import { createTranslationFunction, type TranslationFn } from './translation-shared';

export type { TranslationFn } from './translation-shared';

/** Server-side translation function — wraps next-intl's getTranslations */
export const getServerTranslations = async (
  namespace: string = 'General'
): Promise<TranslationFn> => {
  const t = await getBaseTranslations(namespace);
  return createTranslationFunction(t);
};
