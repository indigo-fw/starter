/**
 * Health check handler factory — project provides core checks (DB, Redis),
 * modules contribute via registerHealthCheck() hooks.
 */
import { getRegisteredModules, runHealthChecks } from '../module/module-hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthCheckDef {
  name: string;
  check: () => Promise<void>;
  /**
   * Whether a failure makes the process unhealthy (503 → orchestrator
   * restart / LB eject). Default true. Set false for signals that describe
   * load rather than liveness (memory, queue backlog): they are reported as
   * `degraded` but never gate — otherwise a newsletter burst or a heap spike
   * flips every replica unhealthy at once.
   */
  critical?: boolean;
}

interface CheckResult {
  status: 'ok' | 'error' | 'degraded';
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface HealthHandlerOptions {
  /** Server start timestamp (default: handler creation time). Pass from server.ts for accurate uptime. */
  startedAt?: number;
  /** Extra fields merged into the top-level response (e.g. version, gitCommit, deploymentId). */
  extra?: Record<string, unknown>;
}

/**
 * Create a GET handler for /api/health.
 * Project passes core checks (DB, Redis), modules contribute via hooks.
 */
export function createHealthHandler(
  checks: HealthCheckDef[],
  options?: HealthHandlerOptions
): () => Promise<Response> {
  const startedAt = options?.startedAt ?? Date.now();

  return async function GET(): Promise<Response> {
    const results: Record<string, CheckResult> = {};

    // Run provided checks (DB, Redis, etc.)
    for (const def of checks) {
      const start = Date.now();
      try {
        await def.check();
        results[def.name] = { status: 'ok', latencyMs: Date.now() - start };
      } catch (err) {
        results[def.name] = {
          status: def.critical === false ? 'degraded' : 'error',
          latencyMs: Date.now() - start,
          error: String(err),
        };
      }
    }

    // Run module health checks
    try {
      const moduleResults = await runHealthChecks();
      for (const [name, result] of Object.entries(moduleResults)) {
        results[`module:${name}`] = {
          status: result.status,
          latencyMs: 0,
          details: result.details,
          ...(result.status === 'error'
            ? { error: String(result.details?.error ?? 'unknown') }
            : {}),
        };
      }
    } catch {
      // Module checks failed — non-critical
    }

    // Overall status: only a failed critical core check (DB, Redis) is
    // `unhealthy`. Non-critical core checks and module checks can only
    // degrade — they are visibility, not a liveness verdict.
    const coreStatuses = checks.map((c) => results[c.name]?.status);
    const hasCoreFail = coreStatuses.includes('error');
    const hasDegraded = Object.values(results).some(
      (v) => v.status === 'degraded' || v.status === 'error'
    );

    const overallStatus = hasCoreFail
      ? 'unhealthy'
      : hasDegraded
        ? 'degraded'
        : 'healthy';

    // Strip error details in production
    if (IS_PRODUCTION) {
      for (const check of Object.values(results)) {
        if (check.error) check.error = 'unavailable';
      }
    }

    return Response.json(
      {
        status: overallStatus,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
        modules: getRegisteredModules(),
        checks: results,
        ...options?.extra,
      },
      // `degraded` still answers 200: the Dockerfile HEALTHCHECK and the LB
      // only read the status code, and a degraded replica is still serving.
      { status: overallStatus === 'unhealthy' ? 503 : 200 }
    );
  };
}
