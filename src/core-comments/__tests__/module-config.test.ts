import { describe, expect, it } from 'vitest';

import config from '../module.config';

// Smoke test for the module surface that init/sync/remove rely on.
describe('core-comments module config', () => {
  it('declares a consistent module surface', () => {
    expect(config.id).toBe('core-comments');
    expect(Array.isArray(config.routers)).toBe(true);
    expect(Array.isArray(config.schema)).toBe(true);
    expect(Array.isArray(config.projectFiles)).toBe(true);

    // Router imports must point at this module's subtree.
    for (const r of config.routers) {
      expect(r.from.startsWith('@/core-comments/')).toBe(true);
    }

    // projectFiles are src-relative — a leading src/ silently breaks
    // the cleanup in `indigo remove`.
    for (const f of config.projectFiles) {
      expect(f.startsWith('src/')).toBe(false);
    }
  });
});
