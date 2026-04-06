import { type AnyColumn, type SQL, ilike, or, sql } from 'drizzle-orm';

/**
 * Split a search string into words and create ILIKE conditions for each word
 * across multiple columns. All words must match at least one column (AND logic
 * between words, OR logic between columns).
 */
export function wordSplitLike(
  search: string,
  columns: AnyColumn[]
): SQL | undefined {
  const words = search
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return undefined;

  const wordConditions = words.map((word) => {
    const pattern = `%${word}%`;
    const colConditions = columns.map((col) => ilike(col, pattern));
    return colConditions.length === 1 ? colConditions[0]! : or(...colConditions);
  });

  if (wordConditions.length === 1) return wordConditions[0]!;
  return sql`(${sql.join(
    wordConditions.map((c) => sql`(${c})`),
    sql` AND `
  )})`;
}

/**
 * Get the number of affected rows from a raw `.execute()` result.
 * PostgreSQL returns rowCount on the result object.
 */
export function getAffectedRows(result: unknown): number {
  if (result && typeof result === 'object' && 'rowCount' in result) {
    return (result as { rowCount: number }).rowCount;
  }
  return 0;
}
