import type IORedis from 'ioredis';

let mainConnection: IORedis | null = null;
let subscriberConnection: IORedis | null = null;
let publisherConnection: IORedis | null = null;

function createConnection(): IORedis | null {
  if (!process.env.REDIS_URL) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Mod = require('ioredis');
  return new Mod(process.env.REDIS_URL, {
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  });
}

/** Shared Redis connection for general use (caching, rate limiting, etc.) */
export function getRedis(): IORedis | null {
  if (!mainConnection) mainConnection = createConnection();
  return mainConnection;
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
  const conns = [mainConnection, subscriberConnection, publisherConnection];
  for (const conn of conns) {
    if (conn) conn.disconnect();
  }
  mainConnection = null;
  subscriberConnection = null;
  publisherConnection = null;
}
