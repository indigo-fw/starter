/**
 * `bun run indigo brand:generate` — produces every derived brand asset from
 * `src/config/brand.ts`. Idempotent: running twice produces identical output.
 *
 * Outputs:
 *   public/favicon.ico                  (multi-resolution: 16, 32, 48)
 *   public/icon.svg                     (passthrough icon or rendered glyph)
 *   public/icon-192.png                 (Next.js convention)
 *   public/icon-512.png                 (Next.js convention)
 *   public/apple-icon.png               (180×180)
 *   public/og-image.png                 (1200×630 light variant)
 *   public/og-image-dark.png            (1200×630 dark variant)
 *   public/twitter-card.png             (1200×675)
 *   public/site.webmanifest             (PWA metadata)
 *   public/brand/press-kit.zip          (bundle of all asset variants)
 *
 * Required runtime deps (install with `bun add`):
 *   sharp @resvg/resvg-js to-ico archiver satori
 *
 * Validates the brand config first; errors helpfully if assets are missing
 * for the declared mode.
 *
 * Runs in Bun-direct context — loads the brand config via the deps file
 * (which calls setBrandConfig) rather than through dynamic-import gymnastics.
 */

import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getBrandConfig,
  getBrandIconSvg,
} from '../lib/get-brand-config';
import {
  formatValidationErrors,
  validateBrandConfig,
} from '../lib/validate-config';
import type { BrandConfig, FaviconGlyph } from '../types/brand-config';

const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = resolve(PROJECT_ROOT, 'public');

interface GenerateOptions {
  /** Validate config and report what would change without writing files. */
  check?: boolean;
}

// ─── Public entry ────────────────────────────────────────────────────────────

export async function generateBrandAssets(options: GenerateOptions = {}): Promise<void> {
  console.log('▸ brand:generate — loading brand config');

  // Load config via the deps file — same registration the runtime uses.
  // This calls setBrandConfig(brand) which validates and caches.
  try {
    await import('@/config/deps/brand-deps');
  } catch (err) {
    console.error('✗ brand:generate failed — could not load @/config/deps/brand-deps');
    console.error('  ', (err as Error).message);
    console.error('  Hint: ensure src/config/deps/brand-deps.ts exists and src/config/brand.ts is valid.');
    process.exit(1);
  }

  const brand = getBrandConfig();
  const validation = validateBrandConfig(brand);

  if (!validation.ok) {
    console.error('\n✗ brand:generate failed — config is invalid:\n');
    console.error(formatValidationErrors(validation.errors));
    process.exit(1);
  }

  if (options.check) {
    console.log('✓ Config valid. Would produce these assets (skipped, --check mode):');
    listExpectedOutputs().forEach((path) => console.log(`  ${path}`));
    return;
  }

  ensureDir(PUBLIC_DIR);
  ensureDir(resolve(PUBLIC_DIR, 'brand'));

  await emitIconSvg(brand);
  await emitRasterIcons(brand);
  await emitOgImages(brand);
  await emitWebManifest(brand);
  await emitPressKit(brand);

  console.log('\n✓ brand:generate complete.\n');
  console.log('  Wire Next.js metadata in app/layout.tsx:');
  console.log('    import { getBrandMetadata } from "@/core-brand/lib/metadata";');
  console.log('    export const metadata = getBrandMetadata({ siteUrl: ... });');
}

// ─── Output list ─────────────────────────────────────────────────────────────

function listExpectedOutputs(): string[] {
  return [
    'public/favicon.ico',
    'public/icon.svg',
    'public/icon-192.png',
    'public/icon-512.png',
    'public/apple-icon.png',
    'public/og-image.png',
    'public/og-image-dark.png',
    'public/twitter-card.png',
    'public/site.webmanifest',
    'public/brand/press-kit.zip',
  ];
}

// ─── Asset emitters ──────────────────────────────────────────────────────────

/**
 * Source SVG used for all favicon-family rasterization.
 * Either the project's icon SVG (if mode supplies one), or a generated SVG
 * from `faviconGlyph` (text-only mode, or override).
 */
function resolveFaviconSource(brand: BrandConfig): string {
  // Prefer the icon SVG cached at setBrandConfig() time.
  const cached = getBrandIconSvg();
  if (cached) return cached;
  // Fall back to rendering the favicon glyph as SVG.
  if (brand.faviconGlyph) return renderGlyphSvg(brand.faviconGlyph);
  throw new Error('brand:generate: no favicon source resolvable (validation should have caught this)');
}

/** Write the SVG icon (Next.js serves it for browsers that support SVG favicons). */
async function emitIconSvg(brand: BrandConfig): Promise<void> {
  const svg = resolveFaviconSource(brand);
  writeFileSync(resolve(PUBLIC_DIR, 'icon.svg'), svg, 'utf-8');
  console.log('  ✓ public/icon.svg');
}

/**
 * Rasterize the favicon source to all required PNG sizes + build the
 * multi-resolution `.ico`.
 *
 * Uses `@resvg/resvg-js` (Bun-friendly, no headless browser) for SVG → PNG
 * and `to-ico` for the multi-res `.ico`. Both are optional — if not installed,
 * the rasterization step is skipped with a clear warning.
 */
async function emitRasterIcons(brand: BrandConfig): Promise<void> {
  const resvgMod = await optionalImport('@resvg/resvg-js');
  const toIcoMod = await optionalImport('to-ico');
  if (!resvgMod || !toIcoMod) {
    console.warn('  ⚠ favicon.ico / PNG variants skipped — install runtime deps:');
    console.warn('    bun add sharp @resvg/resvg-js to-ico archiver satori');
    return;
  }
  const Resvg = resvgMod.Resvg as new (
    svg: string,
    opts?: { fitTo?: { mode: 'width'; value: number } },
  ) => { render: () => { asPng: () => Uint8Array } };
  const toIco = (toIcoMod.default ?? toIcoMod) as (pngs: Buffer[]) => Promise<Buffer>;

  const svg = resolveFaviconSource(brand);

  const rasterize = (size: number): Buffer => {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    return Buffer.from(resvg.render().asPng());
  };

  const png16 = rasterize(16);
  const png32 = rasterize(32);
  const png48 = rasterize(48);
  const png180 = rasterize(180);
  const png192 = rasterize(192);
  const png512 = rasterize(512);

  const ico = await toIco([png16, png32, png48]);
  writeFileSync(resolve(PUBLIC_DIR, 'favicon.ico'), ico);
  writeFileSync(resolve(PUBLIC_DIR, 'apple-icon.png'), png180);
  writeFileSync(resolve(PUBLIC_DIR, 'icon-192.png'), png192);
  writeFileSync(resolve(PUBLIC_DIR, 'icon-512.png'), png512);

  console.log('  ✓ public/favicon.ico (16/32/48)');
  console.log('  ✓ public/apple-icon.png (180×180)');
  console.log('  ✓ public/icon-192.png');
  console.log('  ✓ public/icon-512.png');
}

/**
 * OG / Twitter card composition.
 *
 * Three templates supported:
 *   'gradient-mark'    — mark on brand-gradient background + name + tagline
 *   'centered-lockup'  — lockup centered on solid bg
 *   'custom-svg'       — user provides ogImage.customSvg, we just rasterize it
 *
 * NOTE — the satori composition is intentionally left as scaffolding here.
 * Implementing it well requires bundled fonts (Inter/Manrope as TTF) and
 * theme-aware JSX templates that read brand.colors. That's a bounded but
 * non-trivial chunk — leaving as a TODO for the next pass rather than a
 * weak first attempt.
 */
async function emitOgImages(brand: BrandConfig): Promise<void> {
  const resvgMod = await optionalImport('@resvg/resvg-js');
  if (!resvgMod) {
    console.warn('  ⚠ og-image*.png skipped — install @resvg/resvg-js');
    return;
  }
  const Resvg = resvgMod.Resvg as new (
    svg: string,
    opts?: { fitTo?: { mode: 'width'; value: number } },
  ) => { render: () => { asPng: () => Uint8Array } };

  // For 'custom-svg' template the user already gave us a finished SVG — we
  // do light template substitution (placeholders → brand.ts values) before
  // rasterization. See `substituteOgPlaceholders()` below for the contract.
  if (brand.ogImage?.template === 'custom-svg' && brand.ogImage.customSvg) {
    const customPath = resolve(PROJECT_ROOT, brand.ogImage.customSvg.replace(/^\//, ''));
    if (!existsSync(customPath)) {
      console.warn(`  ⚠ ogImage.customSvg not found at ${customPath}`);
      return;
    }
    const fs = await import('node:fs');
    const rawSvg = fs.readFileSync(customPath, 'utf-8');
    const svg = substituteOgPlaceholders(rawSvg, brand);
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
    const png = Buffer.from(resvg.render().asPng());
    writeFileSync(resolve(PUBLIC_DIR, 'og-image.png'), png);
    writeFileSync(resolve(PUBLIC_DIR, 'og-image-dark.png'), png);
    writeFileSync(resolve(PUBLIC_DIR, 'twitter-card.png'), png);
    console.log('  ✓ public/og-image.png (from custom SVG)');
    console.log('  ✓ public/og-image-dark.png (from custom SVG)');
    console.log('  ✓ public/twitter-card.png (from custom SVG)');
    return;
  }

  // Templates 'gradient-mark' and 'centered-lockup' need satori composition.
  // Implementing well requires bundled fonts + theme-aware JSX templates.
  // Left as a follow-up — use ogImage.template = 'custom-svg' as a workaround.
  console.warn('  ⚠ og-image*.png / twitter-card.png not generated.');
  console.warn('    Templates "gradient-mark" / "centered-lockup" need satori composition');
  console.warn('    + bundled fonts. Use ogImage.template = "custom-svg" with a ready');
  console.warn('    SVG as a workaround until the satori implementation is added.');
}

/** Web App Manifest (PWA). */
async function emitWebManifest(brand: BrandConfig): Promise<void> {
  const manifest = {
    name: brand.name,
    short_name: brand.name,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    theme_color: brand.colors.brand,
    background_color: brand.colors.bgLight,
    display: 'standalone',
    start_url: '/',
  };
  writeFileSync(
    resolve(PUBLIC_DIR, 'site.webmanifest'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
  console.log('  ✓ public/site.webmanifest');
}

/**
 * Press-kit zip bundle. Includes whatever assets currently exist in public/,
 * plus a brand.json snapshot of the color palette for designers.
 */
async function emitPressKit(brand: BrandConfig): Promise<void> {
  const archiverMod = await optionalImport('archiver');
  if (!archiverMod) {
    console.warn('  ⚠ brand/press-kit.zip skipped — install archiver');
    return;
  }
  const archiverFn = (archiverMod.default ?? archiverMod) as (
    fmt: string,
    opts?: { zlib?: { level: number } },
  ) => {
    pipe: (s: unknown) => void;
    file: (path: string, opts: { name: string }) => void;
    append: (data: string, opts: { name: string }) => void;
    finalize: () => Promise<void>;
  };

  const outPath = resolve(PUBLIC_DIR, 'brand/press-kit.zip');
  const output = createWriteStream(outPath);
  const archive = archiverFn('zip', { zlib: { level: 9 } });
  archive.pipe(output);

  const candidates = [
    'icon.svg',
    'favicon.ico',
    'apple-icon.png',
    'icon-192.png',
    'icon-512.png',
    'og-image.png',
    'og-image-dark.png',
    'twitter-card.png',
    'site.webmanifest',
  ];
  for (const file of candidates) {
    const filePath = resolve(PUBLIC_DIR, file);
    if (existsSync(filePath)) archive.file(filePath, { name: file });
  }
  archive.append(JSON.stringify({ name: brand.name, colors: brand.colors }, null, 2), {
    name: 'brand.json',
  });

  await archive.finalize();
  await new Promise<void>((res, rej) => {
    output.on('close', () => res());
    output.on('error', rej);
  });
  console.log('  ✓ public/brand/press-kit.zip');
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/** Render a faviconGlyph as a complete SVG string suitable for rasterization. */
function renderGlyphSvg(glyph: FaviconGlyph): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="10" fill="${escapeAttr(glyph.bg)}"/>
  <text x="32" y="32" text-anchor="middle" dominant-baseline="central"
        font-family="${escapeAttr(glyph.font)}" font-weight="${glyph.weight}"
        font-size="40" fill="${escapeAttr(glyph.fg)}">${escapeXml(glyph.text)}</text>
</svg>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Dynamic import that bypasses TS module resolution at compile time.
 * Returns the module or `null` if not installed. Used for the optional
 * runtime deps (`sharp`, `@resvg/resvg-js`, etc.) so the CLI compiles
 * even before they're installed.
 */
async function optionalImport(name: string): Promise<Record<string, unknown> | null> {
  try {
    // The indirection through a variable defeats TS's static module resolution.
    const moduleName = name;
    return (await import(moduleName)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Substitute placeholder tokens in the user's OG SVG with values from
 * `brand.ts`. Supported tokens (use `{{token}}` in the SVG):
 *
 *   {{name}}    — brand.name (the wordmark text)
 *   {{tagline}} — brand.ogImage?.tagline (empty if not set)
 *
 * Brand colors are intentionally NOT substituted — the OG image is treated
 * as a designed artifact, not a derived one. Edit the SVG file directly to
 * change colors. (Adding color tokens would require OKLCH→hex conversion
 * since @resvg/resvg-js doesn't fully support OKLCH; not worth the
 * complexity for v1.)
 *
 * Exported for tests.
 */
export function substituteOgPlaceholders(svg: string, brand: BrandConfig): string {
  const replacements: Record<string, string> = {
    name: escapeXml(brand.name),
    tagline: escapeXml(brand.ogImage?.tagline ?? ''),
  };
  return svg.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    // Unknown tokens pass through unchanged — lets the SVG carry literal
    // `{{...}}` strings if someone has a weird reason to.
    return key in replacements ? (replacements[key] as string) : match;
  });
}
