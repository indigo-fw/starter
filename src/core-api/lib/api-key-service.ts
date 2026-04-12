import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasApiKeys } from '@/core-api/schema/api-keys';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('api-key-service');

export interface VerifiedKey {
  id: string;
  organizationId: string;
  scopes: string[] | null;
}

/**
 * Generate a new API key with a human-readable prefix.
 * Returns the plaintext key (shown once) and its SHA-256 hash (stored).
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const randomPart = crypto.randomBytes(32).toString('base64url');
  const key = `sk_live_${randomPart}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 16);
  return { key, hash, prefix };
}

/**
 * Verify a Bearer token against stored API keys.
 * Returns the key record if valid, null otherwise.
 * Accepts keys with status 'active' or 'expiring' (grace period after roll).
 */
export async function verifyApiKey(keyString: string): Promise<VerifiedKey | null> {
  const hash = crypto.createHash('sha256').update(keyString).digest('hex');

  const [key] = await db
    .select({
      id: saasApiKeys.id,
      organizationId: saasApiKeys.organizationId,
      scopes: saasApiKeys.scopes,
      status: saasApiKeys.status,
      expiresAt: saasApiKeys.expiresAt,
      keyHash: saasApiKeys.keyHash,
    })
    .from(saasApiKeys)
    .where(eq(saasApiKeys.keyHash, hash))
    .limit(1);

  if (!key) {
    return null;
  }

  // Timing-safe comparison on the hash
  const a = Buffer.from(hash);
  const b = Buffer.from(key.keyHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  if (key.status !== 'active' && key.status !== 'expiring') {
    logger.warn('API key not active', { keyId: key.id, status: key.status });
    return null;
  }

  if (key.expiresAt && key.expiresAt < new Date()) {
    logger.warn('API key expired', { keyId: key.id });
    return null;
  }

  return {
    id: key.id,
    organizationId: key.organizationId,
    scopes: key.scopes,
  };
}

/**
 * Update last-used timestamp for a key. Fire-and-forget.
 */
export function touchKeyLastUsed(keyId: string): void {
  db.update(saasApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(saasApiKeys.id, keyId))
    .catch((err) => logger.error('Failed to update key lastUsedAt', { keyId, error: String(err) }));
}
