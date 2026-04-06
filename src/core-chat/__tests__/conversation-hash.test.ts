import { describe, it, expect } from 'vitest';
import { generateConversationHash } from '../lib/conversation-hash';

describe('generateConversationHash', () => {
  it('produces consistent hash for same inputs', () => {
    const a = generateConversationHash('char-1', { genderId: 1, personalityId: 5 });
    const b = generateConversationHash('char-1', { genderId: 1, personalityId: 5 });
    expect(a).toBe(b);
  });

  it('produces different hash for different characters', () => {
    const a = generateConversationHash('char-1');
    const b = generateConversationHash('char-2');
    expect(a).not.toBe(b);
  });

  it('is order-independent for traits', () => {
    const a = generateConversationHash('char-1', { genderId: 1, personalityId: 5 });
    const b = generateConversationHash('char-1', { personalityId: 5, genderId: 1 });
    expect(a).toBe(b);
  });

  it('ignores null/undefined traits', () => {
    const a = generateConversationHash('char-1', { genderId: 1 });
    const b = generateConversationHash('char-1', { genderId: 1, personalityId: null });
    // null is excluded, so both should only have genderId
    expect(a).toBe(b);
  });

  it('returns 32-char hex string (MD5)', () => {
    const hash = generateConversationHash('char-1');
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});
