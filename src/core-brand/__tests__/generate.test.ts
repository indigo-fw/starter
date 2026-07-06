import { describe, it, expect } from 'vitest';
import { substituteOgPlaceholders } from '@/core-brand/cli/generate';
import type {
  BrandConfig,
  BrandConfigIconText,
  WordmarkConfig,
} from '@/core-brand/types/brand-config';

const wordmark: WordmarkConfig = { text: 'Indigo', font: 'Manrope', weight: 700 };
const colors = { brand: '#5b59d4', bgLight: '#fff', bgDark: '#000' };

function makeBrand(overrides: Partial<BrandConfigIconText> = {}): BrandConfig {
  return {
    name: 'Indigo',
    mode: 'icon+text',
    icon: 'src/brand/icon.svg',
    wordmark,
    colors,
    ...overrides,
  } as BrandConfig;
}

describe('substituteOgPlaceholders', () => {
  it('substitutes {{name}} with brand.name', () => {
    const svg = '<text>{{name}}</text>';
    const out = substituteOgPlaceholders(svg, makeBrand({ name: 'Acme' }));
    expect(out).toBe('<text>Acme</text>');
  });

  it('substitutes {{tagline}} with brand.ogImage.tagline', () => {
    const svg = '<text>{{tagline}}</text>';
    const out = substituteOgPlaceholders(
      svg,
      makeBrand({ ogImage: { template: 'custom-svg', tagline: 'Hello world' } }),
    );
    expect(out).toBe('<text>Hello world</text>');
  });

  it('substitutes {{tagline}} with empty string when not configured', () => {
    const svg = '<text>{{tagline}}</text>';
    const out = substituteOgPlaceholders(svg, makeBrand());
    expect(out).toBe('<text></text>');
  });

  it('substitutes multiple occurrences', () => {
    const svg = '{{name}} — {{name}}';
    const out = substituteOgPlaceholders(svg, makeBrand({ name: 'X' }));
    expect(out).toBe('X — X');
  });

  it('tolerates whitespace inside braces ({{ name }})', () => {
    const svg = '<text>{{  name  }}</text>';
    const out = substituteOgPlaceholders(svg, makeBrand({ name: 'Indigo' }));
    expect(out).toBe('<text>Indigo</text>');
  });

  it('XML-escapes the substituted values', () => {
    const svg = '<text>{{name}}</text>';
    const out = substituteOgPlaceholders(svg, makeBrand({ name: 'A & <B>' }));
    expect(out).toContain('A &amp; &lt;B&gt;');
  });

  it('passes unknown tokens through unchanged', () => {
    const svg = '<text>{{unknown}} {{name}}</text>';
    const out = substituteOgPlaceholders(svg, makeBrand({ name: 'X' }));
    expect(out).toBe('<text>{{unknown}} X</text>');
  });

  it('leaves SVG without placeholders untouched', () => {
    const svg = '<svg><text>static</text></svg>';
    const out = substituteOgPlaceholders(svg, makeBrand());
    expect(out).toBe(svg);
  });
});
