import { createLogger } from './src/core/lib/infra/logger';
import { startMemoryStatsHeartbeat } from './src/core/lib/infra/memory-stats';
import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';

/**
 * Custom Next.js Server with BullMQ + WebSocket Support
 *
 * SERVER_ROLE controls which subsystems are initialized:
 *   "all"      (default) — Next.js + tRPC + BullMQ + WebSocket
 *   "frontend" — Next.js pages only (no BullMQ, no WebSocket)
 *   "api"      — Next.js + tRPC + WebSocket (no BullMQ)
 *   "worker"   — BullMQ only (no Next.js; still answers /api/health for probes)
 *
 * Process-level invariants live here, not in modules:
 *   - Crash backstops: an unhandled rejection is logged and survived; an
 *     uncaught exception is logged and the process exits 1 so the orchestrator
 *     restarts a CLEAN process instead of serving from undefined state.
 *   - Shutdown is idempotent and time-boxed (SHUTDOWN_TIMEOUT_MS): platforms
 *     SIGKILL ~30s after SIGTERM, so a hung drain must never outlive that.
 *   - The memory heartbeat starts first so a boot-time leak is visible.
 */

process.stdout.setMaxListeners(20);
process.stderr.setMaxListeners(20);

// Boot/lifecycle goes through the shared logger so it honours LOG_LEVEL like
// the rest of the app: `info` for lifecycle, `warn` for degraded-but-serving,
// `error` for needs-a-human.
const logger = createLogger('server');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.stack : String(reason),
  });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception - exiting for clean restart', {
    error: err instanceof Error ? err.stack : String(err),
  });
  process.exit(1);
});

type ServerRole = 'all' | 'frontend' | 'api' | 'worker';
const VALID_ROLES: ServerRole[] = ['all', 'frontend', 'api', 'worker'];

const role = (process.env.SERVER_ROLE || 'all') as ServerRole;
if (!VALID_ROLES.includes(role)) {
  logger.error(
    `Invalid SERVER_ROLE="${role}". Must be one of: ${VALID_ROLES.join(', ')}`
  );
  process.exit(1);
}

const enableNextjs = role !== 'worker';
const enableWorkers = role === 'all' || role === 'worker';
const enableWs =
  (role === 'all' || role === 'api') && process.env.WS_ENABLED !== 'false';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Platforms SIGKILL ~30s after SIGTERM; force-exit before that if a graceful
// drain hangs (streaming tRPC responses, long jobs, keep-alive sockets).
const SHUTDOWN_TIMEOUT_MS = 25_000;

async function main() {
  startMemoryStatsHeartbeat();

  let handle:
    | ((
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse,
        parsedUrl?: import('url').UrlWithParsedQuery
      ) => Promise<void>)
    | null = null;

  if (enableNextjs) {
    const app = next({
      dev,
      hostname,
      port,
      turbopack: dev,
      dir: import.meta.dirname,
    });
    handle = app.getRequestHandler();
    await app.prepare();
  }

  const server = createServer(async (req, res) => {
    try {
      if (handle) {
        const parsedUrl = parse(req.url || '', true);
        await handle(req, res, parsedUrl);
      } else {
        // Worker-only mode: no Next.js, so the /api/health route doesn't exist.
        // Answer the container healthcheck path here so a worker instance isn't
        // perpetually "unhealthy"; everything else is 503.
        const pathname = (req.url || '').split('?')[0];
        if (pathname === '/api/health') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'healthy', role }));
        } else {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Worker-only mode — no HTTP endpoints.');
        }
      }
    } catch (err) {
      logger.error('Error handling request', {
        url: req.url,
        error: err instanceof Error ? err.stack : String(err),
      });
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // Register side-effect dependencies
  await import('./src/config/email-list');
  // Module deps + registrations (generated from indigo.config.ts)
  const { initModuleDeps } = await import('./src/generated/module-server');
  await initModuleDeps();

  // Sync .md content files to CMS (completes before server listens)
  try {
    const { syncContentFiles } = await import('./src/core/lib/content/sync');
    const { db: syncDb } = await import('./src/server/db');
    const { CONTENT_TYPES } = await import('./src/config/cms');
    const { LOCALES } = await import('./src/lib/constants');
    await syncContentFiles(syncDb, {
      contentTypes: CONTENT_TYPES,
      locales: LOCALES,
    });
    // Upload co-located content/ images referenced via cms://asset/ to storage.
    const { syncContentImages } =
      await import('./src/core/lib/content/image-sync');
    await syncContentImages(syncDb);
  } catch (err) {
    logger.error('Content sync failed', {
      error: err instanceof Error ? err.stack : String(err),
    });
  }

  // CMS link sync + content vars init live in `src/instrumentation.ts` instead
  // of here. Reason: when called from this Bun entry, they initialize module
  // instances that are SEPARATE from the ones Next.js bundles for SSR/routers,
  // so cross-instance Redis cache invalidation never reaches the right cache.
  // `instrumentation.ts` runs in the Next.js server context where the routers'
  // `broadcastCmsLinkInvalidation` and the resolver's `_cache` actually live.
  // Bonus: avoids the `'server-only'` runtime throw on Bun-direct loads of
  // `cms-link.ts` (the package's index.js throws outside the `react-server`
  // export condition that webpack sets for Next.js server bundles).

  // Register webhook delivery logger
  const { setWebhookDeliveryLogger } =
    await import('./src/core/lib/webhooks/webhooks');
  const { logWebhookDelivery } =
    await import('./src/core/lib/webhooks/delivery-log');
  const { db: appDb } = await import('./src/server/db');
  const { cmsWebhookDeliveries } =
    await import('./src/server/db/schema/webhook-deliveries');
  setWebhookDeliveryLogger((entry) => {
    logWebhookDelivery(appDb, cmsWebhookDeliveries, entry);
  });

  // Initialize BullMQ workers + cron jobs
  if (enableWorkers) {
    await import('./src/config/deps/email-deps');
    const { startEmailWorker } = await import('./src/core/lib/email');
    await import('./src/server/jobs/content/index'); // registers scheduled publish targets
    const { startContentPublishWorker } =
      await import('./src/core/lib/content/scheduled-publish');
    const { startWebhookWorker } =
      await import('./src/core/lib/webhooks/webhooks');
    const { startModuleWorkers } =
      await import('./src/generated/module-server');
    const { startMediaWorker } = await import('./src/server/jobs/media/index');
    const { startEmailListWorker } = await import('./src/core/lib/email-list');
    startEmailWorker();
    startEmailListWorker();
    startContentPublishWorker();
    startWebhookWorker();
    await startModuleWorkers();
    startMediaWorker();
    logger.info(
      'BullMQ workers ready (email + email-list + content + webhook + module + media workers started)'
    );

    // Register maintenance tasks (side-effect import)
    await import('./src/server/jobs/maintenance/index');

    // Register cron jobs
    const { registerCronJob, startCronScheduler } =
      await import('./src/core/lib/infra/cron');
    const { runAllMaintenanceTasks } =
      await import('./src/core/lib/infra/maintenance');

    registerCronJob({
      name: 'maintenance',
      pattern: '0 3 * * *',
      handler: runAllMaintenanceTasks,
    });

    // Hourly, not daily: dunning sends inside each org's LOCAL 09–20 window
    // (core-subscriptions/lib/dunning.ts), so a once-a-day run would only reach
    // zones where that hour happens to be in-window. Every check is idempotent
    // (audit-log dedupe + state transitions), so extra runs are cheap no-ops.
    registerCronJob({
      name: 'dunning',
      pattern: '0 * * * *',
      handler: async () => {
        const { runDunningChecks } =
          await import('./src/core-subscriptions/lib/dunning');
        await runDunningChecks();
      },
    });

    // Monthly subscription token grants (no-op unless a plan sets monthlyTokens).
    // Daily sweep: catches yearly-interval anniversaries and missed webhooks.
    registerCronJob({
      name: 'token-grants',
      pattern: '0 1 * * *',
      handler: async () => {
        const { runTokenGrantChecks } =
          await import('./src/core-subscriptions/lib/token-grants');
        await runTokenGrantChecks();
      },
    });

    await startCronScheduler();
    logger.info(
      'Cron scheduler ready (maintenance at 3 AM, dunning hourly, token grants at 1 AM)'
    );

    // Recover stale DB queue tasks on startup
    try {
      const { recoverStaleTasks } =
        await import('./src/core/lib/infra/db-queue');
      const recovered = await recoverStaleTasks();
      if (recovered > 0)
        logger.info(`Recovered ${recovered} stale DB queue tasks`);
    } catch {
      // DB queue table may not exist yet
    }
  }

  // Initialize WebSocket server
  if (enableWs) {
    try {
      const { initWebSocketServer } = await import('./src/server/lib/ws');
      initWebSocketServer(server);
      logger.info('WebSocket server ready');
    } catch (err) {
      logger.error('Failed to initialize WebSocket server', {
        error: err instanceof Error ? err.stack : String(err),
      });
      logger.warn('Running without WebSocket support');
    }
  }

  // Graceful shutdown — idempotent (duplicate SIGTERM/SIGINT are ignored) and
  // time-boxed. Drain order: stop taking jobs → drop sockets → stop the HTTP
  // listener (which waits for in-flight requests to finish).
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down gracefully...');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out - forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      if (enableWorkers) {
        const { shutdownAllWorkers } =
          await import('./src/core/lib/infra/queue');
        await shutdownAllWorkers();
      }
      if (enableWs) {
        const { shutdownWebSocket } = await import('./src/server/lib/ws');
        shutdownWebSocket();
      }
      // Keep-alive connections would otherwise hold server.close() open until
      // the client hangs up; idle ones are safe to drop immediately.
      server.closeIdleConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      logger.info('Server closed');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown', {
        error: err instanceof Error ? err.stack : String(err),
      });
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    const features = [
      enableNextjs ? 'Next.js' : null,
      enableWorkers ? 'BullMQ' : null,
      enableWs ? 'WebSocket' : null,
    ]
      .filter(Boolean)
      .join(' + ');

    if (dev) {
      // Banner is dev decoration — a multi-line block inside a JSON log line is
      // unreadable, so production gets the structured one-liner instead.
      console.log(`
  Server Ready
  URL: http://${hostname}:${port}
  Role: ${role}
  Features: ${features}
  Environment: Development
    `);
    } else {
      // Also the restart marker: an OOM kill is a SIGKILL, so the process logs
      // nothing on the way out and this line is the only trace it went down.
      logger.info('Server ready', {
        url: `http://${hostname}:${port}`,
        role,
        features,
      });
    }
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

main().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.stack : String(err),
  });
  process.exit(1);
});
