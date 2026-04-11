/**
 * Post form panel definitions — configures which panels appear in the post editor,
 * their default order, and which column they belong to.
 *
 * Fixed panels (title-slug, content, status) are always rendered in their
 * positions and cannot be reordered or hidden.
 */

export interface PostFormPanelDef {
  id: string;
  label: string;
  column: 'main' | 'sidebar';
}

// ── Main column panels (below Content, sortable) ──────────
export const MAIN_PANELS: PostFormPanelDef[] = [
  { id: 'seo', label: 'SEO', column: 'main' },
  { id: 'seo-preview', label: 'SEO Preview', column: 'main' },
  { id: 'custom-fields', label: 'Custom Fields', column: 'main' },
  { id: 'json-ld', label: 'Structured Data', column: 'main' },
];

// ── Sidebar panels (below Status, sortable) ───────────────
export const SIDEBAR_PANELS: PostFormPanelDef[] = [
  { id: 'language', label: 'Language', column: 'sidebar' },
  { id: 'parent-page', label: 'Parent Page', column: 'sidebar' },
  { id: 'categories', label: 'Categories', column: 'sidebar' },
  { id: 'tags', label: 'Tags', column: 'sidebar' },
  { id: 'featured-image', label: 'Featured Image', column: 'sidebar' },
  { id: 'authors', label: 'Authors', column: 'sidebar' },
];

export const ALL_PANELS: PostFormPanelDef[] = [...MAIN_PANELS, ...SIDEBAR_PANELS];

export const DEFAULT_MAIN_ORDER = MAIN_PANELS.map((p) => p.id);
export const DEFAULT_SIDEBAR_ORDER = SIDEBAR_PANELS.map((p) => p.id);
export const DEFAULT_HIDDEN_PANELS: string[] = [];

/** Lookup map for panel definitions */
export const PANEL_MAP = Object.fromEntries(ALL_PANELS.map((p) => [p.id, p]));
