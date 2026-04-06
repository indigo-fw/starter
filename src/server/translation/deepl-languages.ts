/**
 * DeepL supported target languages and validation utilities.
 */

export interface DeepLLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * All DeepL-supported target languages (~32).
 * Codes match DeepL API target_lang values.
 *
 * To enable translation: uncomment the language entries below.
 * Everything else cascades automatically.
 */
export const DEEPL_ENABLED_LANGUAGES: DeepLLanguage[] = [
  // { code: 'AR', name: 'Arabic', nativeName: 'العربية' },
  // { code: 'BG', name: 'Bulgarian', nativeName: 'Български' },
  // { code: 'CS', name: 'Czech', nativeName: 'Čeština' },
  // { code: 'DA', name: 'Danish', nativeName: 'Dansk' },
  { code: 'DE', name: 'German', nativeName: 'Deutsch' },
  // { code: 'EL', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'EN', name: 'English', nativeName: 'English' },
  { code: 'ES', name: 'Spanish', nativeName: 'Español' },
  // { code: 'ET', name: 'Estonian', nativeName: 'Eesti' },
  // { code: 'FI', name: 'Finnish', nativeName: 'Suomi' },
  // { code: 'FR', name: 'French', nativeName: 'Français' },
  // { code: 'HU', name: 'Hungarian', nativeName: 'Magyar' },
  // { code: 'ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  // { code: 'IT', name: 'Italian', nativeName: 'Italiano' },
  // { code: 'JA', name: 'Japanese', nativeName: '日本語' },
  // { code: 'KO', name: 'Korean', nativeName: '한국어' },
  // { code: 'LT', name: 'Lithuanian', nativeName: 'Lietuvių' },
  // { code: 'LV', name: 'Latvian', nativeName: 'Latviešu' },
  // { code: 'NB', name: 'Norwegian', nativeName: 'Norsk bokmål' },
  // { code: 'NL', name: 'Dutch', nativeName: 'Nederlands' },
  // { code: 'PL', name: 'Polish', nativeName: 'Polski' },
  // {
  //   code: 'PT-BR',
  //   name: 'Portuguese (Brazil)',
  //   nativeName: 'Português (Brasil)',
  // },
  // {
  //   code: 'PT-PT',
  //   name: 'Portuguese (Portugal)',
  //   nativeName: 'Português (Portugal)',
  // },
  // { code: 'RO', name: 'Romanian', nativeName: 'Română' },
  // { code: 'RU', name: 'Russian', nativeName: 'Русский' },
  // { code: 'SK', name: 'Slovak', nativeName: 'Slovenčina' },
  // { code: 'SL', name: 'Slovenian', nativeName: 'Slovenščina' },
  // { code: 'SV', name: 'Swedish', nativeName: 'Svenska' },
  // { code: 'TR', name: 'Turkish', nativeName: 'Türkçe' },
  // { code: 'UK', name: 'Ukrainian', nativeName: 'Українська' },
  // { code: 'ZH-HANS', name: 'Chinese (Simplified)', nativeName: '中文(简体)' },
  // { code: 'ZH-HANT', name: 'Chinese (Traditional)', nativeName: '中文(繁體)' },
];

/** All known DeepL language codes (for validating user preferences even when translation is disabled) */
const ALL_DEEPL_LANG_CODES = new Set([
  'AR',
  'BG',
  'CS',
  'DA',
  'DE',
  'EL',
  'EN',
  'ES',
  'ET',
  'FI',
  'FR',
  'HU',
  'ID',
  'IT',
  'JA',
  'KO',
  'LT',
  'LV',
  'NB',
  'NL',
  'PL',
  'PT-BR',
  'PT-PT',
  'RO',
  'RU',
  'SK',
  'SL',
  'SV',
  'TR',
  'UK',
  'ZH-HANS',
  'ZH-HANT',
]);

/** Fast lookup set for currently enabled languages */
const DEEPL_LANG_CODE_SET = new Set(DEEPL_ENABLED_LANGUAGES.map((l) => l.code));

/** Is this a known DeepL language code? (for saving user preferences) */
export function isKnownDeepLLang(code: string): boolean {
  return ALL_DEEPL_LANG_CODES.has(code.toUpperCase());
}

/** Is this a currently enabled target language? (for active translation features) */
export function isValidDeepLLang(code: string): boolean {
  return DEEPL_LANG_CODE_SET.has(code.toUpperCase());
}

/** Whether any non-English target languages are enabled (false = translation disabled) */
export const hasTranslationLanguages = DEEPL_ENABLED_LANGUAGES.some(
  (l) => l.code !== 'EN'
);

/** Get the English name for a DeepL language code, or null if invalid */
export function getDeepLLanguageName(code: string): string | null {
  const upper = code.toUpperCase();
  const lang = DEEPL_ENABLED_LANGUAGES.find((l) => l.code === upper);
  return lang?.name ?? null;
}

/**
 * Maps DeepL source language codes (returned by auto-detect) to target language codes.
 * Source codes differ from target codes for some languages.
 */
export const SOURCE_TO_TARGET_LANG: Record<string, string> = {
  EN: 'EN',
  PT: 'PT-PT',
  ZH: 'ZH-HANS',
};

/**
 * Convert a DeepL detected source language code to the corresponding target code.
 * Most languages map 1:1 (e.g. "DE" → "DE"), only a few need translation.
 */
export function mapSourceToTargetLang(sourceCode: string): string {
  const upper = sourceCode.toUpperCase();
  return SOURCE_TO_TARGET_LANG[upper] ?? upper;
}
