import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';

/**
 * Custom Next.js Server with BullMQ Support
 *
 * SERVER_ROLE controls which subsystems are initialized:
 *   "all"      (default) — Next.js + tRPC + BullMQ
 *   "frontend" — Next.js pages only (no BullMQ)
 *   "api"      — Next.js + tRPC (no BullMQ)
 *   "worker"   — BullMQ only (no Next.js)
 */

type ServerRole = 'all' | 'frontend' | 'api' | 'worker';
const VALID_ROLES: ServerRole[] = ['all', 'frontend', 'api', 'worker'];

const role = (process.env.SERVER_ROLE || 'all') as ServerRole;
if (!VALID_ROLES.includes(role)) {
  console.error(
    `Invalid SERVER_ROLE="${role}". Must be one of: ${VALID_ROLES.join(', ')}`
  );
  process.exit(1);
}

const enableNextjs = role !== 'worker';
const enableWorkers = role === 'all' || role === 'worker';
const enableWs = (role === 'all' || role === 'api') && process.env.WS_ENABLED !== 'false';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

async function main() {
  let handle:
    | ((
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse,
        parsedUrl?: import('url').UrlWithParsedQuery
      ) => Promise<void>)
    | null = null;

  if (enableNextjs) {
    const app = next({ dev, hostname, port, turbopack: dev });
    handle = app.getRequestHandler();
    await app.prepare();
  }

  const server = createServer(async (req, res) => {
    try {
      if (handle) {
        const parsedUrl = parse(req.url || '', true);
        await handle(req, res, parsedUrl);
      } else {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Worker-only mode — no HTTP endpoints.');
      }
    } catch (err) {
      console.error('Error handling request:', err);
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
    await syncContentFiles(syncDb, { contentTypes: CONTENT_TYPES, locales: LOCALES });
  } catch (err) {
    console.error('Content sync failed:', err);
  }

  // Preload content variables cache + set up cross-instance invalidation via Redis
  const { preloadContentVars, initContentVarsSync } = await import('./src/core/lib/content/vars');
  await preloadContentVars();
  await initContentVarsSync();

  // Set up CMS link cache cross-instance invalidation via Redis
  const { initCmsLinkSync } = await import('./src/core/lib/content/cms-link');
  await initCmsLinkSync();

  // Register webhook delivery logger
  const { setWebhookDeliveryLogger } = await import('./src/core/lib/webhooks/webhooks');
  const { logWebhookDelivery } = await import('./src/core/lib/webhooks/delivery-log');
  const { db: appDb } = await import('./src/server/db');
  const { cmsWebhookDeliveries } = await import('./src/server/db/schema/webhook-deliveries');
  setWebhookDeliveryLogger((entry) => {
    logWebhookDelivery(appDb, cmsWebhookDeliveries, entry);
  });

  // Initialize BullMQ workers + cron jobs
  if (enableWorkers) {
    await import('./src/config/deps/email-deps');
    const { startEmailWorker } = await import('./src/core/lib/email');
    await import('./src/server/jobs/content/index'); // registers scheduled publish targets
    const { startContentPublishWorker } = await import('./src/core/lib/content/scheduled-publish');
    const { startWebhookWorker } = await import('./src/core/lib/webhooks/webhooks');
    const { startModuleWorkers } = await import('./src/generated/module-server');
    const { startMediaWorker } = await import('./src/server/jobs/media/index');
    startEmailWorker();
    startContentPublishWorker();
    startWebhookWorker();
    await startModuleWorkers();
    startMediaWorker();
    console.log('BullMQ workers ready (email + content + webhook + module + media workers started)');

    // Register maintenance tasks (side-effect import)
    await import('./src/server/jobs/maintenance/index');

    // Register cron jobs
    const { registerCronJob, startCronScheduler } = await import('./src/core/lib/infra/cron');
    const { runAllMaintenanceTasks } = await import('./src/core/lib/infra/maintenance');

    registerCronJob({
      name: 'maintenance',
      pattern: '0 3 * * *',
      handler: runAllMaintenanceTasks,
    });

    registerCronJob({
      name: 'dunning',
      pattern: '0 8 * * *',
      handler: async () => {
        const { runDunningChecks } = await import('./src/core-subscriptions/lib/dunning');
        await runDunningChecks();
      },
    });

    await startCronScheduler();
    console.log('Cron scheduler ready (maintenance at 3 AM, dunning at 8 AM)');

    // Recover stale DB queue tasks on startup
    try {
      const { recoverStaleTasks } = await import('./src/core/lib/infra/db-queue');
      const recovered = await recoverStaleTasks();
      if (recovered > 0) console.log(`Recovered ${recovered} stale DB queue tasks`);
    } catch {
      // DB queue table may not exist yet
    }
  }

  // Initialize WebSocket server
  if (enableWs) {
    const { initWebSocketServer } = await import('./src/server/lib/ws');
    initWebSocketServer(server);
    console.log('WebSocket server ready');
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down gracefully...');

    // Shutdown WebSocket
    if (enableWs) {
      try {
        const { shutdownWebSocket } = await import('./src/server/lib/ws');
        shutdownWebSocket();
      } catch {
        // Ignore
      }
    }

    const { shutdownAllWorkers } = await import('./src/core/lib/infra/queue');
    await shutdownAllWorkers();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
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

    console.log(`
  Server Ready
  URL: http://${hostname}:${port}
  Role: ${role}
  Features: ${features}
  Environment: ${dev ? 'Development' : 'Production'}
    `);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
