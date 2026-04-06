import {
  type TaxonomyDeclaration,
  createTaxonomyHelpers,
} from '@/core/config/taxonomies';

/**
 * Taxonomy Registry
 *
 * Declares taxonomy types available in the CMS.
 * - `customTable: true` = taxonomy has its own rich schema table (e.g. cms_categories)
 * - `customTable: false` = taxonomy uses the universal `cms_terms` table
 *
 * To add a new taxonomy:
 * 1. Add a declaration here
 * 2. If customTable: false, add admin CRUD in the tags router pattern
 * 3. Register in cms.ts CONTENT_TYPES if it needs a public detail page
 * 4. Add TagInput/checkbox UI in PostForm
 */

export type { TaxonomyDeclaration };

const taxonomiesDef: readonly TaxonomyDeclaration[] = [
  {
    id: 'category',
    label: 'Category',
    labelPlural: 'Categories',
    urlPrefix: '/category/',
    adminSlug: 'categories',
    customTable: true,
    contentTypes: ['blog'],
    inputType: 'checkbox',
    hasDetailPage: true,
    sitemapSlug: 'category-pages',
  },
  {
    id: 'tag',
    label: 'Tag',
    labelPlural: 'Tags',
    urlPrefix: '/tag/',
    adminSlug: 'tags',
    customTable: false,
    contentTypes: ['blog', 'page', 'portfolio', 'showcase'],
    inputType: 'tag-input',
    hasDetailPage: true,
    sitemapSlug: 'tag-pages',
  },
];

export const TAXONOMIES: readonly TaxonomyDeclaration[] = taxonomiesDef;

const helpers = createTaxonomyHelpers(TAXONOMIES);
export const getTaxonomy = helpers.getTaxonomy;
export const getTaxonomyByAdminSlug = helpers.getTaxonomyByAdminSlug;
export const getTaxonomiesForContentType = helpers.getTaxonomiesForContentType;
