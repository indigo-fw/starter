'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { Copy, Languages, Loader2, Plus } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { toast } from '@/core/store/toast-store';
import { cn } from '@/lib/utils';

interface Translation {
  id: string;
  lang: string;
  slug: string;
}

interface TranslationBarProps {
  currentLang: string;
  translations: Translation[];
  adminSlug: string;
  translationAvailable?: boolean;
  onDuplicate: (targetLang: string, autoTranslate: boolean) => Promise<void>;
  locales: readonly string[];
  localeLabels: Record<string, string>;
  editUrl: (id: string, lang: string) => string;
}

export function TranslationBar({
  currentLang, translations, adminSlug: _adminSlug, translationAvailable, onDuplicate,
  locales, localeLabels, editUrl,
}: TranslationBarProps) {
  const __ = useAdminTranslations();
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [dropdownLang, setDropdownLang] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownLang) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownLang(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownLang(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownLang]);

  if (locales.length <= 1) return null;

  const existingLangs = new Set([currentLang, ...translations.map((t) => t.lang)]);
  const missingLangs = locales.filter((l) => !existingLangs.has(l));

  const handleDuplicate = async (lang: string, autoTranslate: boolean) => {
    setDropdownLang(null);
    setDuplicating(lang);
    try {
      await onDuplicate(lang, autoTranslate);
    } catch (error) {
      setDuplicating(null);
      const msg = error instanceof Error ? error.message : __('Failed to create translation');
      toast.error(msg);
    }
  };

  return (
    <div className="translation-bar">
      <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
        {__('Language')}
      </label>
      <div className="translation-chips flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white">
          {localeLabels[currentLang] ?? currentLang}
        </span>

        {translations.map((t) => (
          <Link
            key={t.lang}
            href={editUrl(t.id, t.lang)}
            className="rounded-md border border-(--border-primary) px-3 py-1 text-sm text-(--text-secondary) transition-colors hover:border-brand-500 hover:text-(--text-primary)"
          >
            {localeLabels[t.lang] ?? t.lang}
          </Link>
        ))}

        {missingLangs.map((lang) => (
          <div key={lang} className="relative" ref={dropdownLang === lang ? dropdownRef : undefined}>
            <button
              type="button"
              disabled={duplicating !== null}
              aria-haspopup={translationAvailable ? 'true' : undefined}
              aria-expanded={dropdownLang === lang ? true : undefined}
              onClick={() => {
                if (translationAvailable) {
                  setDropdownLang(dropdownLang === lang ? null : lang);
                } else {
                  handleDuplicate(lang, false);
                }
              }}
              className={cn(
                'flex items-center gap-1 rounded-md border border-dashed border-(--border-primary) px-3 py-1 text-sm text-(--text-muted) transition-colors',
                duplicating === lang
                  ? 'cursor-wait'
                  : 'hover:border-brand-500 hover:text-(--text-secondary)'
              )}
            >
              {duplicating === lang ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {localeLabels[lang] ?? lang}
            </button>

            {dropdownLang === lang && (
              <div role="menu" className="absolute left-0 top-full z-10 mt-1 min-w-40 rounded-md border border-(--border-primary) bg-(--bg-primary) py-1 shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--bg-secondary)"
                  onClick={() => handleDuplicate(lang, false)}
                >
                  <Copy size={14} />
                  {__('Copy')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--bg-secondary)"
                  onClick={() => handleDuplicate(lang, true)}
                >
                  <Languages size={14} />
                  {__('Copy & Translate')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
