import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from env. Returns null if not configured.
 * Key must be a 64-character hex string (32 bytes), validated via env.ts.
 */
function getKey(): Buffer | null {
  // Use process.env directly (synchronous, no async import needed).
  // Validated by Zod in env.ts as .string().length(64).optional().
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns `iv:tag:ciphertext` as a base64 string.
 * Throws if ENCRYPTION_KEY is not configured.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured. Set a 64-character hex string in .env');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Throws if ENCRYPTION_KEY is not configured or data is invalid.
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  if (!key) {
    throw new Error('ENCRYPTION_KEY not configured. Set a 64-character hex string in .env');
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0]!, 'base64');
  const tag = Buffer.from(parts[1]!, 'base64');
  const ciphertext = parts[2]!;

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Mask an API key for display: show first 3 and last 4 chars.
 * e.g. "sk-abc123456789xyz" → "sk-...9xyz"
 */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

/**
 * Check if encryption is configured.
 */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}
