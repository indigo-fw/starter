import { describe, it, expect } from 'vitest';
import { splitSentences } from '../lib/voice/sentence-splitter';

describe('splitSentences', () => {
  it('splits on sentence boundaries', () => {
    const { sentences, remainder } = splitSentences('Hello there. How are you? I am fine!');
    expect(sentences).toEqual(['Hello there.', 'How are you?', 'I am fine!']);
    expect(remainder).toBe('');
  });

  it('returns remainder for incomplete sentence', () => {
    const { sentences, remainder } = splitSentences('Hello there. I am still');
    expect(sentences).toEqual(['Hello there.']);
    expect(remainder).toBe('I am still');
  });

  it('handles single sentence', () => {
    const { sentences, remainder } = splitSentences('Just one sentence.');
    expect(sentences).toEqual(['Just one sentence.']);
    expect(remainder).toBe('');
  });

  it('handles no sentences (just fragment)', () => {
    const { sentences, remainder } = splitSentences('incomplete');
    expect(sentences).toEqual([]);
    expect(remainder).toBe('incomplete');
  });

  it('handles empty input', () => {
    const { sentences, remainder } = splitSentences('');
    expect(sentences).toEqual([]);
    expect(remainder).toBe('');
  });
});
