import './register-renderers';
import { getContentRenderer } from './renderer-registry';
import { resolveSlug } from './resolve';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CONTENT_TYPES } from '@/config/cms';
import { siteConfig } from '@/config/site';
import { MdxContentPage } from '@/core/components/content/MdxContentPage';
import { MdxTabsHydrator } from '@/core/components/content/MdxTabsHydrator';
import { resolveSlugRedirect } from '@/core/crud/slug-redirects';
import { getCachedCompiledContent } from '@/core/lib/content/renderer';
import { resolveContentVars } from '@/core/lib/content/vars';
import { getForwardedSearch } from '@/core/lib/i18n/locale-server';
import { buildCanonicalUrl } from '@/core/lib/seo/canonical';
import { permanentRedirect } from '@/i18n/navigation';
import type { Locale } from '@/lib/constants';
import { getLocale } from '@/lib/locale-server';

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ preview?: string; page?: string }>;
}

/**
 * Rethrow Next.js redirect control flow (e.g. the localized-slug redirect
 * thrown by the data layer) so a catch-all `catch` doesn't swallow it into a
 * 404. notFound() errors are deliberately NOT rethrown — the catch blocks
 * below turn them into a slug-redirect-table lookup before 404-ing.
 */
function rethrowIfRedirect(err: unknown): void {
  const digest = (err as { digest?: string } | null)?.digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
    throw err;
  }
}

/**
 * Slug-redirect targets are DB-computed (`<urlPrefix><slug>` + forwarded query),
 * not statically typed pathnames — hence the cast. next-intl passes unknown
 * strings through verbatim and only adds the visitor's locale prefix, which a
 * raw next/navigation redirect would drop.
 */
async function redirectToCurrentSlug(
  redirectPath: string,
  locale: Locale
): Promise<void> {
  permanentRedirect({
    href: (redirectPath + (await getForwardedSearch())) as '/',
    locale,
  });
}

// ── Metadata ──

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const locale = await getLocale();
  const fullSlug = slug.join('/');

  // File-based MDX content takes priority
  const fileResult = await getCachedCompiledContent(fullSlug, locale);
  if (fileResult) {
    const { content } = fileResult;
    const fm = content.frontmatter;
    const seoTitle = fm.seoTitle ? resolveContentVars(fm.seoTitle) : null;
    const description = fm.description
      ? resolveContentVars(fm.description)
      : undefined;
    const { buildPageTitle } =
      await import('@/core/lib/content/title-template');
    // Template seoTitle is already complete after resolution; plain seoTitle/title gets site name suffix
    const title = seoTitle?.includes('%')
      ? buildPageTitle({
          configTemplate: seoTitle,
          seoTitle: null,
          fallbackTitle: '',
          sitename: siteConfig.name,
        })
      : `${seoTitle ?? resolveContentVars(fm.title ?? fullSlug)} | ${siteConfig.name}`;
    return {
      title,
      description,
      robots:
        preview || fm.noindex ? { index: false, follow: false } : undefined,
      alternates: { canonical: buildCanonicalUrl(`/${fullSlug}`, locale) },
      openGraph: {
        locale,
        ...(fm.image && {
          images: [{ url: fm.image, alt: fm.imageAlt ?? fm.title ?? '' }],
        }),
      },
    };
  }

  // Fall through to DB-based renderer
  const resolved = resolveSlug(slug);
  if (!resolved) return {};

  const baseUrl = siteConfig.url;
  const renderer = getContentRenderer(resolved.contentType.id);
  if (!renderer) return {};

  try {
    const meta = await renderer.generateMetadata({
      slug: resolved.slug,
      locale,
      baseUrl,
    });
    // Ensure preview pages are never indexed
    if (preview) {
      meta.robots = { index: false, follow: false };
    }
    return meta;
  } catch (err) {
    rethrowIfRedirect(err);
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
    // Try slug redirect before 404-ing (query string preserved for attribution)
    for (const ct of CONTENT_TYPES) {
      const slugStr =
        slug.length === 2 && ct.listSegment === slug[0]
          ? slug[1]!
          : slug.length === 1 && ct.urlPrefix === '/'
            ? slug[0]!
            : null;
      if (!slugStr) continue;
      const redirectPath = await resolveSlugRedirect(slugStr, ct.urlPrefix);
      if (redirectPath) await redirectToCurrentSlug(redirectPath, locale);
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
  } catch (err) {
    rethrowIfRedirect(err);
    // Try slug redirect before 404-ing (query string preserved for attribution)
    const redirectPath = await resolveSlugRedirect(
      resolved.slug,
      resolved.contentType.urlPrefix
    );
    if (redirectPath) await redirectToCurrentSlug(redirectPath, locale);
    notFound();
  }
}
