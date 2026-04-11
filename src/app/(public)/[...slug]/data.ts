import { cache } from 'react';
import { notFound } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { serverTRPC } from '@/lib/trpc/server';
import { resolveRecordVars } from '@/core/lib/content/vars';
import { resolveRecordCmsLinks } from '@/core/lib/content/cms-link';
import '@/config/cms-link-init';

/** Rethrows NOT_FOUND TRPCErrors as Next.js notFound() for proper 404 handling. */
function rethrowAsNotFound(err: unknown): never {
  if (err instanceof TRPCError && err.code === 'NOT_FOUND') notFound();
  throw err;
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
    const withVars = resolveRecordVars(post);
    return resolveRecordCmsLinks(withVars, lang);
  }
);

export const getCachedTag = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const tag = await api.tags.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  const withVars = resolveRecordVars(tag);
  return resolveRecordCmsLinks(withVars, lang);
});

export const getCachedPortfolio = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.portfolio.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    const withVars = resolveRecordVars(item);
    return resolveRecordCmsLinks(withVars, lang);
  }
);

export const getCachedShowcase = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.showcase.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    const withVars = resolveRecordVars(item);
    return resolveRecordCmsLinks(withVars, lang);
  }
);

export const getCachedCategory = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const cat = await api.categories.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  const withVars = resolveRecordVars(cat);
  return resolveRecordCmsLinks(withVars, lang);
});
