import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { serverTRPC } from '@/lib/trpc/server';
import { CONTENT_TYPES } from '@/config/cms';
import { localePath } from '@/core/lib/i18n/locale';
import { getForwardedSearch } from '@/core/lib/i18n/locale-server';
import { LOCALES, DEFAULT_LOCALE } from '@/lib/constants';
import type { Locale } from '@/lib/constants';
import { resolveRecordVars } from '@/core/lib/content/vars';
import { resolveRecordCmsLinks } from '@/core/lib/content/cms-link';
import { resolveRecordAssetUris } from '@/core/lib/content/asset-link';
import {
  getPostTranslationSiblings,
  getCategoryTranslationSiblings,
  getPortfolioTranslationSiblings,
  getShowcaseTranslationSiblings,
} from './queries';
import '@/config/cms-link-init';

/** Rethrows NOT_FOUND TRPCErrors as Next.js notFound() for proper 404 handling. */
function rethrowAsNotFound(err: unknown): never {
  if (err instanceof TRPCError && err.code === 'NOT_FOUND') notFound();
  throw err;
}

/**
 * When a fallback-rendered item actually HAS a translation in the requested
 * locale under a DIFFERENT slug (a `translationOf` localized slug), 308 to the
 * real localized URL instead of rendering the default-locale fallback with a
 * "not available in your language" banner - the page IS available, just at
 * another slug. E.g. /de/create-ai-boyfriend → /de/ki-freund-erstellen.
 * Preserves the query string (utm_*, gclid, ref) via getForwardedSearch().
 * No-op unless the fetch fell back, so the happy path costs nothing.
 */
/** urlPrefix of a content type by id (config-driven, no hardcoded paths). */
function prefixOf(contentTypeId: string): string {
  return CONTENT_TYPES.find((ct) => ct.id === contentTypeId)?.urlPrefix ?? '/';
}

async function redirectIfLocalizedSlugExists(
  record: { id: string; isFallback?: boolean },
  requestedSlug: string,
  lang: string,
  urlPrefix: string,
  getSiblings: (id: string) => Promise<{ lang: string; slug: string }[]>,
): Promise<void> {
  if (!record.isFallback) return;
  if (!(LOCALES as readonly string[]).includes(lang) || lang === DEFAULT_LOCALE)
    return;
  const siblings = await getSiblings(record.id);
  const localized = siblings.find(
    (s) => s.lang === lang && s.slug !== requestedSlug
  );
  if (!localized) return;
  const search = await getForwardedSearch();
  const path =
    urlPrefix === '/' ? `/${localized.slug}` : `${urlPrefix}${localized.slug}`;
  permanentRedirect(localePath(path + search, lang as Locale));
}

/**
 * React.cache()-wrapped data fetchers for the catch-all route.
 *
 * Both generateMetadata and the page renderer call these functions
 * with the same arguments. React.cache() deduplicates within a single
 * request so the DB is only hit once per content item per page load.
 *
 * getCachedTRPC() ensures only one tRPC caller is constructed per
 * request — renderers should use this instead of importing serverTRPC
 * directly for additional queries (tags, related posts, etc.).
 *
 * Note: React.cache() memoizes by argument identity (Object.is for
 * primitives). Since all args here are strings/numbers, this works
 * correctly. Preview requests use different args (previewToken) so
 * they correctly bypass the metadata cache entry.
 */

/** Cached tRPC caller — one instance per request. */
export const getCachedTRPC = cache(async () => {
  return serverTRPC();
});

export const getCachedPost = cache(
  async (slug: string, type: number, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const post = await api.cms.getBySlug({ slug, type, lang, previewToken }).catch(rethrowAsNotFound);
    const urlPrefix =
      CONTENT_TYPES.find((ct) => 'postType' in ct && ct.postType === type)
        ?.urlPrefix ?? '/';
    await redirectIfLocalizedSlugExists(post, slug, lang, urlPrefix, getPostTranslationSiblings);
    const withVars = resolveRecordVars(post);
    const withAssets = await resolveRecordAssetUris(withVars);
    return resolveRecordCmsLinks(withAssets, lang);
  }
);

export const getCachedTag = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const tag = await api.tags.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  const withVars = resolveRecordVars(tag);
  const withAssets = await resolveRecordAssetUris(withVars);
  return resolveRecordCmsLinks(withAssets, lang);
});

export const getCachedPortfolio = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.portfolio.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    await redirectIfLocalizedSlugExists(item, slug, lang, prefixOf('portfolio'), getPortfolioTranslationSiblings);
    const withVars = resolveRecordVars(item);
    const withAssets = await resolveRecordAssetUris(withVars);
    return resolveRecordCmsLinks(withAssets, lang);
  }
);

export const getCachedShowcase = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.showcase.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    await redirectIfLocalizedSlugExists(item, slug, lang, prefixOf('showcase'), getShowcaseTranslationSiblings);
    const withVars = resolveRecordVars(item);
    const withAssets = await resolveRecordAssetUris(withVars);
    return resolveRecordCmsLinks(withAssets, lang);
  }
);

export const getCachedCategory = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const cat = await api.categories.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  await redirectIfLocalizedSlugExists(cat, slug, lang, prefixOf('category'), getCategoryTranslationSiblings);
  const withVars = resolveRecordVars(cat);
  const withAssets = await resolveRecordAssetUris(withVars);
  return resolveRecordCmsLinks(withAssets, lang);
});
