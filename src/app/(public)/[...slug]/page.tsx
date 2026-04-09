import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';

import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { getLocale } from '@/lib/locale-server';
import { resolveSlugRedirect } from '@/core/crud/slug-redirects';
import { getCachedCompiledContent } from '@/core/lib/content-renderer';
import { resolveContentVars } from '@/core/lib/content-vars';
import { MdxContentPage } from '@/core/components/MdxContentPage';
import { MdxTabsHydrator } from '@/core/components/MdxTabsHydrator';
import { resolveSlug } from './resolve';
import { getContentRenderer } from './renderer-registry';
import './register-renderers';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ preview?: string; page?: string }>;
}

// ── Metadata ──

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const fullSlug = slug.join('/');

  // File-based MDX content takes priority
  const fileResult = await getCachedCompiledContent(fullSlug, locale);
  if (fileResult) {
    const { content } = fileResult;
    const fm = content.frontmatter;
    const title = resolveContentVars(fm.seoTitle ?? `${fm.title ?? fullSlug} | ${siteConfig.name}`);
    const description = fm.description ? resolveContentVars(fm.description) : undefined;
    return {
      title,
      description,
      robots: fm.noindex ? { index: false, follow: false } : undefined,
      ...(fm.image && {
        openGraph: {
          images: [{ url: fm.image, alt: fm.imageAlt ?? fm.title ?? '' }],
        },
      }),
    };
  }

  // Fall through to DB-based renderer
  const resolved = resolveSlug(slug);
  if (!resolved) return {};

  const baseUrl = siteConfig.url;
  const renderer = getContentRenderer(resolved.contentType.id);
  if (!renderer) return {};

  try {
    return await renderer.generateMetadata({ slug: resolved.slug, locale, baseUrl });
  } catch {
    return {};
  }
}

// ── Page Component ──

export default async function CatchAllPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview, page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const locale = await getLocale();
  const fullSlug = slug.join('/');

  // File-based MDX content takes priority
  const fileResult = await getCachedCompiledContent(fullSlug, locale);
  if (fileResult) {
    return (
      <MdxTabsHydrator>
        <MdxContentPage content={fileResult.content} html={fileResult.html} />
      </MdxTabsHydrator>
    );
  }

  // Fall through to DB-based renderer
  const resolved = resolveSlug(slug);

  if (!resolved) {
    // Try slug redirect before 404-ing
    for (const ct of CONTENT_TYPES) {
      const slugStr = slug.length === 2 && ct.listSegment === slug[0]
        ? slug[1]!
        : slug.length === 1 && ct.urlPrefix === '/'
          ? slug[0]!
          : null;
      if (!slugStr) continue;
      const redirectPath = await resolveSlugRedirect(slugStr, ct.urlPrefix);
      if (redirectPath) permanentRedirect(redirectPath);
    }
    notFound();
  }

  const renderer = getContentRenderer(resolved.contentType.id);
  if (!renderer) notFound();

  try {
    return await renderer.render({
      slug: resolved.slug,
      preview,
      currentPage,
      locale,
    });
  } catch {
    // Try slug redirect before 404-ing
    const redirectPath = await resolveSlugRedirect(
      resolved.slug,
      resolved.contentType.urlPrefix
    );
    if (redirectPath) permanentRedirect(redirectPath);
    notFound();
  }
}
