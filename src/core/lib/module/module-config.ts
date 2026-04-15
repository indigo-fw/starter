/**
 * Module configuration types for indigo.config.ts.
 *
 * Each module declares what it contributes to the project:
 * routers, schema, server initialization, jobs, and layout widgets.
 */

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
}

export interface OverridableSchemaEntry {
  /** Override filename (without .ts). Must match file in src/schema/overrides/ */
  name: string;
  /** Module schema path that provides the default (same as in `schema` array) */
  modulePath: string;
}
