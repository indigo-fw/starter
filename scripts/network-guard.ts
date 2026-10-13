/**
 * Unit tests must not open real network connections. A test that reaches a
 * live provider (DeepL, Stripe, an SMTP relay, the project's own Postgres)
 * is either leaking credentials from the developer's shell, flaking on
 * connectivity, or both — and a retry/fallback path in application code can
 * swallow the failure so the suite still passes.
 *
 * Installed from scripts/vitest-setup.ts BEFORE application imports, so even
 * clients constructed at module scope hit the guard. DB-backed tests run under
 * vitest.db.config.ts, which does not load the setup file.
 */
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';

const blocked: Error[] = [];

function deny(transport: string): never {
  // Do not include URLs or connection options: they can contain credentials.
  const error = new Error(
    `Unit tests cannot open real ${transport} connections. Mock the request or provider (vi.fn() on fetch, vi.mock() on the client module).`
  );
  blocked.push(error);
  throw error;
}

/** Install before application imports, including clients constructed at module scope. */
export function installNetworkGuard(): void {
  // Plain replacements survive vi.restoreAllMocks()/vi.unstubAllGlobals(). A
  // test can still stub fetch, but restoring it returns to this blocked default.
  globalThis.fetch = (async () => deny('fetch')) as unknown as typeof fetch;
  http.request = () => deny('HTTP');
  http.get = () => deny('HTTP');
  https.request = () => deny('HTTPS');
  https.get = () => deny('HTTPS');
  net.Socket.prototype.connect = () => deny('TCP');
  tls.connect = () => deny('TLS');
  syncBuiltinESMExports();
}

/** Fail even when application retry/fallback code caught the network error. */
export function assertNoNetworkRequests(): void {
  const first = blocked[0];
  blocked.length = 0;
  if (first) throw first;
}
