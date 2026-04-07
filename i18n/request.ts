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

  // Always load English as base, then overlay locale-specific translations.
  // Missing keys in non-EN locales automatically fall back to the English value.
  // Admin translations are loaded separately in the dashboard layout.
  let messages: Record<string, Record<string, string>> = {};
  try {
    const en: Record<string, Record<string, string>> = (
      await import('../locales/build/en.json')
    ).default;
    if (locale === 'en') {
      messages = en;
    } else {
      const localeMessages: Record<string, Record<string, string>> = (
        await import(`../locales/build/${locale}.json`)
      ).default;
      // Deep merge: EN base + locale overlay
      messages = { ...en };
      for (const ns of Object.keys(localeMessages)) {
        messages[ns] = { ...(en[ns] || {}), ...localeMessages[ns] };
      }
    }
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
    getMessageFallback({ key, namespace }) {
      const rawKey = key.replace(/@@@/g, '.');
      // Dev: show namespace prefix so missing translations are obvious
      if (process.env.NODE_ENV === 'development' && namespace) {
        return `${namespace}.${rawKey}`;
      }
      return rawKey;
    },
  };
});
