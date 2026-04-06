import { createHash } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { chatMedia } from '@/core-chat/schema/media';

/**
 * Compute a content hash for media deduplication.
 * MD5 of sorted unique keywords + characterId. Order-independent.
 */
export function computeMediaHash(keywords: string[], characterId: string): string {
  const sorted = [...new Set(keywords)].sort().join(',');
  const input = `${sorted}|${characterId}`;
  return createHash('md5').update(input).digest('hex');
}

/**
 * Find an existing duplicate image by content hash.
 * Returns the media record if found, null otherwise.
 */
export async function findDuplicate(
  contentHash: string,
  characterId: string,
): Promise<{ id: string; filepath: string } | null> {
  const [existing] = await db
    .select({ id: chatMedia.id, filepath: chatMedia.filepath })
    .from(chatMedia)
    .where(and(
      eq(chatMedia.contentHash, contentHash),
      eq(chatMedia.purpose, 'message'),
    ))
    .limit(1);

  return existing ?? null;
}
