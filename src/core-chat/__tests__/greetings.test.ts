import { describe, it, expect } from 'vitest';
import { getGreeting } from '../lib/ai/greetings';

describe('getGreeting', () => {
  it('returns custom greeting when provided', () => {
    const result = getGreeting(1, 'Alice', 'Hello %%%username%%%!');
    expect(result).toBe('Hello Alice!');
  });

  it('replaces %%%username%%% with "friend" when no name', () => {
    const result = getGreeting(1, null, 'Hello %%%username%%%!');
    expect(result).toBe('Hello friend!');
  });

  it('returns a greeting for each personality ID', () => {
    for (let id = 1; id <= 13; id++) {
      const result = getGreeting(id);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(5);
    }
  });

  it('falls back to personality 6 for unknown ID', () => {
    const result = getGreeting(999);
    expect(result).toBeTruthy();
  });

  it('excludes personalized greetings when no name', () => {
    // Run many times to verify no %%%username%%% leaks through
    for (let i = 0; i < 50; i++) {
      const result = getGreeting(1, null);
      expect(result).not.toContain('%%%username%%%');
    }
  });

  it('includes personalized greetings when name provided', () => {
    // Run many times — at least some should contain the name
    let hasName = false;
    for (let i = 0; i < 50; i++) {
      const result = getGreeting(1, 'TestUser');
      if (result.includes('TestUser')) hasName = true;
    }
    expect(hasName).toBe(true);
  });
});
