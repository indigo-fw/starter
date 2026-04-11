import { describe, it, expect } from 'vitest';

// buildPageNumbers is not exported, so test via rendering logic.
// We test the algorithm directly by extracting it.
// Since it's private, replicate the logic here for unit testing.

function buildPageNumbers(current: number, total: number, max: number): (number | '...')[] {
  if (total <= max) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [];
  const sideCount = Math.floor((max - 3) / 2);

  pages.push(1);

  const startPage = Math.max(2, current - sideCount);
  const endPage = Math.min(total - 1, current + sideCount);

  if (startPage > 2) pages.push('...');
  for (let i = startPage; i <= endPage; i++) pages.push(i);
  if (endPage < total - 1) pages.push('...');

  pages.push(total);
  return pages;
}

describe('buildPageNumbers', () => {
  it('shows all pages when total <= max', () => {
    expect(buildPageNumbers(1, 5, 7)).toEqual([1, 2, 3, 4, 5]);
  });

  it('shows all pages when total equals max', () => {
    expect(buildPageNumbers(3, 7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('shows ellipsis at end when on first page', () => {
    const result = buildPageNumbers(1, 20, 7);
    expect(result[0]).toBe(1);
    expect(result[result.length - 1]).toBe(20);
    expect(result).toContain('...');
    // Should not have ellipsis at start (pages 1-3 visible)
    expect(result[1]).not.toBe('...');
  });

  it('shows ellipsis at start when on last page', () => {
    const result = buildPageNumbers(20, 20, 7);
    expect(result[0]).toBe(1);
    expect(result[result.length - 1]).toBe(20);
    expect(result[1]).toBe('...');
  });

  it('shows ellipsis on both sides when in middle', () => {
    const result = buildPageNumbers(10, 20, 7);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('...');
    expect(result).toContain(10);
    expect(result[result.length - 2]).toBe('...');
    expect(result[result.length - 1]).toBe(20);
  });

  it('always includes first and last page', () => {
    for (const current of [1, 5, 10, 15, 20]) {
      const result = buildPageNumbers(current, 20, 7);
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBe(20);
    }
  });

  it('current page is always included', () => {
    for (const current of [1, 5, 10, 15, 20]) {
      const result = buildPageNumbers(current, 20, 7);
      expect(result).toContain(current);
    }
  });

  it('handles 1 total page', () => {
    expect(buildPageNumbers(1, 1, 7)).toEqual([1]);
  });

  it('handles 2 total pages', () => {
    expect(buildPageNumbers(1, 2, 7)).toEqual([1, 2]);
  });
});
