import { PostType } from '@/core/types/cms';
import {
  type ContentTypeDeclaration,
  createContentTypeHelpers,
} from '@/core/config/content-types';

/**
 * CMS Content Types Registry
 *
 * Single source of truth for all content types served by the app.
 *
 * To add a new content type:
 * 1. Add a config entry here
 * 2. For post-backed types: auto-registered. For others: call registerContentResolver()
 * 3. Add list/detail templates in [...slug]/_templates/
 * 4. Register renderers in [...slug]/register-renderers.tsx
 * 5. Add sitemapConfig.fetchEntries to include in the sitemap
 */

export type { ContentTypeDeclaration };

const contentTypesDef = [
  {
    id: 'page',
    urlPrefix: '/',
    listSegment: 'pages',
    listTitle: 'Pages',
    canOverrideCodedRouteSEO: true,
    fallbackToDefault: true,
    label: 'Page',
    labelPlural: 'Pages',
    postType: PostType.PAGE,
    adminSlug: 'pages',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {pageLabel} {page}] | {sitename}',
    sitemapSlug: 'cms-pages',
    postFormFields: { featuredImage: true, jsonLd: true },
  },
  {
    id: 'blog',
    urlPrefix: '/blog/',
    listSegment: 'blog',
    listTitle: 'Blog',
    canOverrideCodedRouteSEO: true,
    fallbackToDefault: true,
    label: 'Blog Post',
    labelPlural: 'Blog Posts',
    sidebarLabel: 'Blog',
    postType: PostType.BLOG,
    adminSlug: 'blog',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {pageLabel} {page}] | {sitename}',
    sitemapSlug: 'cms-blog',
    postFormFields: { featuredImage: true, jsonLd: true },
  },
  {
    id: 'category',
    urlPrefix: '/category/',
    listSegment: 'category',
    listTitle: 'Categories',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: true,
    label: 'Category',
    labelPlural: 'Categories',
    adminSlug: 'categories',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {pageLabel} {page}] | {sitename}',
    sitemapSlug: 'category-pages',
  },
  {
    id: 'tag',
    urlPrefix: '/tag/',
    listSegment: 'tag',
    listTitle: 'Tags',
    canOverrideCodedRouteSEO: false,
    fallbackToDefault: false,
    label: 'Tag',
    labelPlural: 'Tags',
    adminSlug: 'tags',
    adminCapability: 'section.content',
    titleTemplate: '{title}[ - {pageLabel} {page}] | {sitename}',
    sitemapSlug: 'tag-pages',
    listDescription: 'Browse content by tag.',
  },
  {
    id: 'portfolio',
    urlPrefix: '/portfolio/',
    listSegment: 'portfolio',
    listTitle: 'Portfolio',
    canOverrideCodedRouteSEO: true,
    fallbackToDefault: true,
    label: 'Portfolio Item',
    labelPlural: 'Portfolio',
    adminSlug: 'portfolio',
    adminCapability: 'section.content',
    titleTemplate: '{title} | {sitename}',
    sitemapSlug: 'portfolio-pages',
  },
  {
    id: 'showcase',
    urlPrefix: '/showcase/',
    listSegment: 'showcase',
    listTitle: 'Showcase',
    canOverrideCodedRouteSEO: true,
    fallbackToDefault: true,
    label: 'Showcase Item',
    labelPlural: 'Showcase',
    adminSlug: 'showcase',
    adminCapability: 'section.content',
    titleTemplate: '{title} | {sitename}',
    sitemapSlug: 'showcase-pages',
  },
] as const satisfies readonly ContentTypeDeclaration[];

export const CONTENT_TYPES: readonly ContentTypeDeclaration[] = contentTypesDef;

/** IDs of content types that use PostForm (have postType). */
export type PostContentTypeId = Extract<
  (typeof contentTypesDef)[number],
  { postType: number }
>['id'];

/** Admin URL slugs from the config. */
export type AdminSlug = (typeof contentTypesDef)[number]['adminSlug'];

const helpers = createContentTypeHelpers(CONTENT_TYPES);
export const getContentType = helpers.getContentType;
export const getContentTypeByPostType = helpers.getContentTypeByPostType;
export const getContentTypeByAdminSlug = helpers.getContentTypeByAdminSlug;
