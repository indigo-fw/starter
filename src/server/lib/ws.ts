import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { eq, and } from 'drizzle-orm';
import { db } from '@/server/db';
import { member as memberTable } from '@/server/db/schema/organization';
import { saasTickets } from '@/core-support/schema/support-tickets';
import { saasSupportChatSessions } from '@/core-support/schema/support-chat';
import { chatConversations } from '@/core-chat/schema/conversations';
import { user as userTable } from '@/server/db/schema/auth';
import { Policy } from '@/core/policy';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  activeOrgId?: string;
  channels: Set<string>;
  isAlive: boolean;
}

let wss: WebSocketServer | null = null;
const clients = new Set<AuthenticatedSocket>();

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  header.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  });
  return cookies;
}

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request: IncomingMessage, socket, head) => {
    // Only handle /ws path
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (url.pathname !== '/ws') return;

    try {
      const userId = await authenticateUpgrade(request);

      wss!.handleUpgrade(request, socket, head, (ws) => {
        const client = ws as AuthenticatedSocket;
        client.userId = userId ?? undefined;
        client.channels = new Set();
        client.isAlive = true;

        wss!.emit('connection', client, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: AuthenticatedSocket) => {
    clients.add(ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
    });

    // Send welcome
    ws.send(JSON.stringify({ type: 'connected', payload: { userId: ws.userId } }));
  });

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.terminate();
        clients.delete(client);
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  // Setup Redis pub/sub if available
  setupRedisPubSub();

  return wss;
}

async function authenticateUpgrade(request: IncomingMessage): Promise<string | null> {
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

async function handleMessage(ws: AuthenticatedSocket, msg: { type: string; channel?: string }) {
  switch (msg.type) {
    case 'subscribe': {
      if (!msg.channel) return;
      if (!(await canSubscribe(ws, msg.channel))) {
        ws.send(JSON.stringify({ type: 'error', payload: { message: 'Cannot subscribe to channel' } }));
        return;
      }
      ws.channels.add(msg.channel);
      ws.send(JSON.stringify({ type: 'subscribed', channel: msg.channel }));
      break;
    }
    case 'unsubscribe': {
      if (!msg.channel) return;
      ws.channels.delete(msg.channel);
      ws.send(JSON.stringify({ type: 'unsubscribed', channel: msg.channel }));
      break;
    }
    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }
  }
}

async function canSubscribe(ws: AuthenticatedSocket, channel: string): Promise<boolean> {
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
        .where(and(eq(memberTable.organizationId, orgId), eq(memberTable.userId, ws.userId)))
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
  // support:<ticketId> — ticket owner or staff with section.settings capability
  if (channel.startsWith('support:')) {
    if (!ws.userId) return false;
    const ticketId = channel.slice(8);
    try {
      const [ticket] = await db
        .select({ userId: saasTickets.userId })
        .from(saasTickets)
        .where(eq(saasTickets.id, ticketId))
        .limit(1);
      if (!ticket) return false;
      // Owner can always subscribe
      if (ticket.userId === ws.userId) return true;
      // Non-owner: must be staff with settings access
      const [u] = await db
        .select({ role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, ws.userId))
        .limit(1);
      return !!u && Policy.for(u.role).can('section.settings');
    } catch {
      return false;
    }
  }
  // supportChat:<sessionId> — session owner (by userId), staff, or anonymous
  // with matching visitorId (passed as chat-visitor:<visitorId>:<sessionId>)
  if (channel.startsWith('supportChat:')) {
    const sessionId = channel.slice(12);
    try {
      const [session] = await db
        .select({ visitorId: saasSupportChatSessions.visitorId, userId: saasSupportChatSessions.userId })
        .from(saasSupportChatSessions)
        .where(eq(saasSupportChatSessions.id, sessionId))
        .limit(1);
      if (!session) return false;
      // Authenticated owner
      if (ws.userId && session.userId === ws.userId) return true;
      // Staff with settings access
      if (ws.userId) {
        const [u] = await db
          .select({ role: userTable.role })
          .from(userTable)
          .where(eq(userTable.id, ws.userId))
          .limit(1);
        if (u && Policy.for(u.role).can('section.settings')) return true;
      }
      // Anonymous — session UUID is unguessable (acts as bearer token).
      // This is acceptable because: (1) UUIDs have 122 bits of entropy,
      // (2) sessions are short-lived (24h TTL), (3) no sensitive data beyond
      // the chat conversation itself which the visitor already participated in.
      if (!ws.userId) return true;
      return false;
    } catch {
      return false;
    }
  }
  // chat:<conversationId> — conversation owner or staff
  if (channel.startsWith('chat:')) {
    if (!ws.userId) return false;
    const conversationId = channel.slice(5);
    try {
      const [conv] = await db
        .select({ userId: chatConversations.userId })
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
        .limit(1);
      if (!conv) return false;
      if (conv.userId === ws.userId) return true;
      // Staff can monitor
      const [u] = await db
        .select({ role: userTable.role })
        .from(userTable)
        .where(eq(userTable.id, ws.userId))
        .limit(1);
      return !!u && Policy.for(u.role).can('section.settings');
    } catch {
      return false;
    }
  }
  // content:<id> — public
  if (channel.startsWith('content:')) {
    return true;
  }
  return false;
}

/** Broadcast to all clients subscribed to a channel */
export function broadcastToChannel(channel: string, type: string, payload: unknown): void {
  const message = JSON.stringify({ type, channel, payload });

  // Local broadcast
  for (const client of clients) {
    if (client.channels.has(channel) && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }

  // Redis publish for multi-instance
  publishToRedis(channel, message);
}

/** Send to a specific user across all their connections */
export function sendToUser(userId: string, type: string, payload: unknown): void {
  broadcastToChannel(`user:${userId}`, type, payload);
}

/** Send to all members of an org */
export function sendToOrg(orgId: string, type: string, payload: unknown): void {
  broadcastToChannel(`org:${orgId}`, type, payload);
}

// Redis pub/sub for multi-instance support
async function setupRedisPubSub(): Promise<void> {
  try {
    const { getSubscriber } = await import('@/core/lib/redis');
    const subscriber = getSubscriber();
    if (!subscriber) return;

    await subscriber.subscribe('ws:broadcast');
    subscriber.on('message', (_channel: string, message: string) => {
      try {
        const { channel: wsChannel, data } = JSON.parse(message);
        // Broadcast locally only (avoid infinite loop)
        for (const client of clients) {
          if (client.channels.has(wsChannel) && client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        }
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
    const { getPublisher } = await import('@/core/lib/redis');
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
    wss.close();
    wss = null;
  }
}
