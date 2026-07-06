/**
 * MCP server integration tests — registry, hybrid surface, meta-tools, and
 * the full JSON-RPC transport round-trip.
 *
 * Three regressions from live testing are locked down here:
 *   1. Zod `.transform()` inputs crashed JSON Schema conversion (500'd the
 *      whole endpoint) → toTool must degrade gracefully.
 *   2. Response bodies were truncated to 0 bytes when the transport closed
 *      before the stream flushed → JSON-mode round-trip must return a body.
 *   3. tRPC's caller proxy has no `has` trap, so `in`-based path walking
 *      resolved nothing → discovered tools must actually invoke.
 */

import { describe, expect, it, vi, beforeAll } from 'vitest';
import type { McpInvocationContext } from '../types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/core/lib/infra/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/server/db', () => ({ db: {} }));

vi.mock('@/generated/procedure-docs', () => ({
  PROCEDURE_DOCS: { 'lab.jsdocOnly': 'Extracted from JSDoc' },
}));

vi.mock('@/generated/module-mcp', async () => {
  const { z } = await import('zod');
  return {
    moduleMcpTools: [
      {
        name: 'lab.composite',
        description: 'A composite test tool',
        inputSchema: z.object({}),
        promoted: true,
        invoke: async () => ({ composite: true }),
      },
    ],
  };
});

// Test router replaces the real appRouter. Built inside the factory because
// vi.mock is hoisted above imports.
vi.mock('@/server/routers/_app', async () => {
  const { initTRPC, TRPCError } = await import('@trpc/server');
  const { z } = await import('zod');
  const { runAuthMiddleware } = await import('@/core/lib/module/module-hooks');

  const t = initTRPC
    .context<{ session: { user: Record<string, unknown> } | null }>()
    .meta<Record<string, unknown>>()
    .create();

  const guarded = t.procedure.use(async ({ ctx, next }) => {
    if (!ctx.session?.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in' });
    // Mirrors src/server/trpc.ts — hooks receive { session: { user } }.
    await runAuthMiddleware({ session: { user: ctx.session.user as { id: string } } });
    return next();
  });

  const appRouter = t.router({
    lab: t.router({
      echo: t.procedure
        .meta({ mcp: { description: 'Echo the message back', readOnly: true } })
        .input(z.object({ msg: z.string() }))
        .query(({ input }) => ({ echoed: input.msg })),
      hidden: t.procedure.meta({ mcp: false }).query(() => 'never'),
      jsdocOnly: t.procedure.query(() => 'has jsdoc, not promoted'),
      stub: t.procedure.query(() => 'no docs at all'),
      transformed: t.procedure
        .input(z.object({ when: z.string().transform((s) => new Date(s)) }))
        .query(({ input }) => input.when.getUTCFullYear()),
      scalar: t.procedure.input(z.string()).query(({ input }) => input.toUpperCase()),
      secret: guarded.query(() => 'classified'),
      streamy: t.procedure.subscription(async function* () {
        yield 1;
      }),
    }),
  });

  return { appRouter };
});

// discover.ts pulls createCallerFactory (and Context type) from server/trpc —
// the real module drags in auth/db/rate-limiting. Provide just the factory.
vi.mock('@/server/trpc', async () => {
  const { initTRPC } = await import('@trpc/server');
  const t = initTRPC.create();
  return { createCallerFactory: t.createCallerFactory };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const AGENT: McpInvocationContext = {
  user: {
    id: 'user-1',
    email: 'agent@test.local',
    role: 'superadmin',
    banned: false,
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  organizationId: 'org-1',
  headers: new Headers(),
};

const ANON: McpInvocationContext = { user: null, organizationId: null, headers: new Headers() };

async function rpc(
  invocation: McpInvocationContext,
  method: string,
  params: Record<string, unknown>,
): Promise<{ status: number; body: { result?: Record<string, unknown>; error?: { message: string } } }> {
  const { createMcpServer, buildAuthInfoForInvocation } = await import('../server');
  const { WebStandardStreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
  );

  const server = await createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const request = new Request('http://test.local/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  try {
    const response = await transport.handleRequest(request, {
      authInfo: buildAuthInfoForInvocation(invocation, 'test-token'),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  } finally {
    void server.close().catch(() => undefined);
    void transport.close().catch(() => undefined);
  }
}

function resultText(body: { result?: Record<string, unknown> }): string {
  const content = body.result?.content as Array<{ type: string; text?: string }> | undefined;
  return content?.find((c) => c.type === 'text')?.text ?? '';
}

// ─── Discovery + registry ───────────────────────────────────────────────────

describe('discovery', () => {
  it('discovers procedures, skips subscriptions and mcp:false opt-outs', async () => {
    const { discoverProcedureTools } = await import('../discover');
    const tools = discoverProcedureTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('lab.echo');
    expect(names).toContain('lab.stub');
    expect(names).not.toContain('lab.hidden');
    expect(names).not.toContain('lab.streamy');
  });

  it('promotes only explicitly-annotated procedures', async () => {
    const { discoverProcedureTools } = await import('../discover');
    const byName = new Map(discoverProcedureTools().map((t) => [t.name, t]));
    expect(byName.get('lab.echo')?.promoted).toBe(true);
    expect(byName.get('lab.jsdocOnly')?.promoted).toBe(false);
  });

  it('falls back to extracted JSDoc for descriptions without promoting', async () => {
    const { discoverProcedureTools } = await import('../discover');
    const byName = new Map(discoverProcedureTools().map((t) => [t.name, t]));
    expect(byName.get('lab.jsdocOnly')?.description).toBe('Extracted from JSDoc');
    expect(byName.get('lab.stub')?.description).toMatch(/lab\.stub/);
  });
});

// ─── Transport round-trip (regressions #2 and #3) ───────────────────────────

describe('JSON-RPC round-trip', () => {
  it('tools/list returns a non-empty body with promoted + built-in tools only', async () => {
    const { status, body } = await rpc(AGENT, 'tools/list', {});
    expect(status).toBe(200);
    const names = (body.result?.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['lab.echo', 'lab.composite', 'search_tools', 'describe_tool', 'invoke_tool', 'view_image']),
    );
    expect(names).not.toContain('lab.jsdocOnly'); // unpromoted stays out of the flat list
  });

  it('tools/call resolves a discovered procedure through the caller proxy', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'lab.echo', arguments: { msg: 'ping' } });
    expect(resultText(body)).toContain('"echoed": "ping"');
    expect(body.result?.isError).toBeUndefined();
  });

  it('unlisted registry tools remain directly callable', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'lab.jsdocOnly', arguments: {} });
    expect(resultText(body)).toContain('has jsdoc, not promoted');
  });

  it('transform inputs neither crash the catalog nor the call (regression #1)', async () => {
    const list = await rpc(AGENT, 'tools/list', {});
    expect(list.status).toBe(200); // catalog assembly did not throw

    const { body } = await rpc(AGENT, 'tools/call', {
      name: 'lab.transformed',
      arguments: { when: '2026-06-01T00:00:00.000Z' },
    });
    expect(resultText(body)).toContain('2026');
  });

  it('non-object inputs are wrapped as { input } and unwrapped on call', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'lab.scalar', arguments: { input: 'shout' } });
    expect(resultText(body)).toContain('SHOUT');
  });

  it('rejects invalid input with a validation error, not a crash', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'lab.echo', arguments: { msg: 123 } });
    expect(body.result?.isError).toBe(true);
    expect(resultText(body)).toContain("Invalid input for 'lab.echo'");
  });

  it('maps TRPCError to a clean tool error for anonymous callers', async () => {
    const { body } = await rpc(ANON, 'tools/call', { name: 'lab.secret', arguments: {} });
    expect(body.result?.isError).toBe(true);
    expect(resultText(body)).toContain('[UNAUTHORIZED]');
  });
});

// ─── Auth-middleware hook contract ───────────────────────────────────────────

describe('synthetic session vs registered auth hooks', () => {
  it('hooks receive the full user contract from MCP invocations', async () => {
    const { registerAuthMiddleware } = await import('@/core/lib/module/module-hooks');
    const seen: Array<Record<string, unknown>> = [];
    registerAuthMiddleware('test-2fa-shape', async (ctx) => {
      seen.push({ ...ctx.session.user });
    });

    await rpc(AGENT, 'tools/call', { name: 'lab.secret', arguments: {} });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: 'user-1', email: 'agent@test.local', role: 'superadmin', banned: false });
  });
});

// ─── Meta-tools ──────────────────────────────────────────────────────────────

describe('meta-tools', () => {
  it('search_tools finds registry tools by keyword and marks listing state', async () => {
    const { body } = await rpc(AGENT, 'tools/call', {
      name: 'search_tools',
      arguments: { query: 'echo message' },
    });
    const structured = body.result?.structuredContent as { results: Array<{ name: string; listed: boolean }> };
    const echo = structured.results.find((r) => r.name === 'lab.echo');
    expect(echo).toBeDefined();
    expect(echo?.listed).toBe(true);
  });

  it('describe_tool returns a JSON Schema for any registry tool', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'describe_tool', arguments: { name: 'lab.echo' } });
    const structured = body.result?.structuredContent as { inputSchema: { properties?: Record<string, unknown> } };
    expect(structured.inputSchema.properties).toHaveProperty('msg');
  });

  it('invoke_tool delegates through the shared pipeline', async () => {
    const { body } = await rpc(AGENT, 'tools/call', {
      name: 'invoke_tool',
      arguments: { name: 'lab.echo', input: { msg: 'via-invoke' } },
    });
    expect(resultText(body)).toContain('"echoed": "via-invoke"');
  });

  it('invoke_tool refuses to invoke built-ins (no recursion)', async () => {
    const { body } = await rpc(AGENT, 'tools/call', {
      name: 'invoke_tool',
      arguments: { name: 'invoke_tool', input: {} },
    });
    expect(body.result?.isError).toBe(true);
  });
});

// ─── view_image guards ───────────────────────────────────────────────────────

describe('view_image', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const path = new URL(String(url)).pathname;
        if (path === '/ok.png') {
          return new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'content-type': 'image/png' },
          });
        }
        if (path === '/page.html') {
          return new Response('<html></html>', { headers: { 'content-type': 'text/html' } });
        }
        return new Response('nope', { status: 404 });
      }),
    );
  });

  it('returns image content + metadata text for a same-origin image', async () => {
    const { body } = await rpc(AGENT, 'tools/call', { name: 'view_image', arguments: { path: '/ok.png' } });
    const content = body.result?.content as Array<{ type: string; mimeType?: string; data?: string }>;
    const img = content.find((c) => c.type === 'image');
    expect(img?.mimeType).toBe('image/png');
    expect(img?.data?.length).toBeGreaterThan(0);
  });

  it('blocks /api paths without fetching', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    const { body } = await rpc(AGENT, 'tools/call', { name: 'view_image', arguments: { path: '/api/health' } });
    expect(body.result?.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects absolute URLs and non-image content types', async () => {
    const abs = await rpc(AGENT, 'tools/call', {
      name: 'view_image',
      arguments: { path: 'https://evil.example/x.png' },
    });
    expect(abs.body.result?.isError).toBe(true);

    const html = await rpc(AGENT, 'tools/call', { name: 'view_image', arguments: { path: '/page.html' } });
    expect(html.body.result?.isError).toBe(true);
    expect(resultText(html.body)).toContain('Not an image');
  });
});
