/**
 * Ergonomic accessors over the `cms_user_preferences` JSONB store.
 *
 * The table exists but there's no helper layer, so callers otherwise
 * hand-roll the select + the JSONB-merge upsert (and risk clobbering
 * unrelated keys). These do it right:
 *
 *   const prefs = await getUserPrefs(userId, { cadence: 'daily', emailOn: true });
 *   await patchUserPrefs(userId, { cadence: 'weekly' });   // merges, doesn't replace
 *
 * `getUserPrefs` is shallow-merged over your `defaults` object, so you always
 * get a fully-populated typed object even for keys that were never written.
 *
 * Note: this is a thin convenience layer — no schema/validation. If you store
 * structured prefs, validate on read in your own code.
 */

import { eq, sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { cmsUserPreferences } from '@/server/db/schema/user-preferences';

export async function getUserPrefs<T extends Record<string, unknown>>(
  userId: string,
  defaults: T,
): Promise<T> {
  const [row] = await db
    .select({ data: cmsUserPreferences.data })
    .from(cmsUserPreferences)
    .where(eq(cmsUserPreferences.userId, userId))
    .limit(1);
  const stored = (row?.data ?? {}) as Partial<T>;
  return { ...defaults, ...stored };
}

/** Read a single preference key with a fallback. */
export async function getUserPref<V>(userId: string, key: string, fallback: V): Promise<V> {
  const prefs = await getUserPrefs(userId, { [key]: fallback } as Record<string, V>);
  return prefs[key] as V;
}

/**
 * Merge `patch` into the user's prefs JSONB (top-level keys only). Creates the
 * row if it doesn't exist. Existing keys not in `patch` are left untouched.
 */
export async function patchUserPrefs(userId: string, patch: Record<string, unknown>): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db
    .insert(cmsUserPreferences)
    .values({ userId, data: patch })
    .onConflictDoUpdate({
      target: cmsUserPreferences.userId,
      set: {
        // jsonb || jsonb = shallow merge, right side wins.
        data: sql`coalesce(${cmsUserPreferences.data}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      },
    });
}

/** Delete one preference key (sets it absent, not null). */
export async function deleteUserPref(userId: string, key: string): Promise<void> {
  await db
    .update(cmsUserPreferences)
    .set({ data: sql`${cmsUserPreferences.data} - ${key}`, updatedAt: new Date() })
    .where(eq(cmsUserPreferences.userId, userId));
}
