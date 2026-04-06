import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, maskApiKey, isEncryptionConfigured } from '../lib/encryption';

// Set a test encryption key (64-char hex = 32 bytes)
const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('encryption', () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  it('encrypts and decrypts roundtrip', () => {
    const plaintext = 'sk-test-api-key-12345';
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(':'); // iv:tag:ciphertext format

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for same input (random IV)', () => {
    const plaintext = 'sk-same-key';
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);

    // But both decrypt to same value
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it('throws on invalid encrypted format', () => {
    expect(() => decrypt('not-valid')).toThrow();
    expect(() => decrypt('a:b')).toThrow(); // only 2 parts
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    parts[2] = 'tampered';
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
});

describe('maskApiKey', () => {
  it('masks long keys', () => {
    expect(maskApiKey('sk-abc123456789xyz')).toBe('sk-...9xyz');
  });

  it('masks short keys', () => {
    expect(maskApiKey('short')).toBe('****');
  });
});

describe('isEncryptionConfigured', () => {
  it('returns true when ENCRYPTION_KEY is set', () => {
    // Ensure test key is set (may run in different order)
    process.env.ENCRYPTION_KEY = TEST_KEY;
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('returns false when ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    process.env.ENCRYPTION_KEY = saved;
  });
});
