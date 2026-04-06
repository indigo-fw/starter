import { defineRouting } from 'next-intl/routing';

import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';

/**
 * i18n routing config — single source of truth for locale-aware public paths.
 *
 * When adding a new public route that needs locale prefixing:
 *   1. Add entry to `pathnames` below
 *   2. The typed `Link` from `@/i18n/navigation` will accept it immediately
 *   3. Forgetting this step → compile error on `<Link href="/new-route">`
 *
 * Dashboard routes don't need locale prefixing — use `next/link` directly.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
  localeCookie: false,
  localeDetection: false,

  pathnames: {
    // ─── Public static ───────────────────────────────────────────────
    '/': '/',
    '/blog': '/blog',
    '/portfolio': '/portfolio',
    '/showcase': '/showcase',
    '/showcase/search': '/showcase/search',
    '/pricing': '/pricing',
    '/search': '/search',

    // ─── Public dynamic (catch-all content) ──────────────────────────
    '/blog/[slug]': '/blog/[slug]',
    '/category/[slug]': '/category/[slug]',
    '/tag/[slug]': '/tag/[slug]',
    '/portfolio/[slug]': '/portfolio/[slug]',
    '/[slug]': '/[slug]',

    // ─── Customer auth ───────────────────────────────────────────────
    '/login': '/login',
    '/register': '/register',
    '/forgot-password': '/forgot-password',
    '/reset-password': '/reset-password',
    '/verify-email': '/verify-email',

    // ─── Customer account ────────────────────────────────────────────
    '/account': '/account',
    '/account/settings': '/account/settings',
    '/account/security': '/account/security',
    '/account/billing': '/account/billing',
    '/account/support': '/account/support',
    '/account/support/new': '/account/support/new',
    '/account/support/[id]': '/account/support/[id]',
    '/account/affiliates': '/account/affiliates',
  },
});

/** Union of all valid locale-aware pathnames — use to type-check route strings. */
export type AppPathname = keyof typeof routing.pathnames;
