import { isNull } from 'drizzle-orm';
import { cmsPosts } from '@/server/db/schema';
import { cmsCategories } from '@/server/db/schema/categories';
import { cmsTerms } from '@/server/db/schema/terms';

interface ExportData {
  posts: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  exportedAt: string;
  version: string;
}

/**
 * Export all CMS content as a JSON-serializable object.
 * Used for backup and migration between Indigo instances.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportContent(db: any): Promise<ExportData> {
  const [posts, categories, tags] = await Promise.all([
    db.select().from(cmsPosts).where(isNull(cmsPosts.deletedAt)).limit(10000),
    db.select().from(cmsCategories).limit(1000),
    db.select().from(cmsTerms).limit(5000),
  ]);

  return {
    posts,
    categories,
    tags,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  };
}
