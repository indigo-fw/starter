'use client';

import { useEffect, useRef, useState } from 'react';

type WsState = 'connecting' | 'connected' | 'disconnected';

interface WsClientOptions {
  url?: string;
  reconnect?: boolean;
  maxRetries?: number;
}

let wsInstance: WebSocket | null = null;
let wsState: WsState = 'disconnected';
const listeners = new Map<string, Set<(payload: unknown) => void>>();
const stateListeners = new Set<(state: WsState) => void>();
let retryCount = 0;
let retryTimeout: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function setState(state: WsState): void {
  wsState = state;
  stateListeners.forEach((fn) => fn(state));
}

function connect(options: WsClientOptions = {}): void {
  if (wsInstance?.readyState === WebSocket.OPEN || wsInstance?.readyState === WebSocket.CONNECTING) return;

  const url = options.url ?? getWsUrl();
  if (!url) return;

  setState('connecting');

  try {
    wsInstance = new WebSocket(url);

    wsInstance.onopen = () => {
      setState('connected');
      retryCount = 0;
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

      const maxRetries = options.maxRetries ?? 10;
      if (options.reconnect !== false && retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryTimeout = setTimeout(() => {
          retryCount++;
          connect(options);
        }, delay);
      }
    };

    wsInstance.onerror = () => {
      // onclose will fire after this
    };
  } catch {
    setState('disconnected');
  }
}

function disconnect(): void {
  if (retryTimeout) clearTimeout(retryTimeout);
  retryCount = Infinity; // Prevent reconnect
  wsInstance?.close();
  wsInstance = null;
  setState('disconnected');
}

function send(data: unknown): void {
  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify(data));
  }
}

function subscribe(channel: string): void {
  send({ type: 'subscribe', channel });
}

function unsubscribe(channel: string): void {
  send({ type: 'unsubscribe', channel });
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
    return () => {
      stateListeners.delete(handler);
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
      }
      unsubscribe(channel);
    };
  }, [channel]);

  return { messages };
}
