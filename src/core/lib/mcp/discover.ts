/**
 * Auto-discovery of MCP tools from a tRPC router.
 *
 * Walks `router._def.procedures` (a flat map keyed by dotted path) and emits one
 * resolved tool per procedure. A procedure opts out by setting
 * `.meta({ mcp: false })`. Everything else is included by default — the
 * convention is that writing a tRPC procedure ALSO makes it agent-callable.
 *
 * Authorisation is enforced at tRPC time (the procedure's own middleware
 * chain runs), so an under-privileged agent simply sees FORBIDDEN at call
 * time. We don't filter the catalog by role to keep the agent's tool list
 * stable across users.
 */

import { z, type ZodTypeAny } from 'zod';
import type { AnyRouter } from '@trpc/server';
import { appRouter } from '@/server/routers/_app';
import { db } from '@/server/db';
import { createCallerFactory, type Context } from '@/server/trpc';
import { createLogger } from '@/core/lib/infra/logger';
import { PROCEDURE_DOCS } from '@/generated/procedure-docs';
import type { McpInvocationContext, McpMeta, ResolvedMcpTool } from './types';

const logger = createLogger('mcp:discover');

interface ProcedureDef {
  meta?: { mcp?: McpMeta };
  inputs?: unknown[];
  type?: 'query' | 'mutation' | 'subscription';
}

interface MaybeProcedure {
  _def?: ProcedureDef;
}

/**
 * Walk a tRPC caller proxy by dotted path to reach a leaf procedure.
 *
 * The caller is a recursive Proxy without a `has` trap, so `part in cursor`
 * always fails — access properties directly and null-check instead. Paths
 * come from the router's own procedure map, so they're always valid.
 */
function callerProcByPath(
  caller: Record<string, unknown>,
  path: string,
): ((input: unknown) => Promise<unknown>) | null {
  const parts = path.split('.');
  let cursor: unknown = caller;
  for (const part of parts) {
    if (cursor == null) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === 'function' ? (cursor as (input: unknown) => Promise<unknown>) : null;
}

const EMPTY_INPUT = z.object({}).optional();

/** Extract the declared Zod input schema (first .input() call). */
function getProcedureInput(proc: MaybeProcedure): ZodTypeAny {
  const inputs = proc._def?.inputs;
  if (!inputs || inputs.length === 0) return EMPTY_INPUT;
  const first = inputs[0];
  if (first && typeof (first as ZodTypeAny).safeParse === 'function') {
    return first as ZodTypeAny;
  }
  return EMPTY_INPUT;
}

/**
 * Build a tRPC `Context` matching what `createTRPCContext()` would produce for
 * a real HTTP request, but seeded from the MCP API key instead of the cookie
 * session. The auth middleware reads `ctx.session.user` — we hand it a synthetic
 * session that mirrors the `customSession` plugin's shape.
 */
function buildTrpcContext(invocation: McpInvocationContext): Context {
  // Anonymous invocation (dev-only) — null session, exactly like a logged-out
  // HTTP request. protectedProcedure fails with UNAUTHORIZED as it should.
  const session = invocation.user
    ? ({
        user: invocation.user,
        // The session-shaped half is consulted by org-aware procedures.
        session: {
          activeOrganizationId: invocation.organizationId,
        },
        // Tag so downstream code (audit logs, rate limit) can recognise an MCP origin.
        __mcp: true,
      } as unknown as Context['session'])
    : null;

  return {
    session,
    db,
    headers: invocation.headers,
    activeOrganizationId: invocation.organizationId,
  };
}

/**
 * Discover all MCP tools auto-derivable from the root tRPC router.
 *
 * @param router  Defaults to the project's `appRouter`. Injectable for tests.
 */
export function discoverProcedureTools(
  router: AnyRouter = appRouter as unknown as AnyRouter,
): ResolvedMcpTool[] {
  const procedures = (router._def as { procedures?: Record<string, MaybeProcedure> }).procedures ?? {};
  const createCaller = createCallerFactory(router);

  const tools: ResolvedMcpTool[] = [];

  for (const [path, proc] of Object.entries(procedures)) {
    const meta = proc._def?.meta?.mcp;
    if (meta === false) continue;
    if (proc._def?.type === 'subscription') continue;

    const metaObj = meta && typeof meta === 'object' ? meta : null;
    // Description precedence: explicit meta (promotes) → extracted JSDoc
    // (search corpus, no promotion) → generated stub.
    const description =
      metaObj?.description ?? PROCEDURE_DOCS[path] ?? defaultDescription(path, proc._def?.type);
    const inputSchema = getProcedureInput(proc);

    tools.push({
      name: path,
      description,
      inputSchema,
      readOnly: metaObj?.readOnly,
      // An explicit description promotes the tool to the flat tools/list.
      promoted: Boolean(metaObj?.description),
      invoke: async (input, invocationCtx) => {
        const caller = createCaller(buildTrpcContext(invocationCtx)) as Record<string, unknown>;
        const fn = callerProcByPath(caller, path);
        if (!fn) {
          throw new Error(`MCP: failed to resolve tRPC procedure '${path}'`);
        }
        return fn(input);
      },
    });
  }

  logger.info('Discovered MCP tools from tRPC', { count: tools.length });
  return tools;
}

function defaultDescription(path: string, type: ProcedureDef['type']): string {
  return `${type === 'mutation' ? 'Mutation' : 'Query'} ${path}`;
}
