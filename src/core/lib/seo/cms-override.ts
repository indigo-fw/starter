import { cache } from 'react';

import {
  initCmsOverrideSync,
  invalidateCmsOverrideCache,
  readCache,
  writeCache,
} from './cms-override-sync';
import 'server-only';

import { publishedPageWhere } from '@/core/crud/page-seo';
import { getLocale } from '@/core/lib/i18n/locale-server';
import { getScopedKey } from '@/core/lib/infra/scope';
import type { DbClient } from '@/server/db';
import { db } from '@/server/db';
import { cmsPosts } from '@/server/db/schema/cms';

// Cache + Redis invalidation live in `cms-override-sync.ts` (importable from
// the Bun entry); re-exported here so existing importers keep working.
export { initCmsOverrideSync, invalidateCmsOverrideCache };

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CmsOverrideSEO {
  seoTitle: string | null;
  metaDescription: string | null;
  noindex: boolean;
  jsonLd: string | null;
}

export interface CmsOverride {
  seo: CmsOverrideSEO;
  content: string | null;
}

// ─── Core fetch (accepts explicit db + locale) ─────────────────────────────

async function fetchOverride(
  database: DbClient,
  slug: string,
  lang: string
): Promise<CmsOverride | null> {
  const [post] = await database
    .select({
      seoTitle: cmsPosts.seoTitle,
      metaDescription: cmsPosts.metaDescription,
      noindex: cmsPosts.noindex,
      jsonLd: cmsPosts.jsonLd,
      content: cmsPosts.content,
    })
    .from(cmsPosts)
    .where(publishedPageWhere(slug, lang))
    .limit(1);

  if (!post) return null;

  const { content, ...seo } = post;
  return { seo, content: content || null };
}

/**
 * Fetch CMS page override for a coded route.
 *
 * Two cache layers: `React.cache()` deduplicates within one request (so
 * generateMetadata() and the page share a lookup), and the process cache
 * above spans requests. A DB failure is not cached — the caller's catch
 * decides, and the next view retries.
 *
 * @param database  Drizzle DB client
 * @param slug      Route slug (e.g. 'blog', 'portfolio', '' for homepage)
 * @param lang      Content language
 */
export const getCmsOverride = cache(
  async (
    database: DbClient,
    slug: string,
    lang: string
  ): Promise<CmsOverride | null> => {
    const key = getScopedKey('cms-override', lang, slug);
    const cached = readCache(key);
    if (cached !== undefined) return cached;

    void initCmsOverrideSync();
    const result = await fetchOverride(database, slug, lang);
    writeCache(key, result);
    return result;
  }
);

// ─── Simplified fetch (auto-resolves db + locale) ──────────────────────────

/**
 * Fetch CMS page override for a coded route — simplified API.
 *
 * Handles db, locale, and error catching internally.
 * Use in generateMetadata() and page components.
 *
 * @example
 * const cms = await getPageCmsOverride('portfolio');
 * // In metadata:
 * title: buildPageTitle({ seoTitle: cms?.seo.seoTitle, ... })
 * // In JSX:
 * <CmsSlotContent slug="portfolio" />
 */
export async function getPageCmsOverride(
  slug: string
): Promise<CmsOverride | null> {
  try {
    const locale = await getLocale();
    return await getCmsOverride(db, slug, locale);
  } catch {
    return null;
  }
}
