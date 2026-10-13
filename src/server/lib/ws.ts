import { and, eq } from 'drizzle-orm';
import type { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

import { createLogger } from '@/core/lib/infra/logger';
import { registerMemoryStat } from '@/core/lib/infra/memory-stats';
import { authorizeChannel } from '@/core/lib/module/module-hooks';
import { db } from '@/server/db';
import { member as memberTable } from '@/server/db/schema/organization';

const log = createLogger('ws');

// Cap inbound frame size — the ws default is 100 MiB/frame, so one socket could
// pin huge buffers (a memory-pressure DoS). ws closes the socket (1009) on an
// oversize frame, so this must exceed the largest legitimate message; the
// control protocol here is tiny JSON. Modules streaming binary can raise it.
const MAX_PAYLOAD_BYTES =
  parseInt(process.env.WS_MAX_PAYLOAD_BYTES || '', 10) || 1024 * 1024;
// One user's concurrent socket count is bounded so an abuser can't grow the
// client set without limit; multi-tab/device use stays well under this.
const MAX_CONNECTIONS_PER_USER = 20;
// Anonymous sockets (public content channels) are capped per IP instead.
const MAX_ANON_CONNECTIONS_PER_IP = 20;
// Drop further sends to a socket whose outbound buffer is this backed up (a
// slow or stalled reader) instead of growing the in-process send buffer.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
// Bound the per-socket subscription set and channel-name length.
const MAX_CHANNELS_PER_SOCKET = 64;
const MAX_CHANNEL_LENGTH = 128;
// Inbound message budget per socket (sliding window). Control traffic is a few
// messages per minute; module message types ride the same budget.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  activeOrgId?: string;
  channels: Set<string>;
  isAlive: boolean;
  remoteIp: string;
  msgTimestamps: number[];
}

let wss: WebSocketServer | null = null;
const clients = new Set<AuthenticatedSocket>();
const socketsByUser = new Map<string, Set<AuthenticatedSocket>>();
const anonByIp = new Map<string, number>();

registerMemoryStat('wsClients', () => clients.size);
registerMemoryStat('wsUsers', () => socketsByUser.size);
registerMemoryStat('wsAnonIps', () => anonByIp.size);

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  });
  return cookies;
}

function getClientIp(request: IncomingMessage): string {
  const h = request.headers;
  const forwarded =
    (h['cf-connecting-ip'] as string | undefined) ??
    (h['x-real-ip'] as string | undefined) ??
    (h['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return forwarded || request.socket.remoteAddress || 'unknown';
}

function rejectUpgrade(
  socket: { write: (s: string) => void; destroy: () => void },
  status: string
): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function track(ws: AuthenticatedSocket): void {
  clients.add(ws);
  if (ws.userId) {
    let set = socketsByUser.get(ws.userId);
    if (!set) {
      set = new Set();
      socketsByUser.set(ws.userId, set);
    }
    set.add(ws);
  } else {
    anonByIp.set(ws.remoteIp, (anonByIp.get(ws.remoteIp) ?? 0) + 1);
  }
}

function untrack(ws: AuthenticatedSocket): void {
  clients.delete(ws);
  if (ws.userId) {
    const set = socketsByUser.get(ws.userId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) socketsByUser.delete(ws.userId);
    }
  } else {
    const n = (anonByIp.get(ws.remoteIp) ?? 1) - 1;
    if (n <= 0) anonByIp.delete(ws.remoteIp);
    else anonByIp.set(ws.remoteIp, n);
  }
}

/** Sliding-window budget; returns false when the socket should be throttled. */
function allowMessage(ws: AuthenticatedSocket): boolean {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const ts = ws.msgTimestamps;
  while (ts.length > 0 && ts[0] !== undefined && ts[0] <= cutoff) ts.shift();
  if (ts.length >= RATE_LIMIT_MAX) return false;
  ts.push(now);
  return true;
}

export function initWebSocketServer(server: Server): WebSocketServer {
  const instance = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
    // Off unless WS_PERMESSAGE_DEFLATE=true — ws-library zlib contexts fragment
    // memory under sustained traffic (steady RSS growth; see the ws README).
    // Payloads are small JSON, so compression buys little.
    perMessageDeflate:
      process.env.WS_PERMESSAGE_DEFLATE === 'true'
        ? {
            zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
            zlibInflateOptions: { chunkSize: 10 * 1024 },
            clientNoContextTakeover: true,
            serverNoContextTakeover: true,
            serverMaxWindowBits: 10,
            concurrencyLimit: 10,
            threshold: 1024,
          }
        : false,
  });
  wss = instance;

  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    // Only handle /ws path
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (url.pathname !== '/ws') return;
    if (wss !== instance) {
      // Server is shutting down (or was re-initialized) — refuse new sockets.
      socket.destroy();
      return;
    }

    // Node drops the http server's own socket error listener before emitting
    // 'upgrade', and ws only attaches its listener inside handleUpgrade() —
    // so for the whole async auth below the raw socket has none. A client
    // reset mid-await would then be an unhandled 'error' → uncaughtException
    // → server.ts exits. Kept for the socket's life: a debug line per error
    // is cheap, and ws's own handling of the upgraded socket is unaffected.
    socket.on('error', (err: Error) => {
      log.debug('WS upgrade socket error', { error: err.message });
      socket.destroy();
    });

    try {
      // Anonymous sockets are allowed: public `content:*` channels and module
      // channels (e.g. guest support chat) authorize per subscription instead.
      const userId = await authenticateUpgrade(request);
      const remoteIp = getClientIp(request);

      if (userId) {
        if (
          (socketsByUser.get(userId)?.size ?? 0) >= MAX_CONNECTIONS_PER_USER
        ) {
          log.warn('WS connection cap reached for user', { userId });
          rejectUpgrade(socket, '429 Too Many Requests');
          return;
        }
      } else if ((anonByIp.get(remoteIp) ?? 0) >= MAX_ANON_CONNECTIONS_PER_IP) {
        log.warn('WS anonymous connection cap reached for IP', { remoteIp });
        rejectUpgrade(socket, '429 Too Many Requests');
        return;
      }

      instance.handleUpgrade(request, socket, head, (ws) => {
        const client = ws as AuthenticatedSocket;
        client.userId = userId ?? undefined;
        client.channels = new Set();
        client.isAlive = true;
        client.remoteIp = remoteIp;
        client.msgTimestamps = [];

        instance.emit('connection', client, request);
      });
    } catch (err) {
      log.debug('WS upgrade rejected', { error: String(err) });
      rejectUpgrade(socket, '401 Unauthorized');
    }
  });

  instance.on('connection', (ws: AuthenticatedSocket) => {
    track(ws);

    // Without an 'error' listener a socket-level error (reset, oversize frame)
    // becomes an unhandled 'error' event, which throws and takes the process down.
    ws.on('error', (err) => {
      log.debug('WS socket error', { userId: ws.userId, error: err.message });
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // control protocol is JSON text only
      if (!allowMessage(ws)) {
        log.debug('WS message dropped: rate limit', {
          userId: ws.userId,
          ip: ws.remoteIp,
        });
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // Ignore malformed messages
      }
      if (
        !msg ||
        typeof msg !== 'object' ||
        typeof (msg as { type?: unknown }).type !== 'string'
      )
        return;
      void handleMessage(ws, msg as { type: string; channel?: unknown });
    });

    ws.on('close', () => {
      untrack(ws);
    });

    // Send welcome
    trySend(
      ws,
      JSON.stringify({ type: 'connected', payload: { userId: ws.userId } })
    );
  });

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.terminate();
        untrack(client);
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30_000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  instance.on('close', () => {
    clearInterval(heartbeat);
  });

  // Setup Redis pub/sub if available
  setupRedisPubSub();

  return instance;
}

async function authenticateUpgrade(
  request: IncomingMessage
): Promise<string | null> {
  // Parse session cookie
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  try {
    // Use Better Auth to validate session from cookie
    const { auth } = await import('@/lib/auth');
    const cookies = parseCookies(cookieHeader);
    const sessionToken =
      cookies['better-auth.session_token'] ??
      cookies['__Secure-better-auth.session_token'];

    if (!sessionToken) return null;

    // Create a fake Request with the cookie header for Better Auth
    const fakeHeaders = new Headers();
    fakeHeaders.set('cookie', cookieHeader);
    const session = await auth.api.getSession({ headers: fakeHeaders });

    return (session?.user as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

async function handleMessage(
  ws: AuthenticatedSocket,
  msg: { type: string; channel?: unknown }
) {
  const channel = typeof msg.channel === 'string' ? msg.channel : undefined;

  switch (msg.type) {
    case 'subscribe': {
      if (!channel || channel.length > MAX_CHANNEL_LENGTH) return;
      if (ws.channels.size >= MAX_CHANNELS_PER_SOCKET) {
        trySend(
          ws,
          JSON.stringify({
            type: 'error',
            payload: { message: 'Too many subscriptions' },
          })
        );
        return;
      }
      if (!(await canSubscribe(ws, channel))) {
        trySend(
          ws,
          JSON.stringify({
            type: 'error',
            payload: { message: 'Cannot subscribe to channel' },
          })
        );
        return;
      }
      ws.channels.add(channel);
      trySend(ws, JSON.stringify({ type: 'subscribed', channel }));
      break;
    }
    case 'unsubscribe': {
      if (!channel) return;
      ws.channels.delete(channel);
      trySend(ws, JSON.stringify({ type: 'unsubscribed', channel }));
      break;
    }
    case 'ping': {
      trySend(ws, JSON.stringify({ type: 'pong' }));
      break;
    }
    default: {
      // Delegate unhandled message types to module hooks (e.g., voice calls)
      if (ws.userId) {
        const userId = ws.userId;
        import('@/core/lib/module/module-hooks')
          .then(({ runHook }) => {
            runHook('ws.message', userId, msg).catch(() => {});
          })
          .catch(() => {});
      }
      break;
    }
  }
}

async function canSubscribe(
  ws: AuthenticatedSocket,
  channel: string
): Promise<boolean> {
  // user:<id> — only own channel
  if (channel.startsWith('user:')) {
    return channel === `user:${ws.userId}`;
  }
  // org:<orgId> — must be authenticated + org member
  if (channel.startsWith('org:')) {
    if (!ws.userId) return false;
    const orgId = channel.slice(4);
    try {
      const [membership] = await db
        .select({ id: memberTable.id })
        .from(memberTable)
        .where(
          and(
            eq(memberTable.organizationId, orgId),
            eq(memberTable.userId, ws.userId)
          )
        )
        .limit(1);
      return !!membership;
    } catch {
      return false;
    }
  }
  // admin — must be authenticated
  if (channel === 'admin') {
    return !!ws.userId;
  }
  // content:<id> — public
  if (channel.startsWith('content:')) {
    return true;
  }

  // Delegate to module-registered channel authorizers
  return authorizeChannel(ws.userId, channel);
}

// Send a pre-serialized string to one socket, dropping it under backpressure
// (a slow/stalled reader) so the in-process send buffer can't grow unbounded.
function trySend(ws: AuthenticatedSocket, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
    log.warn('Dropping WS send: socket backpressured', {
      userId: ws.userId,
      bufferedAmount: ws.bufferedAmount,
    });
    return;
  }
  ws.send(message);
}

function broadcastLocal(channel: string, message: string): void {
  for (const client of clients) {
    if (client.channels.has(channel)) trySend(client, message);
  }
}

/** Broadcast to all clients subscribed to a channel */
export function broadcastToChannel(
  channel: string,
  type: string,
  payload: unknown
): void {
  const message = JSON.stringify({ type, channel, payload });

  // Local broadcast
  broadcastLocal(channel, message);

  // Redis publish for multi-instance
  publishToRedis(channel, message);
}

/** Send to a specific user across all their connections */
export function sendToUser(
  userId: string,
  type: string,
  payload: unknown
): void {
  broadcastToChannel(`user:${userId}`, type, payload);
}

/** Send to all members of an org */
export function sendToOrg(orgId: string, type: string, payload: unknown): void {
  broadcastToChannel(`org:${orgId}`, type, payload);
}

// Redis pub/sub for multi-instance support
async function setupRedisPubSub(): Promise<void> {
  try {
    const { getSubscriber } = await import('@/core/lib/infra/redis');
    const subscriber = getSubscriber();
    if (!subscriber) return;

    await subscriber.subscribe('ws:broadcast');
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== 'ws:broadcast') return; // the subscriber connection is shared
      try {
        const { channel: wsChannel, data } = JSON.parse(message);
        if (typeof wsChannel !== 'string' || typeof data !== 'string') return;
        // Broadcast locally only (avoid infinite loop)
        broadcastLocal(wsChannel, data);
      } catch {
        // Ignore
      }
    });
  } catch {
    // Redis not available — single-instance mode
  }
}

async function publishToRedis(channel: string, data: string): Promise<void> {
  try {
    const { getPublisher } = await import('@/core/lib/infra/redis');
    const publisher = getPublisher();
    if (!publisher) return;
    await publisher.publish('ws:broadcast', JSON.stringify({ channel, data }));
  } catch {
    // Ignore
  }
}

export function getWss(): WebSocketServer | null {
  return wss;
}

export function shutdownWebSocket(): void {
  if (wss) {
    for (const client of clients) {
      client.terminate();
    }
    clients.clear();
    socketsByUser.clear();
    anonByIp.clear();
    wss.close();
    wss = null;
  }
}
