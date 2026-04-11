import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock logger before importing
vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Fresh module per test to reset the tasks array
let registerMaintenanceTask: typeof import('../infra/maintenance').registerMaintenanceTask;
let runAllMaintenanceTasks: typeof import('../infra/maintenance').runAllMaintenanceTasks;

describe('maintenance registry', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../infra/maintenance');
    registerMaintenanceTask = mod.registerMaintenanceTask;
    runAllMaintenanceTasks = mod.runAllMaintenanceTasks;
  });

  it('runs registered tasks in order', async () => {
    const order: string[] = [];

    registerMaintenanceTask('a', async () => { order.push('a'); });
    registerMaintenanceTask('b', async () => { order.push('b'); });
    registerMaintenanceTask('c', async () => { order.push('c'); });

    await runAllMaintenanceTasks();

    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('isolates errors — one failure does not block others', async () => {
    const order: string[] = [];

    registerMaintenanceTask('ok-1', async () => { order.push('ok-1'); });
    registerMaintenanceTask('fail', async () => { throw new Error('boom'); });
    registerMaintenanceTask('ok-2', async () => { order.push('ok-2'); });

    await runAllMaintenanceTasks();

    expect(order).toEqual(['ok-1', 'ok-2']);
  });

  it('handles zero registered tasks gracefully', async () => {
    await expect(runAllMaintenanceTasks()).resolves.not.toThrow();
  });
});
