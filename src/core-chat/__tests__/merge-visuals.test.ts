import { describe, it, expect } from 'vitest';
import { mergeVisuals } from '../lib/image/presets/merge-visuals';

describe('mergeVisuals', () => {
  it('returns base unchanged when no overrides', () => {
    const base = {
      VISUAL_GENDER: {
        WOMAN: { id: 1, prompt: 'realistic woman' },
        MAN: { id: 2, prompt: 'realistic man' },
      },
    };
    const result = mergeVisuals(base, {});
    expect(result.VISUAL_GENDER.WOMAN.prompt).toBe('realistic woman');
    expect(result.VISUAL_GENDER.MAN.prompt).toBe('realistic man');
  });

  it('overrides specific entry fields', () => {
    const base = {
      VISUAL_GENDER: {
        WOMAN: { id: 1, prompt: 'realistic woman', tags: ['woman'] },
        MAN: { id: 2, prompt: 'realistic man', tags: ['man'] },
      },
    };
    const overrides = {
      VISUAL_GENDER: {
        WOMAN: { prompt: 'anime girl' },
      },
    };
    const result = mergeVisuals(base, overrides);
    // Overridden
    expect(result.VISUAL_GENDER.WOMAN.prompt).toBe('anime girl');
    // Preserved from base
    expect(result.VISUAL_GENDER.WOMAN.id).toBe(1);
    expect(result.VISUAL_GENDER.WOMAN.tags).toEqual(['woman']);
    // Untouched
    expect(result.VISUAL_GENDER.MAN.prompt).toBe('realistic man');
  });

  it('adds new entries', () => {
    const base = {
      VISUAL_OUTFIT: {
        DRESS: { id: 1, prompt: 'dress' },
      },
    };
    const overrides = {
      VISUAL_OUTFIT: {
        KIMONO: { id: 999, prompt: 'kimono' },
      },
    };
    const result = mergeVisuals(base, overrides);
    expect(result.VISUAL_OUTFIT.DRESS.prompt).toBe('dress');
    expect(result.VISUAL_OUTFIT.KIMONO.prompt).toBe('kimono');
  });

  it('adds new categories', () => {
    const base = { VISUAL_GENDER: { WOMAN: { id: 1 } } };
    const overrides = { VISUAL_CUSTOM: { FOO: { id: 100, prompt: 'foo' } } };
    const result = mergeVisuals(base, overrides);
    expect(result.VISUAL_CUSTOM.FOO.prompt).toBe('foo');
    expect(result.VISUAL_GENDER.WOMAN.id).toBe(1);
  });

  it('does not mutate base', () => {
    const base = { VISUAL_GENDER: { WOMAN: { id: 1, prompt: 'old' } } };
    const overrides = { VISUAL_GENDER: { WOMAN: { prompt: 'new' } } };
    mergeVisuals(base, overrides);
    expect(base.VISUAL_GENDER.WOMAN.prompt).toBe('old');
  });
});
