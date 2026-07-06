import { cache } from 'react';
import { getDocBySlug, getDocsNavigation } from '@/core-docs/lib/docs-service';

/**
 * React.cache()-wrapped data fetchers for the docs route.
 * Ensures generateMetadata and the page component share a single
 * compilation per request (MDX compilation is the expensive part).
 */
export const getCachedDoc = cache((slug: string, locale: string) => getDocBySlug(slug, locale));
export const getCachedNavigation = cache((locale: string) => getDocsNavigation(locale));
