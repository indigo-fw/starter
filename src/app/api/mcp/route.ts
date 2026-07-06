/**
 * Indigo MCP (Model Context Protocol) endpoint.
 *
 *   Provision an API key with the `mcp:invoke` scope, then connect with:
 *     Authorization: Bearer <key>
 *     Content-Type:  application/json
 *
 * Stateless mode — one transport per request, no session continuity. Each
 * request is independently authenticated. State (auth, active org) lives on
 * the API key, not in the server.
 *
 * See `src/core/lib/mcp/` for the discovery + auth + server layers.
 */

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateMcpRequest, buildAnonymousContext, buildWwwAuthenticate } from '@/core/lib/mcp/auth';
import { buildAuthInfoForInvocation, createMcpServer } from '@/core/lib/mcp/server';
import type { McpInvocationContext } from '@/core/lib/mcp/types';
import { createLogger } from '@/core/lib/infra/logger';

const logger = createLogger('mcp:route');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id',
    'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
  };
}

function jsonError(message: string, status: number, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function handle(request: Request): Promise<Response> {
  // Dev-only: unauthenticated requests get an anonymous context so agents
  // can test the logged-out experience (public tools work, protected ones
  // fail with UNAUTHORIZED). In production a missing header must stay a 401
  // with the WWW-Authenticate challenge — that's what triggers MCP clients'
  // OAuth login popup.
  const hasAuthHeader = Boolean(request.headers.get('authorization'));
  if (!hasAuthHeader && process.env.NODE_ENV !== 'production') {
    return runMcp(request, buildAnonymousContext(request));
  }

  const authResult = await authenticateMcpRequest(request);
  if (!authResult.ok) {
    // The WWW-Authenticate challenge on 401 is what makes MCP clients
    // (Claude Code, claude.ai) automatically launch the OAuth login popup.
    const challenge =
      authResult.status === 401 ? { 'WWW-Authenticate': buildWwwAuthenticate(request) } : undefined;
    return jsonError(authResult.message, authResult.status, challenge);
  }

  return runMcp(request, authResult.context);
}

async function runMcp(request: Request, context: McpInvocationContext): Promise<Response> {
  // Server AND transport are per-request: Server.connect() binds one
  // transport, so a shared Server races under concurrency. The expensive
  // registry is cached inside createMcpServer.
  const server = await createMcpServer();
  // Stateless + JSON mode: the response body is fully materialised before
  // handleRequest resolves, so closing the transport afterwards is safe.
  // (SSE mode would return a live stream that our `finally` close truncates.)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const authInfo = buildAuthInfoForInvocation(context, '<redacted>');
    const response = await transport.handleRequest(request, { authInfo });

    // Merge CORS headers onto the transport's response.
    const merged = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders())) merged.set(k, v as string);
    return new Response(response.body, { status: response.status, headers: merged });
  } catch (err) {
    logger.error('MCP transport error', { error: String(err) });
    return jsonError('Internal MCP server error', 500);
  } finally {
    // Stateless: both are per-request — free the transport's in-memory state
    // and the server bound to it.
    void server.close().catch(() => undefined);
    void transport.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
