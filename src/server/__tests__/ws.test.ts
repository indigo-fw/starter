// @vitest-environment node
import { initWebSocketServer, shutdownWebSocket } from '../lib/ws';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, Server } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/db/schema/organization', () => ({ member: {} }));
vi.mock('@/core/lib/module/module-hooks', () => ({
  authorizeChannel: vi.fn().mockResolvedValue(false),
  runHook: vi.fn().mockResolvedValue(undefined),
}));

// Auth that stays pending until the test releases it — the window in which
// the raw upgrade socket has no owner yet.
const authState = vi.hoisted(() => {
  const state = {
    release: (_userId: string | null): void => {},
    markCalled: (): void => {},
    called: Promise.resolve(),
  };
  state.called = new Promise<void>((resolve) => {
    state.markCalled = resolve;
  });
  return state;
});
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: () =>
        new Promise((resolve) => {
          authState.release = (userId) =>
            resolve(userId ? { user: { id: userId } } : null);
          authState.markCalled();
        }),
    },
  },
}));

function fakeUpgradeRequest(): IncomingMessage {
  return {
    url: '/ws',
    method: 'GET',
    headers: {
      host: 'localhost',
      cookie: 'better-auth.session_token=abc',
      upgrade: 'websocket',
      connection: 'Upgrade',
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

describe('WS upgrade handler', () => {
  afterEach(() => {
    shutdownWebSocket();
  });

  it('owns socket errors while authentication is still pending', async () => {
    // The vitest network guard denies real TCP, so drive the 'upgrade' event
    // directly: the handler only needs the request, a Duplex and the head.
    const server = new EventEmitter() as unknown as Server;
    initWebSocketServer(server);

    const socket = new PassThrough();
    expect(socket.listenerCount('error')).toBe(0);
    server.emit('upgrade', fakeUpgradeRequest(), socket, Buffer.alloc(0));
    await authState.called;

    // Mid-await: a client reset arrives as 'error' on the bare socket. With no
    // listener, EventEmitter throws → uncaughtException → server.ts exits.
    expect(socket.listenerCount('error')).toBeGreaterThan(0);
    expect(() =>
      socket.emit('error', new Error('read ECONNRESET'))
    ).not.toThrow();
    expect(socket.destroyed).toBe(true);

    // Auth completing afterwards must not blow up on the dead socket either.
    authState.release(null);
    await new Promise((r) => setImmediate(r));
    expect(socket.destroyed).toBe(true);
  });
});
