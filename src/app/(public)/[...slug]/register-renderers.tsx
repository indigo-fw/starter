/**
 * Side-effect module — registers all content type renderers into the registry.
 *
 * Import once at the top of page.tsx (and generateMetadata) via:
 *   import './register-renderers';
 *
 * To add a new content type renderer:
 *   1. Create the renderer component in renderers/
 *   2. Call registerContentRenderer() here
 */

import React from 'react';

import { registerContentRenderer } from './renderer-registry';
import { siteConfig } from '@/config/site';
import {
  getCachedPost,
  getCachedTag,
  getCachedPortfolio,
  getCachedShowcase,
  getCachedCategory,
} from './data';
import {
  getPostTranslationSiblings,
  getCategoryTranslationSiblings,
  getPortfolioTranslationSiblings,
  getShowcaseTranslationSiblings,
} from './queries';
import { buildAlternates } from './resolve';

// ── page / blog (post-backed) ─────────────────────────────────────────────────

registerContentRenderer('page', {
  async render({ slug, preview }) {
    const { PostDetail } = await import('./renderers/PostDetail');
    const { PostType } = await import('@/core/types/cms');
    return <PostDetail slug={slug} postType={PostType.PAGE} preview={preview} />;
  },
  async generateMetadata({ slug, locale, baseUrl }) {
    const { PostType } = await import('@/core/types/cms');
    const post = await getCachedPost(slug, PostType.PAGE, locale);
    const siblings = await getPostTranslationSiblings(post.id);
    const languages = buildAlternates(baseUrl, siblings, locale as import('@/lib/constants').Locale, slug, '/');

    const metadata: import('next').Metadata = {
      title: post.seoTitle || `${post.title} | ${siteConfig.name}`,
      description: post.metaDescription ?? undefined,
      robots: post.noindex ? { index: false, follow: false } : undefined,
      ...(languages && { alternates: { languages } }),
    };

    if (post.featuredImage) {
      metadata.openGraph = {
        images: [{ url: post.featuredImage, alt: post.featuredImageAlt ?? post.title }],
      };
    }

    return metadata;
  },
});

registerContentRenderer('blog', {
  async render({ slug, preview }) {
    const { PostDetail } = await import('./renderers/PostDetail');
    const { PostType } = await import('@/core/types/cms');
    return <PostDetail slug={slug} postType={PostType.BLOG} preview={preview} />;
  },
  async generateMetadata({ slug, locale, baseUrl }) {
    const { PostType } = await import('@/core/types/cms');
    const post = await getCachedPost(slug, PostType.BLOG, locale);
    const siblings = await getPostTranslationSiblings(post.id);
    const languages = buildAlternates(baseUrl, siblings, locale as import('@/lib/constants').Locale, slug, '/blog/');

    const metadata: import('next').Metadata = {
      title: post.seoTitle || `${post.title} | ${siteConfig.name}`,
      description: post.metaDescription ?? undefined,
      robots: post.noindex ? { index: false, follow: false } : undefined,
      ...(languages && { alternates: { languages } }),
    };

    if (post.featuredImage) {
      metadata.openGraph = {
        images: [{ url: post.featuredImage, alt: post.featuredImageAlt ?? post.title }],
      };
    }

    return metadata;
  },
});

// ── tag ───────────────────────────────────────────────────────────────────────

registerContentRenderer('tag', {
  async render({ slug, currentPage }) {
    const { TagDetail } = await import('./renderers/TagDetail');
    return <TagDetail slug={slug} currentPage={currentPage} />;
  },
  async generateMetadata({ slug, locale }) {
    const tag = await getCachedTag(slug, locale);
    return {
      title: `${tag.name} | ${siteConfig.name}`,
      description: `Browse all posts tagged with "${tag.name}".`,
    };
  },
});

// ── portfolio ─────────────────────────────────────────────────────────────────

registerContentRenderer('portfolio', {
  async render({ slug, preview }) {
    const { PortfolioDetail } = await import('./renderers/PortfolioDetail');
    return <PortfolioDetail slug={slug} preview={preview} />;
  },
  async generateMetadata({ slug, locale, baseUrl }) {
    const item = await getCachedPortfolio(slug, locale);
    const siblings = await getPortfolioTranslationSiblings(item.id);
    const languages = buildAlternates(baseUrl, siblings, locale as import('@/lib/constants').Locale, slug, '/portfolio/');
    return {
      title: item.seoTitle || `${item.title} | ${siteConfig.name}`,
      description: item.metaDescription ?? undefined,
      robots: item.noindex ? { index: false, follow: false } : undefined,
      ...(languages && { alternates: { languages } }),
      ...(item.featuredImage && {
        openGraph: {
          images: [{ url: item.featuredImage, alt: item.featuredImageAlt ?? item.title }],
        },
      }),
    };
  },
});

// ── showcase ─────────────────────────────────────────────────────────────────

registerContentRenderer('showcase', {
  async render({ slug, preview }) {
    const { ShowcaseDetail } = await import('./renderers/ShowcaseDetail');
    return <ShowcaseDetail slug={slug} preview={preview} />;
  },
  async generateMetadata({ slug, locale, baseUrl }) {
    const item = await getCachedShowcase(slug, locale);
    const siblings = await getShowcaseTranslationSiblings(item.id);
    const languages = buildAlternates(baseUrl, siblings, locale as import('@/lib/constants').Locale, slug, '/showcase/');
    return {
      title: item.seoTitle || `${item.title} | ${siteConfig.name}`,
      description: item.metaDescription ?? undefined,
      robots: item.noindex ? { index: false, follow: false } : undefined,
      ...(languages && { alternates: { languages } }),
      ...(item.thumbnailUrl && {
        openGraph: {
          images: [{ url: item.thumbnailUrl, alt: item.title }],
        },
      }),
    };
  },
});

// ── category ──────────────────────────────────────────────────────────────────

registerContentRenderer('category', {
  async render({ slug }) {
    const { CategoryDetail } = await import('./renderers/CategoryDetail');
    return <CategoryDetail slug={slug} />;
  },
  async generateMetadata({ slug, locale, baseUrl }) {
    const cat = await getCachedCategory(slug, locale);
    const siblings = await getCategoryTranslationSiblings(cat.id);
    const languages = buildAlternates(baseUrl, siblings, locale as import('@/lib/constants').Locale, slug, '/category/');
    return {
      title: cat.seoTitle || `${cat.title} | ${siteConfig.name}`,
      description: cat.metaDescription ?? undefined,
      robots: cat.noindex ? { index: false, follow: false } : undefined,
      ...(languages && { alternates: { languages } }),
    };
  },
});
