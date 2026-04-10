import 'server-only';
import { headers } from 'next/headers';
import { IS_MULTILINGUAL } from '@/lib/constants';

interface LanguageSuggestion {
  suggestedLocale: string;
  messageInCurrentLang: string;
  messageInSuggestedLang: string;
}

// Translation key used in PO files: "This page is available in {language}"
const SUGGESTION_KEY = 'This page is available in {language}';

/**
 * Server-side language detection + message loading.
 *
 * Reads the browser's Accept-Language header, finds the best matching locale
 * that differs from the current one, and loads the suggestion message from
 * both the current and suggested locale's translation files.
 *
 * Returns null if no suggestion is needed (same language, unsupported, etc.)
 */
export async function getLanguageSuggestion(
  currentLocale: string,
  locales: readonly string[],
  localeLabels: Record<string, string>,
): Promise<LanguageSuggestion | null> {
  if (!IS_MULTILINGUAL) return null;

  // Read Accept-Language header
  const h = await headers();
  const acceptLang = h.get('accept-language');
  if (!acceptLang) return null;

  // Parse Accept-Language: "de-DE,de;q=0.9,en;q=0.8" → ['de', 'en']
  const preferred = acceptLang
    .split(',')
    .map((part) => {
      const [lang] = part.trim().split(';');
      return lang.split('-')[0].toLowerCase();
    })
    .filter(Boolean);

  // Find best match that differs from current locale
  let suggestedLocale: string | null = null;
  for (const code of preferred) {
    if (code !== currentLocale && locales.includes(code)) {
      suggestedLocale = code;
      break;
    }
  }

  if (!suggestedLocale) return null;

  const suggestedLabel = localeLabels[suggestedLocale] ?? suggestedLocale;

  // Load message from current locale's translations
  const messageInCurrentLang = await loadSuggestionMessage(currentLocale, suggestedLabel);
  // Load message from suggested locale's translations (in their language)
  const messageInSuggestedLang = await loadSuggestionMessage(suggestedLocale, suggestedLabel);

  return {
    suggestedLocale,
    messageInCurrentLang,
    messageInSuggestedLang,
  };
}

/**
 * Load the suggestion message from a locale's translation file.
 * Falls back to English pattern if not found.
 */
async function loadSuggestionMessage(locale: string, languageLabel: string): Promise<string> {
  try {
    const messages = (await import(`../../../locales/build/${locale}.json`)).default as Record<string, Record<string, string>>;
    const key = SUGGESTION_KEY.replace(/\./g, '@@@');
    const translated = messages?.General?.[key];
    if (translated) {
      return translated.replace('{language}', languageLabel);
    }
  } catch { /* file not found */ }

  // Fallback: use the raw English key
  return SUGGESTION_KEY.replace('{language}', languageLabel);
}
