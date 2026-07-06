/**
 * MCP end-to-end smoke test — run against a live dev server:
 *
 *   bun run dev          # in one terminal
 *   bun scripts/mcp-smoke.ts [--oauth]
 *
 * What it proves (things unit tests can't):
 *
 *   1. **Real protocol conformance** — connects with the official MCP SDK
 *      `Client` (the same machinery Claude Code uses): initialize handshake,
 *      capability negotiation, tools/list, tools/call over Streamable HTTP.
 *   2. **API-key auth** — uses INDIGO_MCP_KEY from .env.local.
 *   3. **Anonymous dev access** — public tool works, protected fails clean.
 *   4. **--oauth**: the full OAuth 2.1 flow a claude.ai connector performs —
 *      dynamic client registration → login (persona) → PKCE authorize →
 *      token exchange → authenticated call. Requires `indigo personas` seeded.
 *
 * Exits non-zero on any failure — safe for CI once a server fixture exists.
 */

import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.INDIGO_MCP_URL?.replace(/\/api\/mcp$/, '') ?? 'http://localhost:4000';
const MCP_URL = `${BASE}/api/mcp`;
const WANT_OAUTH = process.argv.includes('--oauth');

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function envKey(name: string): string | null {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, 'utf-8').match(new RegExp(`^${name}=(.+)$`, 'm'));
  return m?.[1]?.trim() ?? null;
}

async function connectClient(headers?: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'indigo-mcp-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: headers ? { headers } : undefined,
  });
  await client.connect(transport);
  return client;
}

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((c) => c.type === 'text')?.text ?? '';
}

// ─── 1+2. SDK client over API key ────────────────────────────────────────────

console.log('\nSDK client, API-key auth:');
const apiKey = envKey('INDIGO_MCP_KEY');
if (!apiKey) {
  check('INDIGO_MCP_KEY in .env.local', false, 'run `bun run init` or mint a key');
} else {
  const client = await connectClient({ Authorization: `Bearer ${apiKey}` });

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  check('initialize + tools/list via SDK', tools.length > 0, `${tools.length} tools listed`);
  check(
    'built-ins present',
    ['search_tools', 'describe_tool', 'invoke_tool', 'view_image'].every((n) => names.includes(n)),
  );
  check('catalog is curated (not the full registry)', tools.length < 50, `${tools.length} listed`);

  const me = await client.callTool({ name: 'auth.me', arguments: {} });
  check('tools/call auth.me', textOf(me as never).includes('"email"'));

  const search = await client.callTool({ name: 'search_tools', arguments: { query: 'activity feed', limit: 3 } });
  check('search_tools returns registry hits', textOf(search as never).includes('activity.'));

  const invoked = await client.callTool({
    name: 'invoke_tool',
    arguments: { name: 'auth.me', input: {} },
  });
  check('invoke_tool delegates to registry', textOf(invoked as never).includes('"email"'));

  await client.close();
}

// ─── 3. Anonymous (dev only) ─────────────────────────────────────────────────

console.log('\nAnonymous dev access:');
try {
  const anon = await connectClient();
  const pub = await anon.callTool({
    name: 'contentSearch.fullTextSearch',
    arguments: { query: 'welcome' },
  });
  check('public tool works logged-out', !(pub as { isError?: boolean }).isError);

  const priv = await anon.callTool({ name: 'auth.me', arguments: {} });
  check(
    'protected tool fails clean logged-out',
    Boolean((priv as { isError?: boolean }).isError) && textOf(priv as never).includes('UNAUTHORIZED'),
  );
  await anon.close();
} catch (err) {
  check('anonymous connection (dev server?)', false, String(err).slice(0, 100));
}

// ─── 4. OAuth 2.1 flow (opt-in) ──────────────────────────────────────────────

if (WANT_OAUTH) {
  console.log('\nOAuth 2.1 flow (as a claude.ai connector would):');
  const EMAIL = 'free@test.local';
  const REDIRECT = 'http://localhost:19191/callback';
  const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  try {
    const { PERSONA_PASSWORD } = await import('../src/core/lib/dev/personas');
    const disco = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
    check('discovery metadata', Boolean(disco.authorization_endpoint && disco.registration_endpoint));

    const reg = await (
      await fetch(disco.registration_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'mcp-smoke',
          redirect_uris: [REDIRECT],
          token_endpoint_auth_method: 'none',
          grant_types: ['authorization_code'],
          response_types: ['code'],
        }),
      })
    ).json();
    check('dynamic client registration', Boolean(reg.client_id));

    const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PERSONA_PASSWORD }),
    });
    const cookie = (loginRes.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    check(`login as ${EMAIL}`, loginRes.ok && cookie.length > 0, cookie ? undefined : 'seed with `bun run indigo personas`');

    const verifier = b64url(randomBytes(32));
    const authUrl = new URL(disco.authorization_endpoint);
    authUrl.search = new URLSearchParams({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: REDIRECT,
      scope: 'openid profile email',
      state: 'smoke',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    const authRes = await fetch(authUrl, { headers: { cookie }, redirect: 'manual' });
    const location = authRes.headers.get('location') ?? '';
    const code = location.startsWith(REDIRECT) ? new URL(location).searchParams.get('code') : null;
    check('PKCE authorize → code', Boolean(code));

    const token = await (
      await fetch(disco.token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code ?? '',
          redirect_uri: REDIRECT,
          client_id: reg.client_id,
          code_verifier: verifier,
        }),
      })
    ).json();
    check('token exchange', Boolean(token.access_token));

    const oauthClient = await connectClient({ Authorization: `Bearer ${token.access_token}` });
    const me = await oauthClient.callTool({ name: 'auth.me', arguments: {} });
    check(`OAuth token acts as ${EMAIL}`, textOf(me as never).includes(EMAIL));
    await oauthClient.close();
  } catch (err) {
    check('OAuth flow', false, String(err).slice(0, 120));
  }
}

console.log(`\n${failures === 0 ? '✓ MCP smoke: all checks passed' : `✗ MCP smoke: ${failures} check(s) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
