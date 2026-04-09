import { cache } from 'react';
import { compileMdx } from '@/core/lib/mdx-compiler';
import { findFileContent, type FileContent } from '@/core/lib/content-loader';
import { DEFAULT_LOCALE } from '@/lib/constants';

/**
 * React.cache()-wrapped file content lookup + MDX compilation.
 * Deduplicates within a single request (generateMetadata + page component).
 * Falls back to default locale if no locale-specific file exists.
 */
export const getCachedCompiledContent = cache(
  async (slug: string, locale: string): Promise<{ html: string; content: FileContent } | null> => {
    const file = findFileContent(slug, locale, DEFAULT_LOCALE);
    if (!file) return null;

    const cacheKey = `content:${locale}:${slug}:${file.updatedAt.getTime()}`;
    const html = await compileMdx(file.content, cacheKey);
    return { html, content: file };
  },
);
