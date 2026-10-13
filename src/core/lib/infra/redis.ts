import { createLogger } from './logger';
import type IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

const logger = createLogger('redis');

let mainConnection: IORedis | null = null;
let subscriberConnection: IORedis | null = null;
let publisherConnection: IORedis | null = null;
let requestConnection: IORedis | null = null;
let producerConnection: IORedis | null = null;

type ConnectionRole =
  'main' | 'subscriber' | 'publisher' | 'request' | 'producer';

/**
 * How long `disconnectAll()` waits for a graceful QUIT before cutting the
 * socket. The BullMQ-profile connections buffer commands forever while Redis
 * is down, so an unbounded `quit()` would stall shutdown until server.ts's
 * 25 s force-exit fires.
 */
const QUIT_TIMEOUT_MS = 1000;

function createConnection(
  role: ConnectionRole,
  overrides?: RedisOptions
): IORedis | null {
  if (!process.env.REDIS_URL) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Mod = require('ioredis') as new (
    url: string,
    opts: RedisOptions
  ) => IORedis;
  const conn = new Mod(process.env.REDIS_URL, {
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    ...overrides,
  });

  // ioredis emits 'error' on every failed reconnect (~2 s apart during an
  // outage). Without a listener it falls back to a raw console.error
  // ("[ioredis] Unhandled error event") that bypasses LOG_LEVEL, the JSON
  // format and log monitoring. Log once per outage; 'ready' re-arms it.
  let outageLogged = false;
  conn.on('error', (err: Error) => {
    if (outageLogged) return;
    outageLogged = true;
    logger.warn('Redis connection error', { role, error: err.message });
  });
  conn.on('ready', () => {
    if (outageLogged) logger.info('Redis connection recovered', { role });
    outageLogged = false;
  });

  return conn;
}

/**
 * Shared Redis connection for BullMQ workers (and other long-lived consumers).
 *
 * Uses `maxRetriesPerRequest: null` with the default offline queue — required
 * by BullMQ for the blocking commands a Worker issues. NOTE: because commands
 * buffer forever when Redis is down, this connection must NOT be used on the
 * request path or startup probe — use `getRequestRedis()` there, and
 * `getProducerRedis()` for `Queue` instances, so those callers fail in
 * bounded time instead of hanging.
 */
export function getRedis(): IORedis | null {
  if (!mainConnection) mainConnection = createConnection('main');
  return mainConnection;
}

/**
 * Redis connection for BullMQ `Queue` instances (job producers).
 *
 * Producers run on the request path (signup email, webhook dispatch), so a
 * `queue.add()` must not buffer forever like the worker profile does. The
 * offline queue stays ON so a job added during the initial connect at boot
 * still goes through; `maxRetriesPerRequest: 3` bounds how long a command
 * waits across reconnect attempts before it rejects. Callers see a rejection
 * they can handle instead of a hung request.
 */
export function getProducerRedis(): IORedis | null {
  if (!producerConnection) {
    producerConnection = createConnection('producer', {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });
  }
  return producerConnection;
}

/**
 * Fail-fast Redis connection for request-path and startup-probe use
 * (rate limiting, cron reachability probe, health checks).
 *
 * Unlike `getRedis()` (BullMQ profile), this connection fails open instead of
 * hanging when Redis is unreachable:
 * - `maxRetriesPerRequest: 1` — a command errors quickly rather than retrying forever
 * - `enableOfflineQueue: false` — commands issued while disconnected reject
 *   immediately instead of buffering
 * - `connectTimeout: 2000` — bounds the initial connect attempt
 * - `commandTimeout: 500` — a connected-but-stalled Redis (swap, failover
 *   pause) rejects instead of holding every tRPC call open
 *
 * Callers must handle rejections (all current callers fail open via try/catch).
 */
export function getRequestRedis(): IORedis | null {
  if (!requestConnection) {
    requestConnection = createConnection('request', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 500,
    });
  }
  return requestConnection;
}

/** Dedicated Redis connection for pub/sub subscriber (ioredis pub/sub connections are exclusive) */
export function getSubscriber(): IORedis | null {
  if (!subscriberConnection)
    subscriberConnection = createConnection('subscriber');
  return subscriberConnection;
}

/** Dedicated Redis connection for pub/sub publisher (ioredis pub/sub connections are exclusive) */
export function getPublisher(): IORedis | null {
  if (!publisherConnection) publisherConnection = createConnection('publisher');
  return publisherConnection;
}

/**
 * QUIT lets Redis flush replies for in-flight commands; a hard `disconnect()`
 * drops them. But QUIT can't complete while Redis is unreachable (offline
 * queue), so it is time-boxed and the socket is cut regardless afterwards
 * (`disconnect()` on an already-ended connection is a no-op).
 */
async function closeConnection(conn: IORedis): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, QUIT_TIMEOUT_MS);
  });
  try {
    await Promise.race([conn.quit().then(() => undefined), timeout]);
  } catch {
    // Already closed, or rejected because Redis is down — fall through to cut.
  } finally {
    if (timer) clearTimeout(timer);
    conn.disconnect();
  }
}

/** Disconnect all Redis connections gracefully */
export async function disconnectAll(): Promise<void> {
  const conns = [
    mainConnection,
    subscriberConnection,
    publisherConnection,
    requestConnection,
    producerConnection,
  ];
  mainConnection = null;
  subscriberConnection = null;
  publisherConnection = null;
  requestConnection = null;
  producerConnection = null;
  await Promise.allSettled(
    conns.filter((c): c is IORedis => c !== null).map(closeConnection)
  );
}
