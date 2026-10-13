'use client';

import { useEffect, useRef, useState } from 'react';

type WsState = 'connecting' | 'connected' | 'disconnected';

interface WsClientOptions {
  url?: string;
  reconnect?: boolean;
  /**
   * Upper bound on automatic reconnect attempts. Unbounded by default: the
   * server only ever drops a socket for transient reasons (deploy, network
   * blip, idle timeout), and a client that gives up stays dead until the
   * next full page load — which for a long-lived dashboard tab is never.
   */
  maxRetries?: number;
}

/** Backoff ceiling: 1s, 2s, 4s … 30s, 30s, 30s … */
const MAX_BACKOFF_MS = 30_000;

let wsInstance: WebSocket | null = null;
let wsState: WsState = 'disconnected';
const listeners = new Map<string, Set<(payload: unknown) => void>>();
const stateListeners = new Set<(state: WsState) => void>();
/**
 * Channels the app currently wants, independent of socket lifetime. The server
 * keeps its subscription set per socket, so every (re)connect must replay
 * these — and a subscribe() issued while the socket is still CONNECTING is
 * simply picked up by that replay instead of being dropped.
 */
const subscribedChannels = new Set<string>();
let retryCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;
let manuallyClosed = false;
let waitingForOnline = false;

function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function setState(state: WsState): void {
  wsState = state;
  stateListeners.forEach((fn) => fn(state));
}

function sendRaw(data: unknown): boolean {
  if (wsInstance?.readyState !== WebSocket.OPEN) return false;
  wsInstance.send(JSON.stringify(data));
  return true;
}

/** Exponential backoff with full jitter so reconnecting tabs don't stampede. */
function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
  return Math.round(base / 2 + Math.random() * (base / 2));
}

function clearRetryTimer(): void {
  if (retryTimeout) clearTimeout(retryTimeout);
  retryTimeout = null;
}

function scheduleReconnect(options: WsClientOptions): void {
  if (manuallyClosed || options.reconnect === false) return;
  if (options.maxRetries !== undefined && retryCount >= options.maxRetries)
    return;

  // Offline: a timer would just burn attempts. Wait for the browser to tell us
  // the network is back and reconnect immediately then (attempt counter reset,
  // since the failures weren't the server's fault).
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (waitingForOnline) return;
    waitingForOnline = true;
    window.addEventListener(
      'online',
      () => {
        waitingForOnline = false;
        retryCount = 0;
        connect(options);
      },
      { once: true }
    );
    return;
  }

  clearRetryTimer();
  retryTimeout = setTimeout(() => {
    retryTimeout = null;
    retryCount++;
    connect(options);
  }, backoffDelay(retryCount));
}

function connect(options: WsClientOptions = {}): void {
  if (
    wsInstance?.readyState === WebSocket.OPEN ||
    wsInstance?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  const url = options.url ?? getWsUrl();
  if (!url) return;

  // An explicit connect() always re-arms reconnection — disconnect() may have
  // parked the client earlier (e.g. sign-out followed by sign-in in-tab).
  manuallyClosed = false;
  clearRetryTimer();
  setState('connecting');

  try {
    wsInstance = new WebSocket(url);

    wsInstance.onopen = () => {
      setState('connected');
      retryCount = 0;
      subscribedChannels.forEach((channel) => {
        sendRaw({ type: 'subscribe', channel });
      });
    };

    wsInstance.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const channel = msg.channel ?? msg.type;
        const channelListeners = listeners.get(channel);
        if (channelListeners) {
          channelListeners.forEach((fn) => fn(msg.payload ?? msg));
        }
        // Also notify global listeners
        const globalListeners = listeners.get('*');
        if (globalListeners) {
          globalListeners.forEach((fn) => fn(msg));
        }
      } catch {
        // Ignore
      }
    };

    wsInstance.onclose = () => {
      setState('disconnected');
      wsInstance = null;
      scheduleReconnect(options);
    };

    wsInstance.onerror = () => {
      // onclose will fire after this
    };
  } catch {
    setState('disconnected');
    scheduleReconnect(options);
  }
}

function disconnect(): void {
  manuallyClosed = true;
  clearRetryTimer();
  retryCount = 0;
  wsInstance?.close();
  wsInstance = null;
  setState('disconnected');
}

function send(data: unknown): void {
  sendRaw(data);
}

function subscribe(channel: string): void {
  subscribedChannels.add(channel);
  // Not OPEN yet → the onopen replay delivers it.
  sendRaw({ type: 'subscribe', channel });
}

function unsubscribe(channel: string): void {
  subscribedChannels.delete(channel);
  sendRaw({ type: 'unsubscribe', channel });
}

/** Hook: manage WS connection lifecycle */
export function useWebSocket(options: WsClientOptions = {}): {
  state: WsState;
  send: (data: unknown) => void;
  disconnect: () => void;
} {
  const [state, setStateLocal] = useState<WsState>(wsState);

  useEffect(() => {
    const handler = (s: WsState) => setStateLocal(s);
    stateListeners.add(handler);
    connect(options);

    // A tab coming back to the foreground after a long sleep shouldn't sit out
    // the remainder of a 30s backoff — reconnect as soon as it's visible.
    const onVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        wsState === 'disconnected'
      ) {
        connect(options);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stateListeners.delete(handler);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, send, disconnect };
}

/** Hook: subscribe to a channel and receive messages */
export function useChannel<T = unknown>(
  channel: string,
  onMessage?: (payload: T) => void
): { messages: T[] } {
  const [messages, setMessages] = useState<T[]>([]);
  const callbackRef = useRef(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  });

  useEffect(() => {
    if (!channel) return;

    const handler = (payload: unknown) => {
      const typed = payload as T;
      setMessages((prev) => [...prev.slice(-99), typed]);
      callbackRef.current?.(typed);
    };

    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel)!.add(handler);

    // Subscribe on WS
    subscribe(channel);

    return () => {
      listeners.get(channel)?.delete(handler);
      if (listeners.get(channel)?.size === 0) {
        listeners.delete(channel);
        // Only drop the server-side subscription once the last consumer leaves;
        // two components on one channel must not cancel each other.
        unsubscribe(channel);
      }
    };
  }, [channel]);

  return { messages };
}

/** Test seam — exposes the module-level connection API without React. */
export const __wsInternals = {
  connect,
  disconnect,
  subscribe,
  unsubscribe,
  getState: () => wsState,
  getSubscribedChannels: () => new Set(subscribedChannels),
};
