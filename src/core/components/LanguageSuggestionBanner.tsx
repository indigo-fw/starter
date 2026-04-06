'use client';

import { useEffect, useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { localePath } from '@/core/lib/locale';
import { useLocale } from '@/core/hooks/useLocale';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'lang-suggestion-dismissed';

/** Flag emoji for locale codes */
export const LOCALE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  es: '🇪🇸',
  de: '🇩🇪',
  fr: '🇫🇷',
  it: '🇮🇹',
  pt: '🇵🇹',
  nl: '🇳🇱',
  pl: '🇵🇱',
  cs: '🇨🇿',
  sk: '🇸🇰',
  da: '🇩🇰',
  sv: '🇸🇪',
  fi: '🇫🇮',
  no: '🇳🇴',
  hu: '🇭🇺',
  ro: '🇷🇴',
  bg: '🇧🇬',
  el: '🇬🇷',
  tr: '🇹🇷',
  ja: '🇯🇵',
  ko: '🇰🇷',
  zh: '🇨🇳',
  ar: '🇸🇦',
  ru: '🇷🇺',
  uk: '🇺🇦',
};

interface Props {
  /** Locale code to suggest (e.g., 'de') — determined by the server */
  suggestedLocale: string;
  /** Message in the current page language: "This page is available in Deutsch" */
  messageInCurrentLang: string;
  /** Message in the suggested language: "Diese Seite ist auf Deutsch verfügbar" */
  messageInSuggestedLang: string;
  /** Default locale for path calculation */
  defaultLocale: string;
}

/**
 * Non-blocking language suggestion banner.
 *
 * The server detects browser language from Accept-Language header,
 * loads both locale's translation files, and renders both messages.
 * This client component handles dismiss (localStorage) and switch (full reload).
 */
export function LanguageSuggestionBanner({
  suggestedLocale,
  messageInCurrentLang,
  messageInSuggestedLang,
  defaultLocale,
}: Props) {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        startTransition(() => setVisible(true));
      }
    } catch { /* SSR or quota */ }
  }, []);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* quota */ }
  }

  function switchLocale() {
    dismiss();
    // Mark that user explicitly chose a locale
    document.cookie = 'locale-chosen=1; path=/; max-age=31536000; SameSite=Lax';
    const basePath = currentLocale !== defaultLocale
      ? '/' + pathname.split('/').slice(2).join('/') || '/'
      : pathname;
    window.location.href = localePath(basePath, suggestedLocale as never);
  }

  if (!visible) return null;

  const flag = LOCALE_FLAGS[suggestedLocale] ?? '🌐';

  return (
    <div className="lang-suggestion-banner flex items-center justify-center gap-3 border-b border-(--border-primary) bg-(--surface-secondary) px-4 py-2 text-sm">
      <span className="text-base leading-none">{flag}</span>
      <span className="text-(--text-secondary)">{messageInCurrentLang}</span>
      <span className="text-(--text-muted)">·</span>
      <button
        onClick={switchLocale}
        className="font-medium text-brand-600 dark:text-brand-400 hover:underline transition-colors"
      >
        {messageInSuggestedLang}
      </button>
      <button
        onClick={dismiss}
        className="rounded p-0.5 text-(--text-muted) transition-colors hover:text-(--text-secondary)"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
