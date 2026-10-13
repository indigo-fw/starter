import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_UPLOAD_MAX_IMAGE_PX,
  UnsupportedImageError,
  getUploadMaxImagePx,
  normalizeImage,
} from '@/core/lib/media/normalize-image';

const env = process.env as Record<string, string | undefined>;

/** Solid-colour image of the given size in the given encoder. */
function solid(
  width: number,
  height: number,
  encode: (p: sharp.Sharp) => sharp.Sharp
): Promise<Buffer> {
  return encode(
    sharp({
      create: { width, height, channels: 3, background: '#4060c0' },
    })
  ).toBuffer();
}

/**
 * Landscape JPEG tagged EXIF orientation 6 (rotate 90° CW to display), plus a
 * GPS block — what a phone camera hands us.
 */
async function rotatedJpegWithExif(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 20, channels: 3, background: '#4060c0' },
  })
    .jpeg()
    .withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Copyright: 'leaky-tester' },
        IFD3: { GPSLatitudeRef: 'N' },
      },
    })
    .toBuffer();
}

afterEach(() => {
  delete env.UPLOAD_MAX_IMAGE_PX;
});

describe('normalizeImage', () => {
  it('bakes EXIF orientation into the pixels and strips the EXIF block', async () => {
    const input = await rotatedJpegWithExif();
    const inMeta = await sharp(input).metadata();
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif).toBeDefined();

    const out = await normalizeImage(input, 'image/jpeg', { maxPx: 2560 });
    expect(out.normalized).toBe(true);
    expect(out.mimeType).toBe('image/jpeg');
    // 40x20 landscape + orientation 6 displays as 20x40 portrait.
    expect(out.width).toBe(20);
    expect(out.height).toBe(40);

    const outMeta = await sharp(out.buffer).metadata();
    expect(outMeta.format).toBe('jpeg');
    expect(outMeta.width).toBe(20);
    expect(outMeta.height).toBe(40);
    expect(outMeta.orientation).toBeUndefined();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
    expect(outMeta.icc).toBeUndefined();
  });

  it('caps the longest side at maxPx, preserving aspect ratio and format', async () => {
    const input = await solid(4000, 1000, (p) => p.png());
    const out = await normalizeImage(input, 'image/png', { maxPx: 1000 });
    expect(out.width).toBe(1000);
    expect(out.height).toBe(250);
    expect(out.buffer.length).toBeLessThan(input.length);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([1000, 250]);
  });

  it('never enlarges a small image', async () => {
    const input = await solid(300, 200, (p) => p.webp());
    const out = await normalizeImage(input, 'image/webp', { maxPx: 2560 });
    expect([out.width, out.height]).toEqual([300, 200]);
    expect((await sharp(out.buffer).metadata()).format).toBe('webp');
  });

  it('maxPx = 0 disables the resize but still normalises', async () => {
    const input = await solid(3000, 100, (p) => p.jpeg());
    const out = await normalizeImage(input, 'image/jpeg', { maxPx: 0 });
    expect([out.width, out.height]).toEqual([3000, 100]);
    expect(out.normalized).toBe(true);
  });

  it('passes a GIF through byte-for-byte', async () => {
    const input = await solid(50, 30, (p) => p.gif());
    const out = await normalizeImage(input, 'image/gif', { maxPx: 10 });
    expect(out.normalized).toBe(false);
    expect(out.buffer).toBe(input);
    expect([out.width, out.height]).toEqual([50, 30]);
  });

  it('passes an animated (multi-page) WebP through untouched', async () => {
    // Two distinct frames (identical ones get collapsed by the encoder).
    const red = await solid(30, 30, (p) => p.png());
    const blue = await sharp({
      create: { width: 30, height: 30, channels: 3, background: '#c04040' },
    })
      .png()
      .toBuffer();
    const input = await sharp([red, blue], { join: { animated: true } })
      .webp({ loop: 0 })
      .toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);

    const out = await normalizeImage(input, 'image/webp', { maxPx: 10 });
    expect(out.normalized).toBe(false);
    expect(out.buffer).toBe(input);
  });

  it('rejects bytes that do not match the declared type', async () => {
    const png = await solid(10, 10, (p) => p.png());
    await expect(
      normalizeImage(png, 'image/jpeg', { maxPx: 2560 })
    ).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(
      normalizeImage(Buffer.from('<html></html>'), 'image/png', { maxPx: 0 })
    ).rejects.toThrow();
    await expect(
      normalizeImage(png, 'application/pdf', { maxPx: 0 })
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe('getUploadMaxImagePx', () => {
  it('defaults to 2560 and honours the env knob including 0', () => {
    expect(getUploadMaxImagePx()).toBe(DEFAULT_UPLOAD_MAX_IMAGE_PX);
    expect(DEFAULT_UPLOAD_MAX_IMAGE_PX).toBe(2560);
    env.UPLOAD_MAX_IMAGE_PX = '1024';
    expect(getUploadMaxImagePx()).toBe(1024);
    env.UPLOAD_MAX_IMAGE_PX = '0';
    expect(getUploadMaxImagePx()).toBe(0);
    env.UPLOAD_MAX_IMAGE_PX = 'lots';
    expect(getUploadMaxImagePx()).toBe(2560);
  });
});
