/**
 * Engine: ContentTypeDeclaration interface + helper factory
 *
 * The core owns the SHAPE. Projects own the DATA (src/config/cms.ts).
 */

export interface ContentTypeDeclaration {
  /** Unique id — used for cache invalidation and slug resolution */
  id: string;
  /** URL prefix where this content is served ('/' = root, '/blog/' = prefixed) */
  urlPrefix: string;
  /** Top-level URL segment for the list page */
  listSegment: string;
  /** Human-readable title for the list page */
  listTitle: string;
  /** Whether this type can override SEO of coded routes */
  canOverrideCodedRouteSEO: boolean;
  /** Whether missing-language pages should fall back to default locale */
  fallbackToDefault: boolean;
  /** Human-readable singular label */
  label: string;
  /** Human-readable plural label */
  labelPlural: string;
  /** PostType value — only for cms_posts-backed types */
  postType?: number;
  /** URL slug for the admin section (e.g. 'pages' → /dashboard/cms/pages) */
  adminSlug: string;
  /** Admin capability required to edit this content type */
  adminCapability: 'section.content';
  /** Title template for pages. Vars: {title}, {sitename}, {page}. [...] = conditional. */
  titleTemplate: string;
  /** Sitemap XML filename slug. Omit to exclude from sitemap index. */
  sitemapSlug?: string;
  /** Override sidebar label. Defaults to labelPlural. */
  sidebarLabel?: string;
  /** Which optional fields to show in PostForm */
  postFormFields?: {
    featuredImage?: boolean;
    jsonLd?: boolean;
  };
  /** Fallback description for list page metadata */
  listDescription?: string;
  /**
   * Optional sitemap config. When present, sitemap.ts will call fetchEntries()
   * to generate per-locale URL entries for this content type.
   * Omit to exclude dynamic entries from the sitemap (static pages are handled separately).
   */
  sitemapConfig?: {
    priority: number;
    changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    /**
     * Fetch all published entries for this content type in a given locale.
     * Returns slug + updatedAt pairs used to build sitemap URLs.
     */
    fetchEntries: (locale: string) => Promise<Array<{ slug: string; updatedAt: Date | null | undefined }>>;
  };
}

export function createContentTypeHelpers(types: readonly ContentTypeDeclaration[]) {
  const byId = new Map(types.map((t) => [t.id, t]));
  const byPostType = new Map(
    types.filter((t) => t.postType != null).map((t) => [t.postType!, t])
  );
  const byAdminSlug = new Map(types.map((t) => [t.adminSlug, t]));

  return {
    getContentType(id: string): ContentTypeDeclaration {
      const ct = byId.get(id);
      if (!ct) throw new Error(`Unknown content type: ${id}`);
      return ct;
    },
    getContentTypeByPostType(postType: number): ContentTypeDeclaration {
      const ct = byPostType.get(postType);
      if (!ct) throw new Error(`Unknown post type: ${postType}`);
      return ct;
    },
    getContentTypeByAdminSlug(slug: string): ContentTypeDeclaration | undefined {
      return byAdminSlug.get(slug);
    },
  };
}
