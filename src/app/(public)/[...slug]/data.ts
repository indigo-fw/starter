import { cache } from 'react';
import { notFound } from 'next/navigation';
import { TRPCError } from '@trpc/server';
import { serverTRPC } from '@/lib/trpc/server';
import { resolveRecordVars } from '@/core/lib/content/vars';

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
    return resolveRecordVars(post);
  }
);

export const getCachedTag = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const tag = await api.tags.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  return resolveRecordVars(tag);
});

export const getCachedPortfolio = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.portfolio.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    return resolveRecordVars(item);
  }
);

export const getCachedShowcase = cache(
  async (slug: string, lang: string, previewToken?: string) => {
    const api = await getCachedTRPC();
    const item = await api.showcase.getBySlug({ slug, lang, previewToken }).catch(rethrowAsNotFound);
    return resolveRecordVars(item);
  }
);

export const getCachedCategory = cache(async (slug: string, lang: string) => {
  const api = await getCachedTRPC();
  const cat = await api.categories.getBySlug({ slug, lang }).catch(rethrowAsNotFound);
  return resolveRecordVars(cat);
});
