/**
 * Engine: TaxonomyDeclaration interface + helper factory
 *
 * The core owns the SHAPE. Projects own the DATA (src/config/taxonomies.ts).
 */

export interface TaxonomyDeclaration {
  /** Unique taxonomy identifier */
  id: string;
  /** Singular label */
  label: string;
  /** Plural label */
  labelPlural: string;
  /** URL prefix for public pages */
  urlPrefix: string;
  /** Admin URL slug */
  adminSlug: string;
  /** true = own schema table, false = cms_terms */
  customTable: boolean;
  /** Which content type IDs this taxonomy applies to */
  contentTypes: string[];
  /** UI input type in PostForm sidebar */
  inputType: 'checkbox' | 'tag-input';
  /** Whether this taxonomy has a public detail page */
  hasDetailPage: boolean;
  /** Sitemap slug (if hasDetailPage) */
  sitemapSlug?: string;
}

export function createTaxonomyHelpers(taxonomies: readonly TaxonomyDeclaration[]) {
  const byId = new Map(taxonomies.map((t) => [t.id, t]));
  const byAdminSlug = new Map(taxonomies.map((t) => [t.adminSlug, t]));

  return {
    getTaxonomy(id: string): TaxonomyDeclaration {
      const t = byId.get(id);
      if (!t) throw new Error(`Unknown taxonomy: ${id}`);
      return t;
    },
    getTaxonomyByAdminSlug(slug: string): TaxonomyDeclaration | undefined {
      return byAdminSlug.get(slug);
    },
    getTaxonomiesForContentType(contentTypeId: string): TaxonomyDeclaration[] {
      return taxonomies.filter((t) => t.contentTypes.includes(contentTypeId));
    },
  };
}
