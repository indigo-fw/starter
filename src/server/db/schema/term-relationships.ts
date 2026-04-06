import { index, pgTable, primaryKey, uuid, varchar } from 'drizzle-orm/pg-core';

// ─── cms_term_relationships ────────────────────────────────────────────────────
// Universal M:N between content objects and taxonomy terms.
// Polymorphic termId: points to cms_terms.id or cms_categories.id based on taxonomyId.
// No FK on termId — app-level enforcement (same pattern as WordPress).

export const cmsTermRelationships = pgTable(
  'cms_term_relationships',
  {
    objectId: uuid('object_id').notNull(),
    termId: uuid('term_id').notNull(),
    taxonomyId: varchar('taxonomy_id', { length: 50 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectId, t.termId, t.taxonomyId] }),
    index('cms_term_rel_object_id_idx').on(t.objectId),
    index('cms_term_rel_term_id_idx').on(t.termId),
    index('cms_term_rel_taxonomy_id_idx').on(t.taxonomyId),
  ]
);

export type CmsTermRelationship = typeof cmsTermRelationships.$inferSelect;
export type NewCmsTermRelationship = typeof cmsTermRelationships.$inferInsert;
