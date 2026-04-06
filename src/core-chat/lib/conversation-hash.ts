import { createHash } from 'crypto';

/**
 * Generate an order-independent hash for conversation deduplication.
 * Same user + same character + same traits = same hash.
 */
export function generateConversationHash(
  characterId: string,
  traits?: Record<string, unknown>,
): string {
  const parts = [characterId];

  if (traits) {
    // Sort keys for order independence
    const sortedKeys = Object.keys(traits).sort();
    for (const key of sortedKeys) {
      const val = traits[key];
      if (val != null) {
        parts.push(`${key}:${JSON.stringify(val)}`);
      }
    }
  }

  return createHash('md5').update(parts.join('|')).digest('hex');
}
