import { describe, it, expect } from 'vitest';

// getInitials is private in Avatar.tsx, replicate for testing
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

describe('getInitials', () => {
  it('single name → single initial', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('two names → first + last initial', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('three names → first + last initial', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
  });

  it('lowercase → uppercased', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });

  it('handles extra whitespace', () => {
    expect(getInitials('  Alice   Bob  ')).toBe('AB');
  });

  it('single character name', () => {
    expect(getInitials('A')).toBe('A');
  });
});
