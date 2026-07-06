/**
 * Module configuration types for indigo.config.ts.
 *
 * Each module declares what it contributes to the project:
 * routers, schema, server initialization, jobs, and layout widgets.
 */

import type { McpToolModuleRef } from '@/core/lib/mcp/types';

export interface RouterEntry {
  /** Export name (e.g. 'billingRouter') */
  name: string;
  /** Key in the tRPC router map (e.g. 'billing') */
  key: string;
  /** Import path (e.g. '@/core-subscriptions/routers/billing') */
  from: string;
}

export interface JobEntry {
  /** Export name (e.g. 'startSupportChatCleanupWorker') */
  name: string;
  /** Import path */
  from: string;
}

export interface WidgetEntry {
  /** Component export name */
  name: string;
  /** Import path */
  from: string;
  /**
   * If set, the layout will only render this widget when the user has granted
   * consent for the named category (e.g. 'marketing', 'analytics'). This is
   * what makes consent gating mechanical for modules that ship tracking widgets.
   *
   * The widget is wrapped in <ConsentGate category={consentCategory}> at the
   * layout-rendering site, so the component's effects never run for users
   * who declined.
   */
  consentCategory?: string;
  /**
   * Where the widget renders: 'layout' (default) floats at the app-wrapper
   * level (chat bubbles, trackers); 'header' renders in the public header's
   * actions area (e.g. core-store's CartWidget). Keeping this in module config
   * means the layout never hard-imports module components — `indigo remove`
   * stays mechanical.
   */
  slot?: 'layout' | 'header';
}

export interface SeedEntry {
  /** Export name of the seed function (e.g. 'seedBilling') */
  name: string;
  /** Import path */
  from: string;
  /** Human-readable label shown during init (e.g. 'Billing demo data') */
  label: string;
  /**
   * Optional: export name of a function that checks if seed data already exists.
   * Signature: `(db: PostgresJsDatabase) => Promise<boolean>`
   * Used to flip the prompt default: YES when empty, NO when data exists.
   */
  hasDataCheck?: string;
}

export interface PageWidgetEntry {
  /** Slot identifier — which page to inject into (e.g. 'billing') */
  slot: string;
  /** Component export name */
  name: string;
  /** Import path */
  from: string;
}

export interface NavItemEntry {
  /** Nav group ID to add this item to (e.g., 'billing', 'settings') */
  groupId: string;
  /** Display name */
  name: string;
  /** Route href */
  href: string;
  /** Lucide icon import name (e.g. 'Link2', 'LifeBuoy') */
  icon: string;
}

export interface DashboardWidgetEntry {
  /** Unique widget ID (e.g. 'activity-feed') */
  id: string;
  /** Component export name */
  name: string;
  /** Import path */
  from: string;
  /** Human-readable label for config UI */
  label: string;
  /** Default column span (1-12) */
  colSpan: number;
  /** Minimum allowed column span */
  minSpan: number;
  /** Maximum allowed column span */
  maxSpan: number;
  /** Whether visible by default */
  defaultVisible: boolean;
}

export type ModuleCategory = 'primitive' | 'product';

export interface ModuleConfig {
  /** Module identifier (e.g. 'core-billing') */
  id: string;
  /** Module category — 'primitive' (horizontal building block) or 'product' (vertical domain) */
  category: ModuleCategory;
  /** tRPC routers to register in _app.ts */
  routers: RouterEntry[];
  /** Schema paths to re-export for Drizzle discovery */
  schema: string[];
  /** Side-effect imports for server.ts (deps registration, provider registration) */
  serverInit: string[];
  /** Background job workers to start */
  jobs: JobEntry[];
  /** Components to inject into public layout */
  layoutWidgets: WidgetEntry[];
  /** Seed functions for demo data (run during `bun run init`) */
  seed: SeedEntry[];
  /** Components injected into specific dashboard pages by slot name */
  pageWidgets: PageWidgetEntry[];
  /** Admin nav items to register (appended to existing nav groups) */
  navItems: NavItemEntry[];
  /** Dashboard widgets contributed by this module (draggable, configurable) */
  dashboardWidgets?: DashboardWidgetEntry[];
  /**
   * Sitemap fetchers contributed by this module. Each entry names an exported
   * `SitemapFetcher` (or `SitemapFetcher[]`) — generated into
   * `src/generated/module-sitemap.ts` so `src/app/sitemap.ts` never
   * hard-imports module schemas.
   */
  sitemapFetchers?: { name: string; from: string }[];
  /**
   * Components contributed to named content slots (generated into
   * `src/generated/content-slots.tsx`). Regular slots (e.g. 'post-footer')
   * receive `{ targetType, targetId }` props and render via `<ContentSlot>`.
   * The special slot 'showcase-comments' contributes the `useShowcaseComments`
   * hook (re-exported as-is; an inert fallback is generated when absent).
   */
  contentSlots?: { slot: string; name: string; from: string }[];
  /**
   * Schema tables that can be extended by the project.
   *
   * The module exports column definitions (not the table). The project can create
   * an override file at `src/schema/overrides/<filename>.ts` that spreads the module's
   * columns and adds its own. The sync script detects overrides and re-exports the
   * project version in `generated/module-schema.ts`.
   *
   * If no override exists, the module's default table is used.
   *
   * Example:
   *   Module: `export const chatUserPreferenceColumns = { ... };`
   *   Module: `export const chatUserPreferences = pgTable('...', chatUserPreferenceColumns);`
   *   Project: `src/schema/overrides/chat-user-preferences.ts` spreads + extends
   */
  overridableSchema?: OverridableSchemaEntry[];

  /**
   * Project-layer files scaffolded by this module (relative to src/).
   * Copied from _templates/ during `indigo add`, removed during `indigo remove`.
   * These are the project-side files the module needs to function (deps, admin pages, etc.).
   */
  projectFiles: string[];

  /**
   * Composite MCP tools contributed by this module. Optional.
   *
   * Every tRPC procedure is already auto-exposed as an MCP tool (unless it
   * opts out via `.meta({ mcp: false })`), so most modules don't need this.
   * Use composite tools to expose multi-procedure workflows as one atomic
   * agent-callable action (e.g. `blog.publishPost` that creates + sets status
   * + invalidates cache).
   *
   * Each entry references an exported `ResolvedMcpTool[]` from the module.
   * Names inside the array must be namespaced (e.g. `blog.publishPost`) to
   * avoid colliding with auto-discovered procedure paths — `indigo:sync`
   * errors on collision.
   */
  mcpTools?: McpToolModuleRef[];

  /**
   * Side-effect imports loaded with the MCP layer (into generated
   * `module-mcp.ts`). Use for registrations core's MCP machinery consumes —
   * e.g. `core-api` registers the API-key verifier here. Unlike `serverInit`
   * (Bun-side module graph), these load in the Next.js route bundle, which is
   * where MCP auth actually runs.
   */
  mcpInit?: string[];
}

export interface OverridableSchemaEntry {
  /** Override filename (without .ts). Must match file in src/schema/overrides/ */
  name: string;
  /** Module schema path that provides the default (same as in `schema` array) */
  modulePath: string;
}
