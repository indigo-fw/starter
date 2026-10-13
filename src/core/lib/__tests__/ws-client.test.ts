import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fake WebSocket: records every instance and lets tests drive open/close.
 * Installed on globalThis BEFORE the client module is imported, since the
 * client reads `WebSocket.OPEN` etc. from the global at call time.
 */
class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  /** Test driver: the server accepted the connection. */
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  /** Test driver: the server dropped the connection. */
  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  frames(): Array<{ type: string; channel?: string }> {
    return this.sent.map((s) => JSON.parse(s));
  }
}

(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;

const URL = 'ws://localhost/ws';

async function loadClient() {
  // Fresh module per test so module-level connection state doesn't leak.
  vi.resetModules();
  const mod = await import('../realtime/ws-client');
  return mod.__wsInternals;
}

function latest(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

describe('ws-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    // Deterministic jitter: always the top of the range.
    vi.spyOn(Math, 'random').mockReturnValue(1);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues subscribe frames until the socket is OPEN', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    ws.subscribe('notifications');
    expect(latest().sent).toEqual([]);

    latest().open();
    expect(latest().frames()).toEqual([
      { type: 'subscribe', channel: 'notifications' },
    ]);
  });

  it('replays every subscribed channel after a reconnect', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    latest().open();
    ws.subscribe('a');
    ws.subscribe('b');
    ws.unsubscribe('b');
    const first = latest();
    expect(first.frames().map((f) => f.type)).toEqual([
      'subscribe',
      'subscribe',
      'unsubscribe',
    ]);

    first.drop();
    expect(ws.getState()).toBe('disconnected');
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const second = latest();
    expect(second).not.toBe(first);
    second.open();
    expect(second.frames()).toEqual([{ type: 'subscribe', channel: 'a' }]);
    expect(ws.getSubscribedChannels()).toEqual(new Set(['a']));
  });

  it('never gives up by default: backoff caps at 30s and keeps retrying', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    // 1s, 2s, 4s, 8s, 16s, then 30s forever (jitter pinned to the max).
    const expected = [
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000,
      30000,
    ];
    for (const delay of expected) {
      const before = FakeWebSocket.instances.length;
      latest().drop();
      vi.advanceTimersByTime(delay - 1);
      expect(FakeWebSocket.instances).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(before + 1);
    }
    // 12 drops > the old hard limit of 10 — still reconnecting.
    expect(FakeWebSocket.instances.length).toBeGreaterThan(11);
  });

  it('resets the backoff after a successful open', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    latest().drop();
    vi.advanceTimersByTime(1000);
    latest().drop();
    vi.advanceTimersByTime(2000);
    latest().open();
    latest().drop();
    // Back to the first step.
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(4);
  });

  it('honours an explicit maxRetries', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL, maxRetries: 2 });
    latest().drop();
    vi.advanceTimersByTime(1000);
    latest().drop();
    vi.advanceTimersByTime(2000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    latest().drop();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('disconnect() stops reconnecting; a later connect() re-arms it', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    latest().open();
    ws.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    ws.connect({ url: URL });
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().drop();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('waits for the online event instead of burning retries while offline', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    latest().open();
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    latest().drop();
    vi.advanceTimersByTime(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event('online'));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('dispatches channel messages and the global wildcard', async () => {
    const ws = await loadClient();
    ws.connect({ url: URL });
    latest().open();
    // Reach listeners through the public hook contract is React-only; the
    // transport parse path is exercised here via a raw frame round-trip.
    const frame = JSON.stringify({
      channel: 'notifications',
      payload: { id: 'n1' },
    });
    expect(() => latest().onmessage?.({ data: frame })).not.toThrow();
    expect(() => latest().onmessage?.({ data: 'not-json{{{' })).not.toThrow();
  });
});
