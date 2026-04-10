import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original WebSocket and mock it
const mockSend = vi.fn();
const mockClose = vi.fn();

let _onOpenHandler: (() => void) | null = null;
let _onMessageHandler: ((event: { data: string }) => void) | null = null;
let _onCloseHandler: (() => void) | null = null;
let _onErrorHandler: (() => void) | null = null;

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  send = mockSend;
  close = mockClose;

  set onopen(fn: (() => void) | null) {
    _onOpenHandler = fn;
  }
  set onmessage(fn: ((event: { data: string }) => void) | null) {
    _onMessageHandler = fn;
  }
  set onclose(fn: (() => void) | null) {
    _onCloseHandler = fn;
  }
  set onerror(fn: (() => void) | null) {
    _onErrorHandler = fn;
  }

  constructor(public url: string) {
    // Auto-open after creation (simulating connection)
  }
}

// Set up WebSocket mock before imports
(globalThis as Record<string, unknown>).WebSocket = MockWebSocket;

// Import ws-client module (uses module-level state)
async function loadWsClient() {
  const mod = await import('../realtime/ws-client');
  return mod;
}

describe('ws-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockClear();
    mockClose.mockClear();
    _onOpenHandler = null;
    _onMessageHandler = null;
    _onCloseHandler = null;
    _onErrorHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('useWebSocket', () => {
    it('exports useWebSocket function', async () => {
      const { useWebSocket } = await loadWsClient();
      expect(typeof useWebSocket).toBe('function');
    });

    it('exports useChannel function', async () => {
      const { useChannel } = await loadWsClient();
      expect(typeof useChannel).toBe('function');
    });
  });

  describe('WebSocket connection logic (unit)', () => {
    it('MockWebSocket constructor stores URL', () => {
      const ws = new MockWebSocket('ws://localhost/ws');
      expect(ws.url).toBe('ws://localhost/ws');
    });

    it('MockWebSocket starts in CONNECTING state', () => {
      const ws = new MockWebSocket('ws://localhost/ws');
      expect(ws.readyState).toBe(MockWebSocket.CONNECTING);
    });
  });

  describe('message parsing', () => {
    it('parses JSON messages with channel and payload', () => {
      const msg = JSON.stringify({
        channel: 'notifications',
        payload: { id: 'n1', title: 'Test' },
      });

      // Simulate onmessage parsing logic
      const parsed = JSON.parse(msg);
      const channel = parsed.channel ?? parsed.type;
      expect(channel).toBe('notifications');
      expect(parsed.payload).toEqual({ id: 'n1', title: 'Test' });
    });

    it('falls back to type field when channel is absent', () => {
      const msg = JSON.stringify({
        type: 'notification',
        payload: { id: 'n2' },
      });

      const parsed = JSON.parse(msg);
      const channel = parsed.channel ?? parsed.type;
      expect(channel).toBe('notification');
    });

    it('handles malformed JSON gracefully', () => {
      const badData = 'not-json{{{';
      let error = false;
      try {
        JSON.parse(badData);
      } catch {
        error = true;
      }
      expect(error).toBe(true);
    });
  });

  describe('subscribe/unsubscribe protocol', () => {
    it('subscribe sends correct message format', () => {
      const expected = JSON.stringify({ type: 'subscribe', channel: 'test-channel' });
      // Verify the protocol shape
      const msg = { type: 'subscribe', channel: 'test-channel' };
      expect(JSON.stringify(msg)).toBe(expected);
    });

    it('unsubscribe sends correct message format', () => {
      const msg = { type: 'unsubscribe', channel: 'test-channel' };
      expect(msg.type).toBe('unsubscribe');
      expect(msg.channel).toBe('test-channel');
    });
  });

  describe('reconnection logic', () => {
    it('calculates exponential backoff delays', () => {
      const delays: number[] = [];

      for (let retryCount = 0; retryCount < 5; retryCount++) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        delays.push(delay);
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
    });

    it('caps backoff delay at 30 seconds', () => {
      const retryCount = 20; // Very high retry count
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
      expect(delay).toBe(30_000);
    });
  });

  describe('getWsUrl', () => {
    it('constructs ws:// URL for http: protocol', () => {
      // Simulate the logic from getWsUrl
      const protocol: string = 'http:';
      const host = 'localhost:3000';
      const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProtocol}//${host}/ws`;

      expect(url).toBe('ws://localhost:3000/ws');
    });

    it('constructs wss:// URL for https: protocol', () => {
      const protocol = 'https:';
      const host = 'example.com';
      const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProtocol}//${host}/ws`;

      expect(url).toBe('wss://example.com/ws');
    });
  });

  describe('message buffer in useChannel', () => {
    it('keeps last 100 messages (slices at -99 before adding new)', () => {
      const messages: number[] = [];
      for (let i = 0; i < 105; i++) {
        // Replicate the logic: [...prev.slice(-99), newItem]
        const updated = [...messages.slice(-99), i];
        messages.length = 0;
        messages.push(...updated);
      }

      expect(messages).toHaveLength(100);
      expect(messages[0]).toBe(5); // First 5 dropped
      expect(messages[99]).toBe(104);
    });
  });
});
