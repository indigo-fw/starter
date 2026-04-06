'use client';

import { useState } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'zh', name: '中文' },
  { code: 'cs', name: 'Čeština' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'tr', name: 'Türkçe' },
] as const;

interface LanguageSelectorProps {
  currentLang?: string | null;
  onChange: (lang: string) => void;
}

export function LanguageSelector({ currentLang, onChange }: LanguageSelectorProps) {
  const __ = useBlankTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-(--text-tertiary) hover:text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors"
        title={__('Change language')}
      >
        <Globe size={14} />
        <span>{currentLang?.toUpperCase() ?? 'EN'}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-(--surface-primary) border border-(--border-primary) rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto min-w-[140px]">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => { onChange(lang.code); setOpen(false); }}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm transition-colors',
                  currentLang === lang.code
                    ? 'bg-brand-500/10 text-brand-500 font-medium'
                    : 'text-(--text-primary) hover:bg-(--surface-secondary)',
                )}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
