/**
 * Indigo MCP (Model Context Protocol) types.
 *
 * Two ways modules contribute MCP tools:
 *
 *   1. **Auto-discovery from tRPC.** Every tRPC procedure becomes an MCP tool
 *      unless its `.meta({ mcp: false })` opts out. Tool name = dotted router
 *      path (e.g. `blog.posts.update`). Description = `meta.mcp.description`.
 *
 *   2. **Composite tools** declared in a module's `mcp.ts` (exported via
 *      `ModuleConfig.mcpTools`). Use these for multi-step workflows agents
 *      should treat as a single atomic action.
 */

import type { ZodTypeAny } from 'zod';

/** tRPC `.meta()` payload for MCP. Set to `false` to hide a procedure. */
export type McpMeta =
  | false
  | {
      /** Description shown to the agent. Required for a procedure to appear in `tools/list`. */
      description?: string;
      /** Optional tags for grouping. */
      tags?: string[];
      /** Marks a non-mutating tool — agents may prefer these for exploration. */
      readOnly?: boolean;
    };

/** tRPC `.meta()` payload (just MCP fields for now — extend here if other facets land). */
export interface IndigoTrpcMeta {
  mcp?: McpMeta;
}

/**
 * Reference to a module's composite-tool export, used in `module.config.ts`.
 *
 * The pointed-to module must export an array of `ResolvedMcpTool` (use
 * `buildCompositeTool` from `@/core/lib/mcp/server` to construct them):
 *
 * ```ts
 * // src/core-blog/mcp.ts
 * import { buildCompositeTool } from '@/core/lib/mcp/server';
 * export const blogMcpTools = [
 *   buildCompositeTool({ name: 'blog.publishPost', description: '...', inputSchema: z.object({...}) },
 *     async (input, ctx) => { ... }),
 * ];
 * ```
 */
export interface McpToolModuleRef {
  /** Exported variable name (e.g. `blogMcpTools`). */
  name: string;
  /** Import path (e.g. `@/core-blog/mcp`). */
  from: string;
}

/** Static descriptor for a composite tool — pass to `buildCompositeTool` along with a handler. */
export interface McpToolEntry {
  /** Tool name. Must be namespaced (e.g. `blog.publishPost`). */
  name: string;
  /** Description shown to the agent. */
  description: string;
  /** Zod schema for the tool's input. */
  inputSchema: ZodTypeAny;
  /** Optional tags for grouping. */
  tags?: string[];
  /** Marks a non-mutating tool. */
  readOnly?: boolean;
}

/** The authenticated principal a tool call acts as. */
export interface McpUser {
  id: string;
  email: string;
  role: string;
  banned: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/** Runtime context passed to tool handlers. */
export interface McpInvocationContext {
  /**
   * Resolved user, or `null` for anonymous access (dev-only — lets agents
   * test the logged-out experience; protected procedures fail with
   * UNAUTHORIZED exactly as they would for a logged-out visitor).
   */
  user: McpUser | null;
  /** Organization scope, or `null` when anonymous. */
  organizationId: string | null;
  /** Original request headers. */
  headers: Headers;
}

/** Resolved tool ready for the MCP server to register. */
export interface ResolvedMcpTool {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  readOnly?: boolean;
  /**
   * Promoted tools appear flat in `tools/list`. Non-promoted tools stay in
   * the registry, discoverable via `search_tools` and callable via
   * `invoke_tool`. A tRPC procedure is promoted by giving it an explicit
   * `.meta({ mcp: { description } })`; composite tools are always promoted.
   */
  promoted?: boolean;
  /** Invokes the tool with already-validated input. */
  invoke: (input: unknown, ctx: McpInvocationContext) => Promise<unknown>;
}

/** Handler signature for composite MCP tools. */
export type McpToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: McpInvocationContext,
) => Promise<TOutput>;
