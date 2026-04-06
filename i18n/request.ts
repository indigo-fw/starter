import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/constants';
import { routing } from '../src/i18n/routing';

export default getRequestConfig(async () => {
  const h = await headers();
  const raw = h.get('x-locale') || DEFAULT_LOCALE;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  // Load public translations only — admin translations are loaded separately
  // in the dashboard layout to avoid exposing admin strings to public pages.
  let messages = {};
  try {
    messages = (await import(`../locales/build/${locale}.json`)).default;
  } catch {
    // JSON not generated yet — translations will fall back to English keys.
  }

  return {
    locale,
    messages,
    routing,

    // Graceful fallback: return the raw key instead of crashing on missing translations.
    // In dev this logs a warning; in prod it silently falls back to the key string.
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') return;
      console.error('[next-intl]', error.message);
    },
    getMessageFallback({ key }) {
      // Return the raw key as fallback — reverse the dot→@@@ transform
      return key.replace(/@@@/g, '.');
    },
  };
});
