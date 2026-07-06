/**
 * Indigo MCP server adapter.
 *
 * The tool REGISTRY (discovery + JSON Schema conversion — the expensive part)
 * is built once per process and cached. The `Server` instance is built fresh
 * PER REQUEST: `Server.connect(transport)` binds exactly one transport, so a
 * shared instance would race under concurrent requests — request B's connect
 * would steal the transport out from under request A's in-flight response.
 * Handler registration is two closures; per-request construction is cheap.
 *
 * ## Hybrid tool surface
 *
 * `tools/list` does NOT dump every tRPC procedure (that was a ~300KB catalog
 * agents had to swallow each session). Instead it lists:
 *
 *   - **Promoted tools** — procedures with an explicit
 *     `.meta({ mcp: { description } })` plus module composite tools. Small,
 *     curated, high-quality. Annotating a procedure IS the promotion.
 *   - **Built-in meta-tools** — `search_tools`, `describe_tool`,
 *     `invoke_tool` give agents on-demand access to the full registry (every
 *     procedure remains callable), and `view_image` returns same-origin
 *     images as MCP image content so agents can visually verify uploads.
 *
 * `tools/call` validates input via the tool's Zod schema, then invokes the
 * underlying handler with the per-request invocation context (passed through
 * `AuthInfo.extra.mcp`).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { z, ZodObject, ZodOptional, type ZodTypeAny } from 'zod';
import { TRPCError } from '@trpc/server';

import { createLogger } from '@/core/lib/infra/logger';
import { discoverProcedureTools } from './discover';
import type { McpInvocationContext, McpToolEntry, ResolvedMcpTool } from './types';

const logger = createLogger('mcp:server');

const SERVER_NAME = 'indigo-mcp';
const SERVER_VERSION = '0.1.0';

const INVOCATION_KEY = 'indigo.mcp.invocation';

let registryPromise: Promise<BuiltRegistry> | null = null;

/** Build the tool registry once per process (concurrent-safe via shared promise). */
function getRegistry(): Promise<BuiltRegistry> {
  registryPromise ??= buildRegistry().then((built) => {
    logger.info('MCP tool registry built', { tools: built.tools.length });
    return built;
  });
  return registryPromise;
}

/** Build a fresh per-request MCP server bound to the cached registry. */
export async function createMcpServer(): Promise<Server> {
  const { registry, tools } = await getRegistry();

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const invocation = extra.authInfo?.extra?.[INVOCATION_KEY] as McpInvocationContext | undefined;
    if (!invocation) {
      // Should never happen — the route handler always populates this.
      return errorResult('Internal error: MCP invocation context missing');
    }
    return callTool(registry, name, args, invocation);
  });

  return server;
}

/**
 * Shared call pipeline — used by the `tools/call` handler and by the
 * `invoke_tool` built-in, so both paths get identical validation and error
 * mapping. Direct calls to non-promoted registry tools are allowed (they're
 * just not listed), which lets sophisticated clients skip the indirection.
 */
async function callTool(
  registry: RegistryMap,
  name: string,
  args: unknown,
  invocation: McpInvocationContext,
): Promise<CallToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return errorResult(`Unknown tool '${name}'. Use search_tools to find available tools.`);
  }

  if (tool.invokeRaw) {
    const unwrappedRaw = unwrapInput(tool.inputSchema, args);
    const parsedRaw = tool.inputSchema.safeParse(unwrappedRaw);
    if (!parsedRaw.success) {
      return errorResult(`Invalid input for '${name}': ${parsedRaw.error.message}`);
    }
    try {
      return await tool.invokeRaw(parsedRaw.data, invocation);
    } catch (err) {
      return mapErrorToResult(name, err);
    }
  }

  const unwrapped = unwrapInput(tool.inputSchema, args);
  const parsed = tool.inputSchema.safeParse(unwrapped);
  if (!parsed.success) {
    return errorResult(`Invalid input for '${name}': ${parsed.error.message}`);
  }

  try {
    // Pass the RAW input, not parsed.data: procedure-backed tools re-validate
    // through tRPC's own input pipeline, and feeding it already-transformed
    // values would run `.transform()` schemas twice (string→Date→boom).
    // Composite tools parse internally (see buildCompositeTool).
    const result = await tool.invoke(unwrapped, invocation);
    return formatResult(result);
  } catch (err) {
    return mapErrorToResult(name, err);
  }
}

/** Inject the per-request invocation context into AuthInfo `extra`. */
export function buildAuthInfoForInvocation(invocation: McpInvocationContext, token: string): {
  token: string;
  clientId: string;
  scopes: string[];
  extra: Record<string, unknown>;
} {
  return {
    token,
    clientId: invocation.user
      ? `mcp:${invocation.user.id}@${invocation.organizationId}`
      : 'mcp:anonymous',
    scopes: invocation.user ? ['mcp:invoke'] : [],
    extra: { [INVOCATION_KEY]: invocation },
  };
}

// ─── internals ──────────────────────────────────────────────────────────────

/** Registry tools may carry a raw handler that returns a full CallToolResult
 *  (needed for non-JSON content like images). */
type RegistryTool = ResolvedMcpTool & {
  invokeRaw?: (input: unknown, ctx: McpInvocationContext) => Promise<CallToolResult>;
};

type RegistryMap = Map<string, RegistryTool>;

interface BuiltRegistry {
  registry: RegistryMap;
  tools: Tool[];
}

async function buildRegistry(): Promise<BuiltRegistry> {
  const procedureTools = discoverProcedureTools();
  const compositeTools = await loadCompositeTools();

  const registry: RegistryMap = new Map();

  for (const t of [...procedureTools, ...compositeTools]) {
    if (registry.has(t.name)) {
      // `indigo:sync` enforces this at sync time too; this is a runtime backstop.
      logger.warn('Duplicate MCP tool name — keeping first registration', { name: t.name });
      continue;
    }
    registry.set(t.name, t);
  }

  // Built-ins go in last (they close over the registry) and always win on
  // name collisions — a procedure named `search_tools` would be a mistake.
  for (const t of createBuiltinTools(registry)) {
    registry.set(t.name, t);
  }

  // Flat catalog = built-ins + promoted tools only. The long tail stays
  // reachable via search_tools/invoke_tool without bloating every session.
  const tools: Tool[] = [];
  for (const t of registry.values()) {
    if (t.promoted) tools.push(toTool(t));
  }

  const promotedCount = tools.length;
  logger.info('MCP catalog assembled', {
    total: registry.size,
    listed: promotedCount,
  });

  return { registry, tools };
}

// ─── Built-in tools ─────────────────────────────────────────────────────────

const BUILTIN_NAMES = new Set(['search_tools', 'describe_tool', 'invoke_tool', 'view_image']);

function createBuiltinTools(registry: RegistryMap): RegistryTool[] {
  const searchTools: RegistryTool = {
    name: 'search_tools',
    description:
      'Search the full tool registry (every API action of this app, not just the tools listed upfront). ' +
      'Returns matching tool names + descriptions ranked by relevance. ' +
      'Follow up with describe_tool for the input schema, then invoke_tool to call it.',
    inputSchema: z.object({
      query: z.string().min(1).max(200).describe('Keywords or a dotted path fragment, e.g. "blog post publish" or "users."'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results, default 15.'),
    }),
    readOnly: true,
    promoted: true,
    invoke: async (input) => {
      const { query, limit = 15 } = input as { query: string; limit?: number };
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const scored: Array<{ name: string; description: string; listed: boolean; score: number }> = [];

      for (const t of registry.values()) {
        if (BUILTIN_NAMES.has(t.name)) continue;
        const name = t.name.toLowerCase();
        const desc = t.description.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (name === term) score += 10;
          else if (name.startsWith(term)) score += 6;
          else if (name.includes(term)) score += 4;
          if (desc.includes(term)) score += 1;
        }
        if (score > 0) {
          scored.push({ name: t.name, description: t.description, listed: Boolean(t.promoted), score });
        }
      }

      // Ties: shorter name first — `cms.list` is almost always a better answer
      // than `affiliates.adminList` for a generic query.
      scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
      const results = scored.slice(0, limit).map(({ name, description, listed }) => ({ name, description, listed }));
      return { total: scored.length, results };
    },
  };

  const describeTool: RegistryTool = {
    name: 'describe_tool',
    description:
      'Get the full JSON Schema input definition and description for any tool in the registry (found via search_tools). ' +
      'Call this before invoke_tool to know what arguments to pass.',
    inputSchema: z.object({
      name: z.string().min(1).max(200).describe('Exact tool name, e.g. "cms.list".'),
    }),
    readOnly: true,
    promoted: true,
    invoke: async (input) => {
      const { name } = input as { name: string };
      const tool = registry.get(name);
      if (!tool) {
        throw new Error(`Unknown tool '${name}'. Use search_tools to find available tools.`);
      }
      const descriptor = toTool(tool);
      return {
        name: tool.name,
        description: tool.description,
        readOnly: tool.readOnly ?? false,
        inputSchema: descriptor.inputSchema,
      };
    },
  };

  const invokeTool: RegistryTool = {
    name: 'invoke_tool',
    description:
      'Invoke any tool from the registry by name with the given input (use search_tools + describe_tool first). ' +
      'Authorization is enforced per call — actions your credential cannot perform fail with FORBIDDEN.',
    inputSchema: z.object({
      name: z.string().min(1).max(200).describe('Exact tool name, e.g. "cms.list".'),
      input: z.unknown().optional().describe('Arguments matching the tool\'s input schema (see describe_tool).'),
    }),
    promoted: true,
    invoke: async () => {
      throw new Error('invoke_tool must run through invokeRaw');
    },
    invokeRaw: async (input, invocation) => {
      const { name, input: toolInput } = input as { name: string; input?: unknown };
      if (BUILTIN_NAMES.has(name)) {
        return errorResult(`'${name}' is a built-in — call it directly, not through invoke_tool.`);
      }
      return callTool(registry, name, toolInput ?? {}, invocation);
    },
  };

  const viewImage: RegistryTool = {
    name: 'view_image',
    description:
      'Fetch an image from this app (root-relative path, e.g. "/uploads/avatars/x.webp") and return the actual ' +
      'image content so you can visually verify it — rendering, cropping, that an upload round-tripped correctly. ' +
      'Same-origin only; /api paths are blocked; max 4MB.',
    inputSchema: z.object({
      path: z.string().min(1).max(2048).describe('Root-relative image path on this app, e.g. "/uploads/avatars/abc.webp".'),
    }),
    readOnly: true,
    promoted: true,
    invoke: async () => {
      throw new Error('view_image must run through invokeRaw');
    },
    invokeRaw: async (input) => fetchImageAsContent((input as { path: string }).path),
  };

  return [searchTools, describeTool, invokeTool, viewImage];
}

const VIEW_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Same-origin image fetch with SSRF guards — no proxying, no API access. */
async function fetchImageAsContent(rawPath: string): Promise<CallToolResult> {
  if (!rawPath.startsWith('/') || rawPath.startsWith('//')) {
    return errorResult('Path must be root-relative (e.g. "/uploads/avatar.webp") — absolute URLs are not allowed.');
  }
  const path = rawPath.split(/[?#]/)[0];
  if (path.startsWith('/api/') || path === '/api') {
    return errorResult('API paths cannot be fetched via view_image.');
  }

  const origin = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`
  ).replace(/\/$/, '');

  let response: Response;
  try {
    response = await fetch(`${origin}${rawPath}`, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return errorResult(`Failed to fetch image: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    return errorResult(`Image fetch returned ${response.status} for '${rawPath}'.`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!mimeType.startsWith('image/')) {
    return errorResult(`Not an image: content-type is '${mimeType || 'unknown'}'.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > VIEW_IMAGE_MAX_BYTES) {
    return errorResult(`Image is ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB — over the 4MB view_image limit.`);
  }

  return {
    content: [
      { type: 'image', data: buffer.toString('base64'), mimeType },
      { type: 'text', text: `${rawPath} — ${mimeType}, ${(buffer.byteLength / 1024).toFixed(1)}KB` },
    ],
  };
}

async function loadCompositeTools(): Promise<ResolvedMcpTool[]> {
  try {
    // Generated by `bun run indigo:sync` from each module's `mcpTools` field.
    const mod = (await import('@/generated/module-mcp')) as {
      moduleMcpTools?: ResolvedMcpTool[];
    };
    return mod.moduleMcpTools ?? [];
  } catch {
    // Sync hasn't run yet, or no module contributes composite tools. Fine.
    return [];
  }
}

/**
 * Convert a `ResolvedMcpTool` to an MCP `Tool` descriptor.
 *
 * MCP requires `inputSchema` to be a JSON Schema object with `type: 'object'`.
 * If the procedure's input is already a ZodObject, we use its shape directly.
 * Otherwise we wrap it as `{ input: <schema> }` so the wire shape stays valid
 * (and `unwrapInput` reverses the wrap at call time).
 */
function toTool(t: ResolvedMcpTool): Tool {
  const schema = effectiveInputSchema(t.inputSchema);
  // Zod 4's converter throws on constructs JSON Schema can't express
  // (transforms, custom refinements). `io: 'input'` uses the pre-transform
  // side (correct for input validation); `unrepresentable: 'any'` degrades
  // exotic leaves to {} instead of throwing. The catch is a last-resort
  // backstop so one pathological procedure never 500s the whole catalog.
  let jsonSchema: Record<string, unknown>;
  try {
    jsonSchema = z.toJSONSchema(schema, {
      target: 'draft-7',
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
  } catch {
    logger.warn('Input schema not representable as JSON Schema — using permissive fallback', { tool: t.name });
    jsonSchema = { type: 'object', additionalProperties: true };
  }

  return {
    name: t.name,
    description: t.description,
    inputSchema: jsonSchema as Tool['inputSchema'],
    annotations: t.readOnly ? { readOnlyHint: true } : undefined,
  };
}

function effectiveInputSchema(schema: ZodTypeAny): ZodTypeAny {
  const inner = unwrapOptional(schema);
  if (inner instanceof ZodObject) return schema;
  // Non-object input — wrap so JSON Schema produces a valid object envelope.
  return z.object({ input: schema });
}

function unwrapOptional(schema: ZodTypeAny): ZodTypeAny {
  // Zod 4: .unwrap() returns the v4 `$ZodType` base — cast back to the public
  // `ZodTypeAny` we use everywhere else.
  return schema instanceof ZodOptional ? (schema.unwrap() as unknown as ZodTypeAny) : schema;
}

function unwrapInput(schema: ZodTypeAny, raw: unknown): unknown {
  const inner = unwrapOptional(schema);
  if (inner instanceof ZodObject) return raw ?? {};
  // We wrapped at schema time — unwrap here.
  if (raw && typeof raw === 'object' && 'input' in (raw as object)) {
    return (raw as { input: unknown }).input;
  }
  return raw;
}

function formatResult(result: unknown): CallToolResult {
  const text = serialiseResult(result);
  return {
    content: [{ type: 'text', text }],
    // Also expose structured form for clients that prefer it.
    structuredContent: result && typeof result === 'object' ? (result as Record<string, unknown>) : { value: result },
  };
}

function serialiseResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, replacer, 2);
  } catch {
    return String(value);
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function mapErrorToResult(toolName: string, err: unknown): CallToolResult {
  if (err instanceof TRPCError) {
    return errorResult(`[${err.code}] ${err.message}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error('MCP tool invocation failed', { tool: toolName, error: message });
  return errorResult(`Tool '${toolName}' failed: ${message}`);
}

/** Composite-tool helper for `src/generated/module-mcp.ts` consumers. */
export function buildCompositeTool(
  entry: McpToolEntry,
  handler: (input: unknown, ctx: McpInvocationContext) => Promise<unknown>,
): ResolvedMcpTool {
  return {
    name: entry.name,
    description: entry.description,
    inputSchema: entry.inputSchema,
    readOnly: entry.readOnly,
    // Composite tools always carry a real description — always promoted.
    promoted: true,
    // Composites have no downstream validator (unlike procedure tools, where
    // tRPC re-validates), so parse here — handlers get transformed/defaulted
    // data exactly as their schema declares.
    invoke: async (input, ctx) => handler(entry.inputSchema.parse(input), ctx),
  };
}
