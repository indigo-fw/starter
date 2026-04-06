import { describe, it, expect } from 'vitest';
import { moderateByKeywords, moderateContent } from '../lib/moderation';

describe('moderateByKeywords', () => {
  const keywords = ['badword', 'forbidden', 'test phrase'];

  it('passes clean content', () => {
    const result = moderateByKeywords('Hello, this is a normal message', keywords, 'block');
    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
  });

  it('blocks content with matching keywords', () => {
    const result = moderateByKeywords('This contains badword in it', keywords, 'block');
    expect(result.passed).toBe(false);
    expect(result.action).toBe('block');
    expect(result.reason).toContain('badword');
  });

  it('uses word boundaries (no partial matches)', () => {
    const result = moderateByKeywords('This is forbidden territory', keywords, 'block');
    expect(result.passed).toBe(false);

    // Should not match partial words
    const partial = moderateByKeywords('This is unforbidden', keywords, 'block');
    // "unforbidden" contains "forbidden" but with word boundary it should NOT match
    // Actually \b matches at the boundary before 'f' in 'unforbidden'? No — 'unforbidden' has no word boundary before 'forbidden'
    // \bforbidden\b would not match 'unforbidden' because 'u' before 'f' is a word char
    expect(partial.passed).toBe(true);
  });

  it('is case-insensitive', () => {
    const result = moderateByKeywords('BADWORD here', keywords, 'block');
    expect(result.passed).toBe(false);
  });

  it('passes with empty keyword list', () => {
    const result = moderateByKeywords('Anything goes', [], 'block');
    expect(result.passed).toBe(true);
  });

  it('supports flag action', () => {
    const result = moderateByKeywords('This is forbidden', keywords, 'flag');
    expect(result.passed).toBe(false);
    expect(result.action).toBe('flag');
  });
});

describe('moderateContent', () => {
  it('runs keyword check then external', async () => {
    const externalCalled: string[] = [];
    const external = async (content: string) => {
      externalCalled.push(content);
      return null; // passes
    };

    const result = await moderateContent(
      'clean message',
      { keywords: ['dirty'], action: 'block' },
      external,
      'user1',
    );

    expect(result.passed).toBe(true);
    expect(externalCalled).toEqual(['clean message']);
  });

  it('skips external if keywords already blocked', async () => {
    let externalCalled = false;
    const external = async () => {
      externalCalled = true;
      return null;
    };

    const result = await moderateContent(
      'this is dirty content',
      { keywords: ['dirty'], action: 'block' },
      external,
      'user1',
    );

    expect(result.passed).toBe(false);
    expect(externalCalled).toBe(false);
  });
});
