/**
 * core-docs module registration entrypoint.
 */

// Router
export { docsRouter } from './routers/docs';

// Schema
export { cmsDocs } from './schema/docs';

// Lib
export { loadFileDocs, loadFileDoc, invalidateFileDocsCache } from './lib/docs-loader';
export type { FileDoc, DocFrontmatter } from './lib/docs-loader';
export { getAllDocs, getDocBySlug, getDocsNavigation, searchDocs, generateLlmExport } from './lib/docs-service';
export type { UnifiedDoc, DocNavItem } from './lib/docs-service';

// Components
export { DocRenderer } from './components/DocRenderer';
export { DocSidebar } from './components/DocSidebar';
