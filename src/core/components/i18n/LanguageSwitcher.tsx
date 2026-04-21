'use client';

import { LOCALES, DEFAULT_LOCALE, LOCALE_LABELS, IS_MULTILINGUAL } from '@/lib/constants';
import { useLocale } from '@/core/hooks/useLocale';
import type { Locale } from '@/lib/constants';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth-client';

/** Strip locale prefix from a pathname (e.g. /de/category/woman → /category/woman) */
function stripLocalePrefix(pathname: string, locale: string): string {
  if (locale === DEFAULT_LOCALE) return pathname;
  if (pathname === `/${locale}`) return '/';
  if (pathname.startsWith(`/${locale}/`))
    return pathname.slice(locale.length + 1);
  return pathname;
}

/** Only render when there are multiple locales configured */
export function LanguageSwitcher() {
  if (!IS_MULTILINGUAL) return null;

  return <LanguageSwitcherInner />;
}

function LanguageSwitcherInner() {
  const currentLocale = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const setPreferredLocale = trpc.auth.setPreferredLocale.useMutation();

  // Always include locale prefix (even for default locale) so the proxy
  // recognizes it as an explicit language choice and updates the cookie.
  // Uses window.location.pathname (always resolved, no [slug] templates).
  function buildUrl(locale: Locale): string {
    if (typeof window === 'undefined') return `/${locale}`;
    const basePath = stripLocalePrefix(window.location.pathname, currentLocale);
    return `/${locale}${basePath}${window.location.search}`;
  }

  function switchLocale(locale: Locale) {
    setOpen(false);
    // Save to DB for logged-in users (fire-and-forget).
    // Proxy is Edge (no DB access), so this is the only DB update path.
    if (session?.user) {
      setPreferredLocale.mutate({ locale });
    }
    // Full page reload — root layout must re-render with new locale messages.
    // Cookie is set by the proxy on the resulting request.
    window.location.href = buildUrl(locale);
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
