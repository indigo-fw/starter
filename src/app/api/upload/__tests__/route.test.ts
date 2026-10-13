import { POST } from '../route';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkRateLimit } from '@/core/lib/infra/rate-limit';
import { asMock } from '@/test-utils';

const { sharpState, normState, mockLog, uploadMock } = vi.hoisted(() => ({
  sharpState: {
    format: 'png' as string | undefined,
    width: 1000,
    height: 500,
    fail: false,
  },
  // Output of the (mocked) privacy pass. Dims default to the sniffed ones;
  // `bytes` is what the route must store and report.
  normState: {
    width: undefined as number | undefined,
    height: undefined as number | undefined,
    bytes: Buffer.from('normalised-original'),
    fail: false,
    passthrough: false,
  },
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  uploadMock: vi.fn(async (p: string) => p),
}));

vi.mock('@/core/lib/media/normalize-image', () => ({
  getUploadMaxImagePx: () => 2560,
  normalizeImage: vi.fn(async (buffer: Buffer, mimeType: string) => {
    if (normState.fail) throw new Error('VipsJpeg: premature end of data');
    return {
      buffer: normState.passthrough ? buffer : normState.bytes,
      width: normState.width ?? sharpState.width,
      height: normState.height ?? sharpState.height,
      mimeType,
      normalized: !normState.passthrough,
    };
  }),
}));

vi.mock('sharp', () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    blur: () => chain,
    toBuffer: async () => Buffer.from('variant'),
    metadata: async () => {
      if (sharpState.fail)
        throw new Error('Input buffer contains unsupported image format');
      return {
        format: sharpState.format,
        width: sharpState.width,
        height: sharpState.height,
      };
    },
  };
  return { default: () => chain };
});
vi.mock('@/core/lib/media-processing', () => ({ configureSharp: vi.fn() }));
vi.mock('@/core/lib/infra/logger', () => ({ createLogger: () => mockLog }));
vi.mock('@/core/lib/infra/redis', () => ({ getRequestRedis: () => null }));
vi.mock('@/core/lib/infra/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 59,
    retryAfterMs: 0,
  })),
}));
vi.mock('@/core/policy', () => ({
  Policy: { for: () => ({ can: () => true }) },
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: 'user-1', role: 'admin' },
      })),
    },
  },
}));
vi.mock('@/core/storage', () => ({
  getStorage: () => ({
    upload: uploadMock,
    url: (p: string) => `http://localhost:3000/api/uploads/${p}`,
  }),
}));

function requestWith(file: File | string | null): Request {
  const formData = new FormData();
  if (file !== null) formData.append('file', file);
  return {
    headers: new Headers(),
    formData: async () => formData,
  } as unknown as Request;
}

function fileOf(name: string, type: string, size = 16): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharpState.format = 'png';
    sharpState.width = 1000;
    sharpState.height = 500;
    sharpState.fail = false;
    normState.width = undefined;
    normState.height = undefined;
    normState.fail = false;
    normState.passthrough = false;
  });

  it('stores the normalised bytes and reports their size, not the upload size', async () => {
    sharpState.format = 'jpeg';
    const res = await POST(requestWith(fileOf('Photo.jpg', 'image/jpeg', 64)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileSize).toBe(normState.bytes.length);
    expect(body.fileSize).not.toBe(64);
    // First upload is the original; it must be the normalised buffer.
    const [, storedBuffer] = uploadMock.mock.calls[0] as unknown as [
      string,
      Buffer,
    ];
    expect(storedBuffer.equals(normState.bytes)).toBe(true);
  });

  it('reports normalised dimensions and derives variants from them', async () => {
    // Sniffed 4000x2000, capped by the pass to 2560x1280.
    sharpState.width = 4000;
    sharpState.height = 2000;
    normState.width = 2560;
    normState.height = 1280;
    const body = await (
      await POST(requestWith(fileOf('big.png', 'image/png')))
    ).json();
    expect(body.width).toBe(2560);
    expect(body.height).toBe(1280);
    expect(body.mediumPath).toMatch(/-medium\.webp$/);

    // Capped below the medium breakpoint → thumbnail only.
    normState.width = 600;
    normState.height = 300;
    const small = await (
      await POST(requestWith(fileOf('big.png', 'image/png')))
    ).json();
    expect(small.width).toBe(600);
    expect(small.thumbnailPath).toMatch(/-thumb\.webp$/);
    expect(small.mediumPath).toBeUndefined();
  });

  it('returns 415 and stores nothing when normalisation throws', async () => {
    sharpState.format = 'jpeg';
    normState.fail = true;
    const res = await POST(requestWith(fileOf('a.jpg', 'image/jpeg')));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/could not be processed/);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(
      'Image normalisation failed',
      expect.objectContaining({ mimeType: 'image/jpeg' })
    );
  });

  it('a passed-through GIF keeps its original bytes and size', async () => {
    sharpState.format = 'gif';
    normState.passthrough = true;
    const res = await POST(requestWith(fileOf('anim.gif', 'image/gif', 48)));
    expect(res.status).toBe(200);
    expect((await res.json()).fileSize).toBe(48);
  });

  it('does not normalise documents or video', async () => {
    const res = await POST(requestWith(fileOf('clip.mp4', 'video/mp4', 32)));
    expect(res.status).toBe(200);
    expect((await res.json()).fileSize).toBe(32);
  });

  it('accepts a well-formed image and reports dimensions', async () => {
    const res = await POST(requestWith(fileOf('Photo.PNG', 'image/png')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mimeType).toBe('image/png');
    expect(body.width).toBe(1000);
    expect(body.height).toBe(500);
    expect(body.thumbnailPath).toMatch(/-thumb\.webp$/);
  });

  it('returns 400 when the body is not form data', async () => {
    const req = {
      headers: new Headers(),
      formData: async () => {
        throw new TypeError('Could not parse content as FormData.');
      },
    } as unknown as Request;
    expect((await POST(req)).status).toBe(400);
  });

  it('returns 400 when the file field is missing or not a file', async () => {
    expect((await POST(requestWith(null))).status).toBe(400);
    expect((await POST(requestWith('just-a-string'))).status).toBe(400);
  });

  it('returns 415 when the extension is not paired with the declared MIME', async () => {
    const res = await POST(requestWith(fileOf('evil.html', 'image/png')));
    expect(res.status).toBe(415);
  });

  it('returns 415 for a MIME type outside the whitelist', async () => {
    expect(
      (await POST(requestWith(fileOf('x.svg', 'image/svg+xml')))).status
    ).toBe(415);
    expect((await POST(requestWith(fileOf('x.bin', '')))).status).toBe(415);
  });

  it('returns 413 with per-type caps (10MB image, 50MB video)', async () => {
    const big = { size: 11 * 1024 * 1024 };
    const img = Object.defineProperty(fileOf('a.jpg', 'image/jpeg'), 'size', {
      value: big.size,
    });
    expect((await POST(requestWith(img))).status).toBe(413);

    const vid = Object.defineProperty(fileOf('a.mp4', 'video/mp4'), 'size', {
      value: big.size,
    });
    expect((await POST(requestWith(vid))).status).toBe(200);

    const hugeVid = Object.defineProperty(
      fileOf('b.mp4', 'video/mp4'),
      'size',
      {
        value: 51 * 1024 * 1024,
      }
    );
    expect((await POST(requestWith(hugeVid))).status).toBe(413);
  });

  it('returns 415 when image bytes decode to a different format than declared', async () => {
    sharpState.format = 'jpeg';
    const res = await POST(requestWith(fileOf('a.png', 'image/png')));
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/does not match/);
  });

  it('returns 415 when image bytes do not decode at all', async () => {
    sharpState.fail = true;
    expect((await POST(requestWith(fileOf('a.png', 'image/png')))).status).toBe(
      415
    );
  });

  it('accepts AVIF reported by sharp as heif', async () => {
    sharpState.format = 'heif';
    const res = await POST(requestWith(fileOf('a.avif', 'image/avif')));
    expect(res.status).toBe(200);
    expect((await res.json()).thumbnailPath).toBeUndefined();
  });

  it('does not content-sniff documents (extension pairing only)', async () => {
    sharpState.fail = true;
    expect(
      (await POST(requestWith(fileOf('report.pdf', 'application/pdf')))).status
    ).toBe(200);
  });

  it('returns 429 with Retry-After when the per-user limit is hit', async () => {
    asMock(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 90_500,
    });
    const res = await POST(requestWith(fileOf('a.png', 'image/png')));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('91');
    expect(asMock(checkRateLimit).mock.calls[0]?.[1]).toBe(
      'upload:user:user-1'
    );
  });
});
