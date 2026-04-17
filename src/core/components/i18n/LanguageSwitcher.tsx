'use client';

import { usePathname } from 'next/navigation';
import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { localePath } from '@/core/lib/i18n/locale';
import { useLocale } from '@/core/hooks/useLocale';
import type { Locale } from '@/lib/constants';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';

/** Only render when there are multiple locales configured */
export function LanguageSwitcher() {
  if (!IS_MULTILINGUAL) return null;

  return <LanguageSwitcherInner />;
}

function LanguageSwitcherInner() {
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const setPreferredLocale = trpc.auth.setPreferredLocale.useMutation();

  // Strip locale prefix to get the base path
  const basePath =
    currentLocale !== DEFAULT_LOCALE
      ? '/' + pathname.split('/').slice(2).join('/') || '/'
      : pathname;

  function switchLocale(locale: Locale) {
    setOpen(false);
    // Store the actual locale in the cookie (proxy uses it for redirect)
    document.cookie = `locale-chosen=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    // Save to DB for logged-in users (fire-and-forget)
    if (session?.user) {
      setPreferredLocale.mutate({ locale });
    }
    // Full page reload — NextIntlClientProvider must re-render with new messages
    const target = localePath(basePath, locale);
    requestAnimationFrame(() => {
      window.location.assign(target);
    });
  }

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="icon-btn"
        title="Language"
        aria-label={`Language: ${LOCALE_LABELS[currentLocale]}`}
      >
        <Globe className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 min-w-[140px] rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
          {LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => switchLocale(locale)}
              className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-(--surface-secondary) ${
                locale === currentLocale
                  ? 'font-medium text-(--text-primary)'
                  : 'text-(--text-muted)'
              }`}
            >
              {LOCALE_LABELS[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
