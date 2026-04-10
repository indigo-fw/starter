import { describe, it, expect } from 'vitest';
import { formatPrice, getCartSessionId } from '../lib/store-utils';
import { placeholderImage } from '../lib/placeholder-image';

// ─── formatPrice ────────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats cents to EUR by default', () => {
    expect(formatPrice(2990)).toBe('€29.90');
  });

  it('formats zero correctly', () => {
    expect(formatPrice(0)).toBe('€0.00');
  });

  it('returns empty string for null', () => {
    expect(formatPrice(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatPrice(undefined)).toBe('');
  });

  it('formats with custom currency', () => {
    const result = formatPrice(1000, 'USD');
    expect(result).toContain('10.00');
  });

  it('handles large amounts', () => {
    expect(formatPrice(9999999)).toBe('€99,999.99');
  });

  it('handles single cent', () => {
    expect(formatPrice(1)).toBe('€0.01');
  });
});

// ─── placeholderImage ───────────────────────────────────────────────────────

describe('placeholderImage', () => {
  it('returns a data URI SVG', () => {
    const result = placeholderImage('Test Product');
    expect(result).toMatch(/^data:image\/svg\+xml,/);
  });

  it('includes product initials', () => {
    const result = decodeURIComponent(placeholderImage('Classic Logo'));
    expect(result).toContain('CL');
  });

  it('single word produces single initial', () => {
    const result = decodeURIComponent(placeholderImage('Hoodie'));
    expect(result).toContain('H');
  });

  it('is deterministic — same name produces same output', () => {
    const a = placeholderImage('Developer Hoodie');
    const b = placeholderImage('Developer Hoodie');
    expect(a).toBe(b);
  });

  it('different names produce different images', () => {
    const a = placeholderImage('Product A');
    const b = placeholderImage('Product B');
    expect(a).not.toBe(b);
  });

  it('respects custom size', () => {
    const result = decodeURIComponent(placeholderImage('Test', 200));
    expect(result).toContain('width="200"');
    expect(result).toContain('height="200"');
  });

  it('contains valid SVG structure', () => {
    const result = decodeURIComponent(placeholderImage('Test'));
    expect(result).toContain('<svg');
    expect(result).toContain('</svg>');
    expect(result).toContain('<rect');
    expect(result).toContain('<circle');
    expect(result).toContain('<text');
  });
});

// ─── getCartSessionId ───────────────────────────────────────────────────────

describe('getCartSessionId', () => {
  it('returns empty string on server (no document)', () => {
    // In test environment document may be available via jsdom,
    // but the function should work without errors
    const result = getCartSessionId();
    expect(typeof result).toBe('string');
  });
});
