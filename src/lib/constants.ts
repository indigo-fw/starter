/** Milliseconds in one day */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Default locale */
export const DEFAULT_LOCALE = 'en';

/** Supported locales */
export const LOCALES = [
  'en',
  'de',
  'es',
  'fr',
  'pt',
  'it',
  'nl',
  'pl',
  'cs',
  'tr',
  'ja',
  'ko',
  'sv',
  'da',
  'nb',
  'fi',
] as const;
export type Locale = (typeof LOCALES)[number];

/** Human-readable labels for each locale */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
  nl: 'Nederlands',
  pl: 'Polski',
  cs: 'Čeština',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  sv: 'Svenska',
  da: 'Dansk',
  nb: 'Norsk bokmål',
  fi: 'Suomi',
};

/** Whether the site supports multiple languages. When false (single locale),
 * all i18n UI is hidden: language switcher, suggestion banner, translation bar,
 * language columns, duplicate-as-translation, hreflang tags. */
export const IS_MULTILINGUAL = LOCALES.length > 1;

/**
 * Whether multi-org UI is visible to users (OrgSwitcher, org management).
 * When false, a personal org is still created automatically under the hood
 * so billing/tokens work — the user just never sees org-related UI.
 */
export const ORGANIZATIONS_VISIBLE = process.env.NEXT_PUBLIC_ORGANIZATIONS_VISIBLE !== 'false';
