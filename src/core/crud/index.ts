// Engine CRUD — shared admin utilities
export {
  softDelete,
  softRestore,
  permanentDelete,
  buildAdminList,
  buildStatusCounts,
  ensureSlugUnique,
  parsePagination,
  paginatedResult,
  fetchOrNotFound,
  generateCopySlug,
  updateContentStatus,
  getTranslationSiblings,
  serializeExport,
  prepareTranslationCopy,
  createSlugRestoreCheck,
  ensureUniqueInTranslationGroup,
} from './admin-crud';
export type {
  CrudColumns,
  AdminListInput,
  AdminListCols,
  StatusCountCols,
} from './admin-crud';
export { updateWithRevision } from './cms-helpers';
export type { UpdateWithRevisionOpts } from './cms-helpers';
export {
  syncTermRelationships,
  getTermRelationships,
  deleteAllTermRelationships,
  deleteTermRelationshipsByTerm,
  getObjectIdsForTerm,
  batchGetTermRelationships,
  resolveTagsForPosts,
} from './taxonomy-helpers';
export {
  createRevision,
  getRevisions,
  pickSnapshot,
} from './content-revisions';
export {
  registerSlugResolver,
  createTableSlugResolver,
  resolveCurrentSlug,
  resolveSlugRedirect,
} from './slug-redirects';
export type { SlugResolver } from './slug-redirects';
export {
  wordSplitLike,
  getAffectedRows,
  isDuplicateKeyError,
} from './drizzle-utils';
export { publishedPageWhere } from './page-seo';
export {
  adminListInput,
  updateStatusInput,
  duplicateAsTranslationInput,
  exportBulkInput,
} from './router-schemas';
