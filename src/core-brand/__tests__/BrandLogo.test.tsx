import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BrandLogo } from '@/core-brand/components/BrandLogo';
import {
  setBrandConfig,
  _resetBrandConfigCache,
} from '@/core-brand/lib/get-brand-config';
import type {
  BrandConfigIconText,
  BrandConfigTextOnly,
  BrandConfigLockup,
  FaviconGlyph,
  WordmarkConfig,
} from '@/core-brand/types/brand-config';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const colors = {
  brand: 'oklch(0.60 0.22 274)',
  bgLight: '#ffffff',
  bgDark: '#1c1d28',
};

const wordmark: WordmarkConfig = {
  text: 'Indigo',
  font: 'Manrope',
  weight: 700,
  tracking: -0.02,
};

const glyph: FaviconGlyph = {
  text: 'I',
  font: 'Manrope',
  weight: 800,
  bg: '#5b59d4',
  fg: '#ffffff',
};

const ICON_PATH = 'src/brand/icon.svg';

const iconTextConfig: BrandConfigIconText = {
  name: 'Indigo',
  mode: 'icon+text',
  icon: ICON_PATH,
  wordmark,
  colors,
};

const textOnlyConfig: BrandConfigTextOnly = {
  name: 'Indigo',
  mode: 'text-only',
  wordmark,
  faviconGlyph: glyph,
  colors,
};

// For lockup mode we use the icon as the "lockup" file (any real file works
// for the validator — it doesn't check that lockups are horizontal).
const lockupConfig: BrandConfigLockup = {
  name: 'Indigo',
  mode: 'lockup',
  lockup: ICON_PATH,
  faviconGlyph: glyph,
  colors,
};

afterEach(() => {
  cleanup();
  _resetBrandConfigCache();
});

// ─── icon+text mode (4 variants) ────────────────────────────────────────────

describe("BrandLogo — mode 'icon+text'", () => {
  beforeEach(() => setBrandConfig(iconTextConfig));

  it("variant='mark' renders inline icon SVG", () => {
    const { container } = render(<BrandLogo variant="mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('aria-label')).toBe('Indigo');
  });

  it("variant='wordmark' renders the wordmark text", () => {
    const { container } = render(<BrandLogo variant="wordmark" />);
    expect(container.textContent).toBe('Indigo');
  });

  it("variant='lockup' renders icon + text side-by-side", () => {
    const { container } = render(<BrandLogo variant="lockup" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).toContain('Indigo');
  });

  it("variant='auto' renders both lockup (sm+) and mark (mobile)", () => {
    const { container } = render(<BrandLogo variant="auto" />);
    expect(container.querySelector('.hidden.sm\\:inline-flex')).toBeInTheDocument();
    expect(container.querySelector('.sm\\:hidden')).toBeInTheDocument();
  });
});

// ─── text-only mode (4 variants) ────────────────────────────────────────────

describe("BrandLogo — mode 'text-only'", () => {
  beforeEach(() => setBrandConfig(textOnlyConfig));

  it("variant='mark' falls back to faviconGlyph square", () => {
    const { container } = render(<BrandLogo variant="mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // GlyphSquare uses a <rect> + <text>
    expect(svg?.querySelector('rect')).toBeInTheDocument();
    expect(svg?.querySelector('text')?.textContent).toBe('I');
  });

  it("variant='wordmark' renders the wordmark text", () => {
    const { container } = render(<BrandLogo variant="wordmark" />);
    expect(container.textContent).toBe('Indigo');
  });

  it("variant='lockup' degrades to wordmark only (no icon to compose)", () => {
    const { container } = render(<BrandLogo variant="lockup" />);
    expect(container.textContent).toBe('Indigo');
    // No icon SVG should be rendered
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it("variant='auto' renders both layouts (both are wordmark/glyph in this mode)", () => {
    const { container } = render(<BrandLogo variant="auto" />);
    expect(container.querySelector('.hidden.sm\\:inline-flex')).toBeInTheDocument();
    expect(container.querySelector('.sm\\:hidden')).toBeInTheDocument();
  });
});

// ─── lockup mode (4 variants) ───────────────────────────────────────────────

describe("BrandLogo — mode 'lockup'", () => {
  beforeEach(() => setBrandConfig(lockupConfig));

  it("variant='mark' falls back to faviconGlyph (no separate icon registered)", () => {
    // Note: this lockup config has no `icon`, only `lockup` + faviconGlyph.
    // Mark renderer should fall through to the glyph square.
    const { container } = render(<BrandLogo variant="mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelector('text')?.textContent).toBe('I');
  });

  it("variant='wordmark' renders the brand name (no wordmark config in lockup mode)", () => {
    const { container } = render(<BrandLogo variant="wordmark" />);
    expect(container.textContent).toBe('Indigo');
  });

  it("variant='lockup' renders the lockup SVG", () => {
    const { container } = render(<BrandLogo variant="lockup" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it("variant='auto' renders both layouts", () => {
    const { container } = render(<BrandLogo variant="auto" />);
    expect(container.querySelector('.hidden.sm\\:inline-flex')).toBeInTheDocument();
    expect(container.querySelector('.sm\\:hidden')).toBeInTheDocument();
  });
});

// ─── Defaults + className passthrough ────────────────────────────────────────

describe('BrandLogo — common behavior', () => {
  beforeEach(() => setBrandConfig(iconTextConfig));

  it('defaults to variant="lockup"', () => {
    const { container } = render(<BrandLogo />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).toContain('Indigo');
  });

  it('passes className through to the rendered SVG', () => {
    const { container } = render(<BrandLogo variant="mark" className="h-8 w-auto" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('h-8');
  });
});

// ─── Error handling ──────────────────────────────────────────────────────────

describe('BrandLogo — error states', () => {
  it('throws a helpful error if setBrandConfig was never called', () => {
    expect(() => render(<BrandLogo />)).toThrow(/brand config not registered/);
  });
});
