/**
 * Memory telemetry: a process-global registry of named counters (cache sizes,
 * socket counts, …) logged with `process.memoryUsage()` every 5 minutes, and
 * an opt-in RSS restart guard.
 *
 * Rule: every long-lived in-memory Map/Set needs BOTH an eviction path (TTL
 * sweep, LRU bound, delete-on-disconnect) AND a `registerMemoryStat()` call,
 * so a leak shows up as a counter that only ever grows — instead of as an OOM
 * kill with no trace of which structure did it.
 *
 * Reading the heartbeat line: RSS climbing while the JS heap stays flat points
 * at native memory (sharp/libvips, zlib, the runtime); the heap climbing with
 * RSS means a JS leak — the counters show which structure. Under Bun read
 * `jscHeapMb`, not `heapUsedMb`: Bun's `process.memoryUsage().heapUsed` sits
 * near 0 regardless of what JavaScriptCore actually holds, so the Node field
 * would always say "native".
 */
import { createLogger } from './logger';

const logger = createLogger('memory');

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

type StatProvider = () => number;

// The custom server (server.ts) and the Next.js server bundle are separate
// module graphs (same reason src/instrumentation.ts exists). A module-level Map
// would exist once per graph, so the heartbeat (started from server.ts) would
// never see providers registered from Next-bundled code. Keep the registry on
// globalThis so all graphs share it.
const REGISTRY_KEY = Symbol.for('indigo.memoryStatProviders');
const STARTED_KEY = Symbol.for('indigo.memoryStatsStarted');

function getRegistry(): Map<string, StatProvider> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, StatProvider>();
  }
  return g[REGISTRY_KEY] as Map<string, StatProvider>;
}

/**
 * Register a named counter (e.g. the size of an in-memory cache) to be
 * included in the periodic memory-stats log line and `/api/health`.
 * Registering the same name again overwrites — safe under dev HMR re-imports.
 */
export function registerMemoryStat(name: string, provider: StatProvider): void {
  getRegistry().set(name, provider);
}

function toMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export interface MemorySnapshot {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
  /** JavaScriptCore heap in use — Bun only (absent under Node). */
  jscHeapMb?: number;
  /** JavaScriptCore heap capacity — Bun only (absent under Node). */
  jscHeapCapacityMb?: number;
  counters: Record<string, number>;
}

// ── JSC heap introspection (Bun only) ───────────────────────────────────────
interface JscHeapStats {
  heapSize: number;
  heapCapacity: number;
}

// undefined = not attempted yet, null = unavailable (Node), fn = loaded
let jscHeapStats: (() => JscHeapStats) | null | undefined;

async function loadJscHeapStats(): Promise<void> {
  if (jscHeapStats !== undefined) return;
  try {
    // Non-literal specifier + webpackIgnore so neither webpack nor Turbopack
    // tries to resolve 'bun:jsc' at build time — it only exists under Bun.
    const specifier = 'bun:jsc';
    const jsc = (await import(/* webpackIgnore: true */ specifier)) as {
      heapStats?: () => JscHeapStats;
    };
    jscHeapStats = typeof jsc.heapStats === 'function' ? jsc.heapStats : null;
  } catch {
    jscHeapStats = null; // not running under Bun — memoryUsage() only
  }
}

// Kick off at import so the first heartbeat and /api/health already carry the
// JSC fields; the module graphs that read snapshots (Next bundle, server.ts)
// each load it once.
void loadJscHeapStats();

/** Current process memory + every registered counter. Safe to call anywhere. */
export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  const counters: Record<string, number> = {};
  for (const [name, provider] of getRegistry()) {
    try {
      counters[name] = provider();
    } catch {
      // A broken provider must never kill the heartbeat
    }
  }
  let jsc: Pick<MemorySnapshot, 'jscHeapMb' | 'jscHeapCapacityMb'> = {};
  if (jscHeapStats) {
    try {
      const hs = jscHeapStats();
      jsc = {
        jscHeapMb: toMb(hs.heapSize),
        jscHeapCapacityMb: toMb(hs.heapCapacity),
      };
    } catch {
      // JSC introspection failure must never kill the heartbeat
    }
  }
  return {
    rssMb: toMb(mem.rss),
    heapUsedMb: toMb(mem.heapUsed),
    heapTotalMb: toMb(mem.heapTotal),
    externalMb: toMb(mem.external),
    arrayBuffersMb: toMb(mem.arrayBuffers ?? 0),
    ...jsc,
    counters,
  };
}

// ── RSS restart guard ────────────────────────────────────────────────────────
// Opt-in (MEMORY_MAX_RSS_MB > 0). A slow native leak walks every replica into
// the container memory cap; replicas deployed in the same instant then OOM in
// lockstep — a full outage. This guard restarts gracefully BEFORE the kernel
// kills the process mid-request: SIGTERM → server.ts drains workers/WS/HTTP →
// exit → the orchestrator's restart policy brings up a fresh process.
//
// The threshold is jittered ±10% per boot so replicas leaking at the same rate
// cross their guards at DIFFERENT times — restarts become rolling by
// construction. Set the base to ~75–80% of the enforced cap (e.g. 1600 for a
// 2g limit) so the guard always fires before the OOM killer.
const MIN_UPTIME_BEFORE_GUARD_MS = 15 * 60 * 1000;
const guardStartedAt = Date.now();
let guardFired = false;
let effectiveMaxRssMb = 0;

function initRestartGuard(): void {
  const base = Number(process.env.MEMORY_MAX_RSS_MB || 0);
  if (!Number.isFinite(base) || base <= 0) return;
  if (process.platform === 'win32') {
    // Windows has no signal delivery: process.kill would hard-kill instead of
    // routing through the graceful shutdown. Log-only there.
    logger.warn(
      'MEMORY_MAX_RSS_MB set but the restart guard is unsupported on Windows'
    );
    return;
  }
  const jitter = 0.9 + Math.random() * 0.2;
  effectiveMaxRssMb = Math.round(base * jitter);
  logger.info('Memory restart guard armed', {
    baseMb: base,
    effectiveMb: effectiveMaxRssMb,
  });
}

function checkRestartGuard(rssMb: number): void {
  if (effectiveMaxRssMb <= 0 || guardFired) return;
  if (rssMb < effectiveMaxRssMb) return;
  // Never fire during boot warmup — a threshold misconfigured below the
  // baseline RSS must not produce a restart loop.
  if (Date.now() - guardStartedAt < MIN_UPTIME_BEFORE_GUARD_MS) {
    logger.error(
      'Memory guard threshold exceeded during warmup - NOT restarting',
      {
        rssMb,
        effectiveMaxRssMb,
      }
    );
    return;
  }
  guardFired = true;
  logger.error('Memory limit guard: RSS over threshold, graceful restart', {
    rssMb,
    effectiveMaxRssMb,
    uptimeMinutes: Math.round((Date.now() - guardStartedAt) / 60000),
  });
  // SIGTERM routes through server.ts's graceful shutdown
  process.kill(process.pid, 'SIGTERM');
}

function logMemoryStats(): void {
  const { counters, ...sample } = getMemorySnapshot();
  logger.info('Memory stats', { ...sample, ...counters });
  checkRestartGuard(sample.rssMb);
}

/**
 * Log process memory + all registered counters every 5 minutes (12 lines/hour
 * at info — negligible ingest; production logs are JSON so each field charts
 * directly). Idempotent across module graphs. Call once from server.ts.
 */
export function startMemoryStatsHeartbeat(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[STARTED_KEY]) return;
  g[STARTED_KEY] = true;

  initRestartGuard();
  const timer = setInterval(logMemoryStats, HEARTBEAT_INTERVAL_MS);
  // Not present in edge-like runtimes; only Node/Bun timers support it
  if (typeof timer.unref === 'function') timer.unref();
  logMemoryStats(); // baseline right after boot
}
