import { describe, it, expect, vi } from 'vitest';

declare module '@/core/lib/module/module-hooks' {
  interface HookMap {
    'test.basic': [value: string];
    'test.multi': [a: number, b: string];
    'test.error': [value: string];
    'test.guard': [value: string];
    'test.guard-seq': [value: string];
    'test.noop': [value: string];
  }
}

import { registerHook, runHook, runGuard } from '../module/module-hooks';

describe('module-hooks', () => {
  describe('registerHook + runHook', () => {
    it('handler receives correct args', async () => {
      const handler = vi.fn();
      registerHook('test.basic', handler);

      await runHook('test.basic', 'hello');

      expect(handler).toHaveBeenCalledWith('hello');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('runHook with multiple handlers', () => {
    it('all handlers run', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      registerHook('test.multi', handler1);
      registerHook('test.multi', handler2);

      await runHook('test.multi', 42, 'world');

      expect(handler1).toHaveBeenCalledWith(42, 'world');
      expect(handler2).toHaveBeenCalledWith(42, 'world');
    });
  });

  describe('runHook error isolation', () => {
    it('handler failure does not prevent other handlers', async () => {
      const failing = vi.fn(async () => { throw new Error('boom'); });
      const passing = vi.fn();
      registerHook('test.error', failing);
      registerHook('test.error', passing);

      await expect(runHook('test.error', 'val')).resolves.toBeUndefined();
      expect(failing).toHaveBeenCalledWith('val');
      expect(passing).toHaveBeenCalledWith('val');
    });
  });

  describe('runGuard', () => {
    it('errors propagate to caller', async () => {
      registerHook('test.guard', () => { throw new Error('blocked'); });

      await expect(runGuard('test.guard', 'val')).rejects.toThrow('blocked');
    });

    it('runs sequentially — second handler sees side-effects of first', async () => {
      const order: number[] = [];
      registerHook('test.guard-seq', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });
      registerHook('test.guard-seq', async () => {
        order.push(2);
      });

      await runGuard('test.guard-seq', 'val');

      expect(order).toEqual([1, 2]);
    });
  });

  describe('runHook with no handlers', () => {
    it('is a no-op (no error)', async () => {
      await expect(runHook('test.noop', 'val')).resolves.toBeUndefined();
    });
  });
});
