import { describe, it, expect } from 'vitest';
import { composeSystemPrompt } from '../lib/ai/system-prompt';

describe('composeSystemPrompt', () => {
  const base = {
    characterName: 'Luna',
    systemPrompt: 'You are creative and curious.',
  };

  it('includes character name', () => {
    const result = composeSystemPrompt(base);
    expect(result).toContain('Luna');
  });

  it('includes base system prompt', () => {
    const result = composeSystemPrompt(base);
    expect(result).toContain('You are creative and curious.');
  });

  it('includes gender trait', () => {
    const result = composeSystemPrompt({ ...base, genderId: 1 });
    expect(result).toContain('You are a woman');
  });

  it('includes personality trait', () => {
    const result = composeSystemPrompt({ ...base, personalityId: 1 });
    expect(result).toContain('dominant');
  });

  it('includes job trait', () => {
    const result = composeSystemPrompt({ ...base, jobId: 1 });
    expect(result).toContain('bartender');
  });

  it('includes hobbies', () => {
    const result = composeSystemPrompt({ ...base, hobbies: [1, 2] });
    expect(result).toContain('gaming');
    expect(result).toContain('listening to music');
  });

  it('includes user name when provided', () => {
    const result = composeSystemPrompt({ ...base, userName: 'Alice' });
    expect(result).toContain('Alice');
  });

  it('includes language instruction for non-English', () => {
    const result = composeSystemPrompt({ ...base, lang: 'de' });
    expect(result).toContain('German');
  });

  it('does not include language instruction for English', () => {
    const result = composeSystemPrompt({ ...base, lang: 'en' });
    expect(result).not.toContain('speaks English');
  });

  it('uses voice template when isVoiceCall', () => {
    const result = composeSystemPrompt({ ...base, isVoiceCall: true });
    expect(result).toContain('1-2 sentences');
    expect(result).toContain('spoken aloud');
  });

  it('uses text template by default', () => {
    const result = composeSystemPrompt(base);
    expect(result).toContain('1-4 sentences');
  });

  it('includes current date/time', () => {
    const result = composeSystemPrompt(base);
    // Should contain a formatted date
    expect(result).toMatch(/\d{4}/); // year
  });
});
