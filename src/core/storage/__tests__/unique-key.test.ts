import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `resolveUniqueKey` reads the live provider through `getStorage()`, so each
 * case registers a stub backend and re-imports the module fresh (the provider
 * is memoized after the first call).
 */
async function withExisting(existing: Set<string>) {
  vi.resetModules();
  process.env.STORAGE_BACKEND = 'stub';
  const mod = await import('../index');
  mod.registerStorageProvider('stub', () => ({
    upload: vi.fn().mockResolvedValue('ok'),
    download: vi.fn().mockResolvedValue(Buffer.alloc(0)),
    delete: vi.fn().mockResolvedValue(undefined),
    url: (p: string) => `/u/${p}`,
    absoluteUrl: (p: string) => `http://test/u/${p}`,
    exists: (p: string) => Promise.resolve(existing.has(p)),
    copy: vi.fn().mockResolvedValue('dest'),
  }));
  return mod;
}

describe('resolveUniqueKey', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns the key unchanged when nothing is there', async () => {
    const { resolveUniqueKey } = await withExisting(new Set());
    expect(await resolveUniqueKey('2026/09/cover.webp')).toBe(
      '2026/09/cover.webp'
    );
  });

  it('suffixes -1 on the first collision', async () => {
    const { resolveUniqueKey } = await withExisting(
      new Set(['2026/09/cover.webp'])
    );
    expect(await resolveUniqueKey('2026/09/cover.webp')).toBe(
      '2026/09/cover-1.webp'
    );
  });

  it('walks past consecutive collisions', async () => {
    const { resolveUniqueKey } = await withExisting(
      new Set(['a/x.png', 'a/x-1.png', 'a/x-2.png'])
    );
    expect(await resolveUniqueKey('a/x.png')).toBe('a/x-3.png');
  });

  it('preserves a multi-dot filename extension', async () => {
    const { resolveUniqueKey } = await withExisting(
      new Set(['a/archive.tar.gz'])
    );
    expect(await resolveUniqueKey('a/archive.tar.gz')).toBe(
      'a/archive.tar-1.gz'
    );
  });

  it('handles a key with no directory', async () => {
    const { resolveUniqueKey } = await withExisting(new Set(['logo.svg']));
    expect(await resolveUniqueKey('logo.svg')).toBe('logo-1.svg');
  });

  it('handles a key with no extension', async () => {
    const { resolveUniqueKey } = await withExisting(new Set(['a/README']));
    expect(await resolveUniqueKey('a/README')).toBe('a/README-1');
  });

  it('falls back to a timestamp instead of looping forever', async () => {
    // 100 taken suffixes exhausts the numbered search.
    const taken = new Set(['d/f.txt']);
    for (let i = 1; i <= 100; i++) taken.add(`d/f-${i}.txt`);
    const { resolveUniqueKey } = await withExisting(taken);

    const result = await resolveUniqueKey('d/f.txt');
    expect(result).toMatch(/^d\/f-\d{10,}\.txt$/);
    expect(taken.has(result)).toBe(false);
  });
});
