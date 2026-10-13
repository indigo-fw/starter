import { createHealthHandler } from '../api/health';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/lib/module/module-hooks', () => ({
  runHealthChecks: vi.fn().mockResolvedValue({}),
  getRegisteredModules: vi.fn().mockReturnValue([]),
}));

describe('createHealthHandler', () => {
  it('returns 200 when all checks pass', async () => {
    const handler = createHealthHandler([
      { name: 'database', check: async () => {} },
    ]);

    const res = await handler();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 when a core check fails', async () => {
    const handler = createHealthHandler([
      {
        name: 'database',
        check: async () => {
          throw new Error('connection refused');
        },
      },
    ]);

    const res = await handler();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database.status).toBe('error');
  });

  it('includes uptime and timestamp', async () => {
    const handler = createHealthHandler([]);

    const res = await handler();
    const body = await res.json();

    expect(typeof body.uptime).toBe('number');
    expect(body.timestamp).toBeTruthy();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('includes modules list', async () => {
    const handler = createHealthHandler([]);
    const res = await handler();
    const body = await res.json();

    expect(Array.isArray(body.modules)).toBe(true);
  });

  it('runs multiple checks independently', async () => {
    const handler = createHealthHandler([
      { name: 'db', check: async () => {} },
      {
        name: 'redis',
        check: async () => {
          throw new Error('no redis');
        },
      },
      { name: 'storage', check: async () => {} },
    ]);

    const res = await handler();
    const body = await res.json();

    expect(body.checks.db.status).toBe('ok');
    expect(body.checks.redis.status).toBe('error');
    expect(body.checks.storage.status).toBe('ok');
    expect(body.status).toBe('unhealthy');
  });

  it('reports a failed non-critical check as degraded without gating', async () => {
    const handler = createHealthHandler([
      { name: 'database', check: async () => {} },
      {
        name: 'queue',
        critical: false,
        check: async () => {
          throw new Error('backlog: 140 jobs waiting');
        },
      },
    ]);

    const res = await handler();
    const body = await res.json();

    // The LB / Dockerfile HEALTHCHECK only read the status code: a backlog
    // must never eject or restart a replica.
    expect(res.status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.checks.queue.status).toBe('degraded');
    expect(body.checks.queue.error).toContain('backlog');
  });

  it('a critical failure still wins over degraded signals', async () => {
    const handler = createHealthHandler([
      {
        name: 'database',
        check: async () => {
          throw new Error('down');
        },
      },
      {
        name: 'memory',
        critical: false,
        check: async () => {
          throw new Error('high');
        },
      },
    ]);

    const res = await handler();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe('unhealthy');
  });

  it('returns healthy with zero checks', async () => {
    const handler = createHealthHandler([]);
    const res = await handler();
    const body = await res.json();

    expect(body.status).toBe('healthy');
  });
});
