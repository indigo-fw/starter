type LogData = Record<string, unknown>;

interface Logger {
  debug: (msg: string, data?: LogData) => void;
  info: (msg: string, data?: LogData) => void;
  warn: (msg: string, data?: LogData) => void;
  error: (msg: string, data?: LogData) => void;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

// Read process.env directly, not the validated env module — the logger is also
// imported from client code, where the server-only env schema would fail.
// Client bundles see LOG_LEVEL as undefined and use the environment default.
function resolveMinLevel(): number {
  const raw = process.env.LOG_LEVEL;
  if (raw && raw in LOG_LEVELS) {
    return LOG_LEVELS[raw as LogLevel];
  }
  return IS_PRODUCTION ? LOG_LEVELS.info : LOG_LEVELS.debug;
}

const MIN_LEVEL = resolveMinLevel();

function formatLog(
  level: string,
  prefix: string,
  msg: string,
  data?: LogData
): string {
  if (IS_PRODUCTION) {
    return JSON.stringify({
      level,
      msg: prefix ? `[${prefix}] ${msg}` : msg,
      ts: new Date().toISOString(),
      ...data,
    });
  }
  const tag = prefix ? `[${prefix}] ` : '';
  if (data && Object.keys(data).length > 0) {
    return `${tag}${msg} ${JSON.stringify(data)}`;
  }
  return `${tag}${msg}`;
}

/** Forward to monitoring provider if configured (lazy import to avoid circular deps) */
function forwardToMonitoring(
  level: 'error' | 'warn',
  prefix: string,
  msg: string,
  data?: LogData
) {
  // Fire-and-forget: monitoring is a side-effect, callers don't need to await it.
  // Dynamic import() avoids circular dependency and is zero-cost when not configured.
  void import('@/config/monitoring')
    .then(({ getMonitoringProvider }) => {
      const provider = getMonitoringProvider();
      if (!provider) return;
      const fullMsg = prefix ? `[${prefix}] ${msg}` : msg;
      if (level === 'error') {
        provider.captureError(fullMsg, data);
      } else if (provider.captureWarning) {
        provider.captureWarning(fullMsg, data);
      }
    })
    .catch(() => {
      // Silently ignore — monitoring is optional
    });
}

/**
 * Structured logger. `LOG_LEVEL` (debug | info | warn | error) gates output;
 * defaults to debug in dev and info in production — set `warn` in production
 * to cut log ingest to actionable lines only. `error` always logs.
 */
function createLogger(prefix = ''): Logger {
  return {
    debug(msg: string, data?: LogData) {
      if (MIN_LEVEL <= LOG_LEVELS.debug) {
        console.debug(formatLog('debug', prefix, msg, data));
      }
    },
    info(msg: string, data?: LogData) {
      if (MIN_LEVEL <= LOG_LEVELS.info) {
        console.info(formatLog('info', prefix, msg, data));
      }
    },
    warn(msg: string, data?: LogData) {
      if (MIN_LEVEL <= LOG_LEVELS.warn) {
        console.warn(formatLog('warn', prefix, msg, data));
      }
      forwardToMonitoring('warn', prefix, msg, data);
    },
    error(msg: string, data?: LogData) {
      console.error(formatLog('error', prefix, msg, data));
      forwardToMonitoring('error', prefix, msg, data);
    },
  };
}

const logger = createLogger();

/**
 * "This error was already logged, with context the outer handler doesn't have."
 *
 * A job/webhook handler that logs its own failure (ids, payload shape, …) and
 * then rethrows would otherwise be logged a second time by the generic
 * catch-all (BullMQ `failed` listener, route wrapper), so every failure costs
 * two lines saying the same thing. Mark on the way out, check in the
 * catch-all: one event, one line.
 *
 * `Symbol.for` (not a bare Symbol) so the mark survives the module being
 * evaluated in more than one server bundle — the registry is process-global.
 */
const LOGGED = Symbol.for('indigo.error.logged');

/** Mark an error as already logged, then return it for `throw markLogged(e)`. */
function markLogged<T>(err: T): T {
  if (err && typeof err === 'object') {
    (err as Record<symbol, unknown>)[LOGGED] = true;
  }
  return err;
}

/** Whether some inner handler already logged this error with full context. */
function wasLogged(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && (err as Record<symbol, unknown>)[LOGGED]
  );
}

export { createLogger, logger, markLogged, wasLogged };
export type { Logger };
