import { routing } from '../src/i18n/routing';
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';

import { getMessageFallback } from '@/core/lib/i18n/translation-shared';
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/lib/constants';

type Catalog = Record<string, Record<string, string>>;

// Merged catalogs are built ONCE per locale and handed out with the same
// object identity on every request. The previous per-request deep merge
// allocated a fresh full catalog for every non-EN request, and next-intl's
// per-request cache retained each copy (next-intl#2174, vercel/next.js#88603),
// so RSS grew with traffic. Bounded by LOCALES (one entry per locale), so no
// eviction is needed; the stat makes it visible on /api/health regardless.
const mergedMessagesCache = new Map<Locale, Catalog>();
registerMemoryStat('i18n.mergedCatalogs', () => mergedMessagesCache.size);

// In dev `bun run i18n:watch` regenerates locales/build/*.json while the server
// runs; bypassing the cache there keeps edits visible without a restart. The
// leak only matters under production traffic, so this costs nothing real.
const CACHE_ENABLED = process.env.NODE_ENV !== 'development';

async function loadCatalog(locale: Locale): Promise<Catalog> {
  // Computed specifier (not a bare string literal) so `tsc` treats this as a
  // runtime dynamic import and does NOT resolve it at type-check time — the
  // generated `locales/build/*.json` are gitignored, so a fresh install would
  // otherwise fail `bun run typecheck` before `bun run i18n`/`init` runs.
  const mod: { default: Catalog } = await import(
    `../locales/build/${locale}.json`
  );
  return mod.default;
}

// Always load English as base, then overlay locale-specific translations so
// missing keys in non-EN locales fall back to the English value. Admin
// translations are loaded separately in the dashboard layout.
async function buildMergedMessages(locale: Locale): Promise<Catalog> {
  let messages: Catalog = {};
  try {
    const en = await loadCatalog(DEFAULT_LOCALE);
    if (locale === DEFAULT_LOCALE) {
      messages = en;
    } else {
      const localeMessages = await loadCatalog(locale);
      messages = { ...en };
      for (const ns of Object.keys(localeMessages)) {
        messages[ns] = { ...(en[ns] || {}), ...localeMessages[ns] };
      }
    }
  } catch {
    // JSON not generated yet — translations fall back to the English keys
    // (filled by wrapWithFallback / getMessageFallback below).
  }
  return messages;
}

async function getMergedMessages(locale: Locale): Promise<Catalog> {
  if (!CACHE_ENABLED) return buildMergedMessages(locale);
  const cached = mergedMessagesCache.get(locale);
  if (cached) return cached;
  const built = await buildMergedMessages(locale);
  mergedMessagesCache.set(locale, built);
  return built;
}

export default getRequestConfig(async () => {
  const h = await headers();
  const raw = h.get('x-locale') || DEFAULT_LOCALE;
  const locale: Locale = (LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : DEFAULT_LOCALE;

  const messages = await getMergedMessages(locale);

  return {
    locale,
    messages,
    routing,

    // Graceful fallback: a missing message is expected (English keys ARE the
    // source strings), so it never logs; anything else is a real error.
    onError(error) {
      if (error.code === 'MISSING_MESSAGE') return;
      console.error('[next-intl]', error.message);
    },
    // Same "Namespace.key" form the client provider produces, so
    // wrapWithFallback() detects a missing key identically on both sides and
    // renders filled English instead of a template ("Page {page} of {total}").
    getMessageFallback,
  };
});
