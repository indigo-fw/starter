import { describe, it, expect } from 'vitest';
import {
  validateBrandConfig,
  formatValidationErrors,
} from '@/core-brand/lib/validate-config';
import type {
  BrandConfig,
  BrandConfigIconText,
  BrandConfigTextOnly,
  BrandConfigLockup,
  FaviconGlyph,
  WordmarkConfig,
} from '@/core-brand/types/brand-config';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseColors = {
  brand: 'oklch(0.60 0.22 274)',
  bgLight: '#ffffff',
  bgDark: 'oklch(0.13 0.02 260)',
};

const wordmark: WordmarkConfig = {
  text: 'Indigo',
  font: 'Manrope',
  weight: 700,
};

const glyph: FaviconGlyph = {
  text: 'I',
  font: 'Manrope',
  weight: 800,
  bg: '#5b59d4',
  fg: '#ffffff',
};

// Use an SVG that's guaranteed to exist for the icon-related tests.
const REAL_ICON_PATH = 'src/brand/icon.svg';

// ─── name + colors ───────────────────────────────────────────────────────────

describe('validateBrandConfig — common fields', () => {
  it('rejects empty name', () => {
    const config = {
      name: '',
      mode: 'text-only',
      wordmark,
      faviconGlyph: glyph,
      colors: baseColors,
    } as BrandConfigTextOnly;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects missing brand color', () => {
    const config = {
      name: 'Indigo',
      mode: 'text-only',
      wordmark,
      faviconGlyph: glyph,
      colors: { brand: '', bgLight: '#fff', bgDark: '#000' },
    } as BrandConfigTextOnly;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'colors.brand')).toBe(true);
  });
});

// ─── icon+text mode ──────────────────────────────────────────────────────────

describe("validateBrandConfig — mode 'icon+text'", () => {
  it('passes with icon + wordmark', () => {
    const config: BrandConfigIconText = {
      name: 'Indigo',
      mode: 'icon+text',
      icon: REAL_ICON_PATH,
      wordmark,
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(true);
  });

  it('rejects missing icon path', () => {
    const config = {
      name: 'Indigo',
      mode: 'icon+text',
      icon: undefined,
      wordmark,
      colors: baseColors,
    } as unknown as BrandConfigIconText;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'icon')).toBe(true);
  });

  it('rejects nonexistent icon file', () => {
    const config: BrandConfigIconText = {
      name: 'Indigo',
      mode: 'icon+text',
      icon: 'src/brand/does-not-exist.svg',
      wordmark,
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'icon' && e.message.includes('not found')),
    ).toBe(true);
  });
});

// ─── text-only mode ──────────────────────────────────────────────────────────

describe("validateBrandConfig — mode 'text-only'", () => {
  it('passes with name + glyph', () => {
    const config: BrandConfigTextOnly = {
      name: 'Indigo',
      mode: 'text-only',
      wordmark,
      faviconGlyph: glyph,
      colors: baseColors,
    };
    expect(validateBrandConfig(config).ok).toBe(true);
  });

  it('rejects missing faviconGlyph', () => {
    const config = {
      name: 'Indigo',
      mode: 'text-only',
      wordmark,
      colors: baseColors,
    } as BrandConfigTextOnly;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'faviconGlyph')).toBe(true);
  });

  it('rejects faviconGlyph.text longer than 2 chars', () => {
    const config: BrandConfigTextOnly = {
      name: 'Indigo',
      mode: 'text-only',
      wordmark,
      faviconGlyph: { ...glyph, text: 'IND' },
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'faviconGlyph.text')).toBe(true);
  });

  it('rejects empty faviconGlyph.text', () => {
    const config: BrandConfigTextOnly = {
      name: 'Indigo',
      mode: 'text-only',
      wordmark,
      faviconGlyph: { ...glyph, text: '' },
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'faviconGlyph.text')).toBe(true);
  });
});

// ─── lockup mode ─────────────────────────────────────────────────────────────

describe("validateBrandConfig — mode 'lockup'", () => {
  it('rejects lockup with neither icon nor faviconGlyph', () => {
    const config = {
      name: 'Indigo',
      mode: 'lockup',
      lockup: 'src/brand/lockup.svg',
      colors: baseColors,
    } as BrandConfigLockup;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.field === 'icon/faviconGlyph'),
    ).toBe(true);
  });

  it('rejects missing lockup file', () => {
    const config: BrandConfigLockup = {
      name: 'Indigo',
      mode: 'lockup',
      lockup: 'src/brand/does-not-exist-lockup.svg',
      faviconGlyph: glyph,
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'lockup')).toBe(true);
  });

  it('passes lockup with faviconGlyph fallback for favicon', () => {
    // lockup file existence is checked by validator — we point at one we know
    // exists. There's no lockup.svg in the repo, so use the icon (a real file)
    // — the validator only checks existence, not aspect ratio for lockups.
    const config: BrandConfigLockup = {
      name: 'Indigo',
      mode: 'lockup',
      lockup: REAL_ICON_PATH, // existence check passes
      faviconGlyph: glyph,
      colors: baseColors,
    };
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(true);
  });
});

// ─── unknown mode ────────────────────────────────────────────────────────────

describe('validateBrandConfig — defensive', () => {
  it('rejects unknown mode', () => {
    const config = {
      name: 'X',
      mode: 'unknown-mode',
      colors: baseColors,
    } as unknown as BrandConfig;
    const result = validateBrandConfig(config);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === 'mode')).toBe(true);
  });
});

// ─── formatter ───────────────────────────────────────────────────────────────

describe('formatValidationErrors', () => {
  it('formats with hints', () => {
    const out = formatValidationErrors([
      { field: 'icon', message: 'missing', hint: 'add it' },
    ]);
    expect(out).toContain('[icon] missing');
    expect(out).toContain('→ add it');
  });

  it('formats without hints', () => {
    const out = formatValidationErrors([{ field: 'name', message: 'required' }]);
    expect(out).toContain('[name] required');
    expect(out).not.toContain('→');
  });
});
