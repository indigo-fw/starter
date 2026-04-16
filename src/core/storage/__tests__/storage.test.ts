import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ─── Mocks (must be declared before any import of the module under test) ───

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from('file-content'));
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock('fs/promises', () => ({
  default: {
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  },
}));

// Stable cwd for path assertions
const FAKE_CWD = '/fake/project';
vi.spyOn(process, 'cwd').mockReturnValue(FAKE_CWD);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Re-import the storage module with a fresh module-level singleton */
async function freshImport() {
  vi.resetModules();
  // Re-apply static mocks that resetModules clears
  vi.doMock('@/core/lib/infra/logger', () => ({
    createLogger: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }));
  vi.doMock('fs/promises', () => ({
    default: {
      mkdir: (...args: unknown[]) => mockMkdir(...args),
      writeFile: (...args: unknown[]) => mockWriteFile(...args),
      readFile: (...args: unknown[]) => mockReadFile(...args),
      unlink: (...args: unknown[]) => mockUnlink(...args),
    },
  }));
  return import('../index');
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('storage provider registry', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(FAKE_CWD);
    // Reset env to known state
    delete process.env.STORAGE_BACKEND;
    delete process.env.NEXT_PUBLIC_CDN_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockMkdir.mockReset().mockResolvedValue(undefined);
    mockWriteFile.mockReset().mockResolvedValue(undefined);
    mockReadFile.mockReset().mockResolvedValue(Buffer.from('file-content'));
    mockUnlink.mockReset().mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── 1. getStorage() returns filesystem provider by default ──────────────

  it('returns filesystem provider by default when STORAGE_BACKEND is unset', async () => {
    const { getStorage } = await freshImport();

    const provider = getStorage();

    // Filesystem provider exposes a url() method that builds /api/uploads/ URLs
    expect(provider).toBeDefined();
    expect(typeof provider.upload).toBe('function');
    expect(typeof provider.download).toBe('function');
    expect(typeof provider.delete).toBe('function');
    expect(typeof provider.url).toBe('function');
    // Default URL falls back to localhost
    expect(provider.url('test.png')).toBe('http://localhost:3000/api/uploads/test.png');
  });

  // ── 2. registerStorageProvider() registers a custom provider ────────────

  it('registers and resolves a custom storage provider', async () => {
    process.env.STORAGE_BACKEND = 'custom';
    const { getStorage, registerStorageProvider } = await freshImport();

    const customProvider = {
      upload: vi.fn().mockResolvedValue('ok'),
      download: vi.fn().mockResolvedValue(Buffer.from('data')),
      delete: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockReturnValue('https://custom-cdn.test/file.png'),
    };
    registerStorageProvider('custom', () => customProvider);

    const provider = getStorage();
    expect(provider).toBe(customProvider);
    expect(provider.url('file.png')).toBe('https://custom-cdn.test/file.png');
  });

  it('throws when requesting an unregistered backend', async () => {
    process.env.STORAGE_BACKEND = 'nonexistent';
    const { getStorage } = await freshImport();

    expect(() => getStorage()).toThrow(/Unknown storage backend: "nonexistent"/);
  });

  it('caches the provider after first getStorage() call', async () => {
    const { getStorage } = await freshImport();

    const first = getStorage();
    const second = getStorage();
    expect(first).toBe(second);
  });

  // ── 3. Filesystem provider url() ────────────────────────────────────────

  it('url() uses NEXT_PUBLIC_CDN_URL when set', async () => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
    const { getStorage } = await freshImport();

    expect(getStorage().url('images/photo.jpg')).toBe(
      'https://cdn.example.com/api/uploads/images/photo.jpg',
    );
  });

  it('url() falls back to NEXT_PUBLIC_APP_URL when CDN URL is not set', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const { getStorage } = await freshImport();

    expect(getStorage().url('doc.pdf')).toBe(
      'https://app.example.com/api/uploads/doc.pdf',
    );
  });

  it('url() prefers CDN URL over APP URL', async () => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.example.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
    const { getStorage } = await freshImport();

    expect(getStorage().url('file.txt')).toBe(
      'https://cdn.example.com/api/uploads/file.txt',
    );
  });

  it('url() defaults to http://localhost:3000 when no env vars are set', async () => {
    const { getStorage } = await freshImport();

    expect(getStorage().url('test.png')).toBe(
      'http://localhost:3000/api/uploads/test.png',
    );
  });

  // ── 4. Filesystem provider upload() ─────────────────────────────────────

  it('upload() creates directory and writes file to correct path', async () => {
    const { getStorage } = await freshImport();
    const provider = getStorage();
    const buf = Buffer.from('hello');

    const result = await provider.upload('images/photo.jpg', buf);

    expect(result).toBe('images/photo.jpg');
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('uploads'),
      { recursive: true },
    );
    // The full path should join cwd + uploads + filepath
    const writtenPath = mockWriteFile.mock.calls[0][0] as string;
    expect(writtenPath).toContain('uploads');
    expect(writtenPath).toContain('photo.jpg');
    expect(mockWriteFile).toHaveBeenCalledWith(writtenPath, buf);
  });

  // ── 5. Filesystem provider download() ───────────────────────────────────

  it('download() reads file from correct path', async () => {
    const fileData = Buffer.from('binary-data');
    mockReadFile.mockResolvedValue(fileData);
    const { getStorage } = await freshImport();
    const provider = getStorage();

    const result = await provider.download('docs/readme.txt');

    expect(result).toBe(fileData);
    const readPath = mockReadFile.mock.calls[0][0] as string;
    expect(readPath).toContain('uploads');
    expect(readPath).toContain('readme.txt');
  });

  // ── 6. Filesystem provider delete() ─────────────────────────────────────

  it('delete() unlinks the file at the correct path', async () => {
    const { getStorage } = await freshImport();
    const provider = getStorage();

    await provider.delete('old/file.png');

    const unlinkPath = mockUnlink.mock.calls[0][0] as string;
    expect(unlinkPath).toContain('uploads');
    expect(unlinkPath).toContain('file.png');
  });

  it('delete() does not throw when unlink fails', async () => {
    mockUnlink.mockRejectedValue(new Error('ENOENT: no such file'));
    const { getStorage } = await freshImport();
    const provider = getStorage();

    await expect(provider.delete('missing.txt')).resolves.not.toThrow();
  });
});
