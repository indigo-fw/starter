import type IORedis from 'ioredis';
import type { RedisOptions } from 'ioredis';

let mainConnection: IORedis | null = null;
let subscriberConnection: IORedis | null = null;
let publisherConnection: IORedis | null = null;
let requestConnection: IORedis | null = null;

function createConnection(overrides?: RedisOptions): IORedis | null {
  if (!process.env.REDIS_URL) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Mod = require('ioredis') as new (url: string, opts: RedisOptions) => IORedis;
  return new Mod(process.env.REDIS_URL, {
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    ...overrides,
  });
}

/**
 * Shared Redis connection for BullMQ queues and workers.
 *
 * Uses `maxRetriesPerRequest: null` with the default offline queue — required
 * by BullMQ. NOTE: because commands buffer forever when Redis is down, this
 * connection must NOT be used on the request path or startup probe — use
 * `getRequestRedis()` there so those callers fail fast instead of hanging.
 */
export function getRedis(): IORedis | null {
  if (!mainConnection) mainConnection = createConnection();
  return mainConnection;
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
 *
 * Callers must handle rejections (all current callers fail open via try/catch).
 */
export function getRequestRedis(): IORedis | null {
  if (!requestConnection) {
    requestConnection = createConnection({
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
    });
  }
  return requestConnection;
}

/** Dedicated Redis connection for pub/sub subscriber (ioredis pub/sub connections are exclusive) */
export function getSubscriber(): IORedis | null {
  if (!subscriberConnection) subscriberConnection = createConnection();
  return subscriberConnection;
}

/** Dedicated Redis connection for pub/sub publisher (ioredis pub/sub connections are exclusive) */
export function getPublisher(): IORedis | null {
  if (!publisherConnection) publisherConnection = createConnection();
  return publisherConnection;
}

/** Disconnect all Redis connections gracefully */
export async function disconnectAll(): Promise<void> {
  const conns = [
    mainConnection,
    subscriberConnection,
    publisherConnection,
    requestConnection,
  ];
  for (const conn of conns) {
    if (conn) conn.disconnect();
  }
  mainConnection = null;
  subscriberConnection = null;
  publisherConnection = null;
  requestConnection = null;
}
