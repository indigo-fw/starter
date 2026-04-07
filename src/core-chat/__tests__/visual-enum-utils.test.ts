import { describe, it, expect } from 'vitest';
import { resolvePromptById, resolveNamedPrompt, buildIdMap } from '../lib/visual-enum-utils';
import { VISUAL_GENDER, VISUAL_QUALITY } from '../lib/visual-enums';

describe('resolvePromptById', () => {
  it('finds entry by ID', () => {
    const result = resolvePromptById(VISUAL_GENDER, 1);
    expect(result).toBeTruthy();
    expect(result).toContain('1girl');
  });

  it('returns null for unknown ID', () => {
    expect(resolvePromptById(VISUAL_GENDER, 999)).toBeNull();
  });
});

describe('resolveNamedPrompt', () => {
  it('finds entry by name', () => {
    const result = resolveNamedPrompt(VISUAL_QUALITY, 'DEFAULT');
    expect(result).toBeDefined();
  });

  it('returns null for unknown name', () => {
    expect(resolveNamedPrompt(VISUAL_QUALITY, 'NONEXISTENT')).toBeNull();
  });
});

describe('buildIdMap', () => {
  it('creates a map from enum entries', () => {
    const map = buildIdMap(VISUAL_GENDER);
    expect(map.size).toBeGreaterThan(0);
    expect(map.get(1)).toBeDefined();
    expect(map.get(1)!.id).toBe(1);
  });
});
