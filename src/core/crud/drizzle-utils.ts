import { type AnyColumn, type SQL, ilike, or, sql } from 'drizzle-orm';

/** Escape ILIKE special characters (%, _, \) so they match literally. */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Build a `%value%` ILIKE pattern with special chars escaped. */
export function ilikePattern(value: string): string {
  return `%${escapeIlike(value)}%`;
}

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
    const pattern = ilikePattern(word);
    const colConditions = columns.map((col) => ilike(col, pattern));
    return colConditions.length === 1
      ? colConditions[0]!
      : or(...colConditions);
  });

  if (wordConditions.length === 1) return wordConditions[0]!;
  return sql`(${sql.join(
    wordConditions.map((c) => sql`(${c})`),
    sql` AND `
  )})`;
}

/**
 * Get the number of affected rows from a raw `.execute()` result.
 * postgres-js exposes the affected-row count as `count` on its `Result`
 * (an Array subclass); the `rowCount` branch is a fallback for other drivers.
 */
export function getAffectedRows(result: unknown): number {
  if (result && typeof result === 'object' && 'count' in result) {
    return Number((result as { count: number }).count);
  }
  if (result && typeof result === 'object' && 'rowCount' in result) {
    return Number((result as { rowCount: number }).rowCount);
  }
  return 0;
}

/**
 * Detect a Postgres unique-constraint violation (SQLSTATE 23505) anywhere in
 * an error's cause chain, so callers can answer `CONFLICT` instead of 500.
 *
 * Drizzle >= 0.44 wraps driver errors in `DrizzleQueryError`: the `code` lives
 * on `err.cause` (sometimes deeper), so a top-level `err.code === '23505'`
 * check silently never fires. Never string-match the message - wording
 * differs between postgres-js and node-postgres.
 *
 * Pass `constraint` to match one specific unique index/constraint name (e.g. a
 * partial unique index) so an unrelated violation on the same table isn't
 * reported as the expected conflict.
 */
export function isDuplicateKeyError(
  err: unknown,
  constraint?: string
): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur && typeof cur === 'object'; depth++) {
    const e = cur as {
      code?: string;
      constraint_name?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (e.code === '23505') {
      if (!constraint) return true;
      const name = e.constraint_name ?? e.constraint;
      if (name) return name === constraint;
      return typeof e.message === 'string' && e.message.includes(constraint);
    }
    cur = e.cause;
  }
  return false;
}
