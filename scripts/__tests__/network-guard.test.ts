/**
 * Self-test for the unit-test network guard (installed by vitest-setup.ts).
 * Each case drains the recorded attempts via assertNoNetworkRequests so the
 * global afterEach in the setup file sees a clean slate.
 */
import { assertNoNetworkRequests } from '../network-guard';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { describe, expect, it, vi } from 'vitest';

describe('unit-test network guard', () => {
  it('blocks an unmocked fetch and remembers the attempt even if it is caught', async () => {
    await expect(fetch('https://provider.invalid/generate')).rejects.toThrow(
      'Unit tests cannot open real fetch connections'
    );
    expect(assertNoNetworkRequests).toThrow('real fetch');
    expect(assertNoNetworkRequests).not.toThrow();
  });

  it('rethrows only the first blocked attempt, then clears', async () => {
    await fetch('https://a.invalid').catch(() => undefined);
    expect(() => http.request('http://b.invalid')).toThrow('real HTTP');
    expect(assertNoNetworkRequests).toThrow('real fetch');
    expect(assertNoNetworkRequests).not.toThrow();
  });

  it.each([
    ['HTTP request', () => http.request('http://provider.invalid')],
    ['HTTP get', () => http.get('http://provider.invalid')],
    ['HTTPS request', () => https.request('https://provider.invalid')],
    ['HTTPS get', () => https.get('https://provider.invalid')],
    ['TCP', () => net.connect(443, 'provider.invalid')],
    ['TLS', () => tls.connect(443, 'provider.invalid')],
  ] as const)('blocks %s before opening a connection', (_name, connect) => {
    expect(connect).toThrow('Unit tests cannot open real');
    expect(assertNoNetworkRequests).toThrow('Unit tests cannot open real');
  });

  it('allows a mocked response and restores the blocked default afterwards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('mock')));
    try {
      expect(await (await fetch('https://provider.invalid')).text()).toBe(
        'mock'
      );
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
    await expect(fetch('https://provider.invalid')).rejects.toThrow(
      'real fetch'
    );
    expect(assertNoNetworkRequests).toThrow('real fetch');
  });

  it('does not record attempts against a directly assigned fetch stub', async () => {
    // The webhooks tests assign `global.fetch = vi.fn()` without stubGlobal;
    // that path must never trip the global afterEach assertion.
    const guarded = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    try {
      await fetch('https://provider.invalid/hook');
      expect(assertNoNetworkRequests).not.toThrow();
    } finally {
      globalThis.fetch = guarded;
    }
  });
});
