import { describe, it, expect } from 'vitest';
import { extractKeywords } from '../lib/image/normalizer';

describe('extractKeywords', () => {
  it('extracts simple keywords', () => {
    const result = extractKeywords('red dress bedroom');
    expect(result).toContain('dress');
    expect(result).toContain('bedroom');
  });

  it('removes stop words', () => {
    const result = extractKeywords('show me a photo of her in the bedroom');
    expect(result).not.toContain('me');
    expect(result).not.toContain('a');
    expect(result).not.toContain('of');
    expect(result).not.toContain('her');
    expect(result).not.toContain('in');
    expect(result).not.toContain('the');
  });

  it('lowercases all keywords', () => {
    const result = extractKeywords('Red Bikini BEACH');
    for (const kw of result) {
      expect(kw).toBe(kw.toLowerCase());
    }
  });

  it('removes special characters', () => {
    const result = extractKeywords('sexy!!! hot??? wow...');
    // Should not have punctuation
    for (const kw of result) {
      expect(kw).toMatch(/^[a-z0-9 ]+$/);
    }
  });

  it('returns empty array for "send photo" pattern', () => {
    const result = extractKeywords('send photo');
    expect(result).toEqual([]);
  });

  it('deduplicates keywords', () => {
    const result = extractKeywords('red red red bikini bikini');
    const counts = new Map<string, number>();
    for (const kw of result) {
      counts.set(kw, (counts.get(kw) ?? 0) + 1);
    }
    for (const [, count] of counts) {
      expect(count).toBe(1);
    }
  });

  it('sorts alphabetically', () => {
    const result = extractKeywords('zebra apple mango');
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });

  it('handles empty input', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords('   ')).toEqual([]);
  });

  it('removes standalone numbers', () => {
    const result = extractKeywords('girl 25 years old');
    expect(result).not.toContain('25');
  });
});
