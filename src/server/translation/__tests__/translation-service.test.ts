import { translate } from '../translation-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

const mockFindFirst = vi.fn();
const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi
  .fn()
  .mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
const mockTranslateWithDeepL = vi.fn();

vi.mock('@/lib/env', () => ({
  env: { DEEPL_API_KEY: 'test-key' },
}));

vi.mock('@/server/db', () => ({
  db: {
    query: {
      cmsTranslations: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock('@/server/db/schema', () => ({
  cmsTranslations: { hash: 'HASH_COL' },
}));

vi.mock('../deepl-client', () => ({
  translateWithDeepL: (...args: unknown[]) => mockTranslateWithDeepL(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockOnConflictDoNothing.mockResolvedValue(undefined);
  mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  mockInsert.mockReturnValue({ values: mockValues });
});

describe('translate cache insert', () => {
  it('inserts with onConflictDoNothing on the hash and returns the computed translation', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    mockTranslateWithDeepL.mockResolvedValue('Hallo');

    const result = await translate('Hello', 'de', 'en');

    expect(result).toBe('Hallo');
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        langFrom: 'en',
        langTo: 'de',
        textOriginal: 'Hello',
        textTranslated: 'Hallo',
      })
    );
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith({
      target: 'HASH_COL',
    });
  });

  it('concurrent misses for the same text both resolve to the translation (no 23505 escape)', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    mockTranslateWithDeepL.mockResolvedValue('Hallo');

    // Same string under two field names shares one hash — the race duplicateAsTranslation hits.
    const [a, b] = await Promise.all([
      translate('Hello', 'de'),
      translate('Hello', 'de'),
    ]);

    expect(a).toBe('Hallo');
    expect(b).toBe('Hallo');
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(2);
  });

  it('returns the cached translation without inserting', async () => {
    mockFindFirst.mockResolvedValue({ textTranslated: 'Cached' });

    const result = await translate('Hello', 'de');

    expect(result).toBe('Cached');
    expect(mockTranslateWithDeepL).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
