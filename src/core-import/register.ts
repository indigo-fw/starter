/**
 * core-import module registration entrypoint.
 */

// Router
export { importRouter } from './routers/import';

// Parsers (for programmatic use outside tRPC)
export { parseCSV } from './lib/importers/csv';
export { parseGhostJSON } from './lib/importers/ghost';
export { parseWordPressWXR } from './lib/importers/wordpress';
export { parseIndigoJSON } from './lib/importers/indigo';
export { exportContent } from './lib/export';

// Types
export type { ImportedItem, ImportResult } from './lib/importers/types';
