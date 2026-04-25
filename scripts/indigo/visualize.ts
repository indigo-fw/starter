/**
 * Generate an interactive HTML architecture diagram from indigo.config.ts.
 *
 * Reads module configs, registry, and actual schema files at runtime
 * so the diagram always matches code.
 *
 * Output: .indigo/architecture.html (gitignored)
 * Flags: --mermaid → export raw .mmd files instead of HTML
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  statSync,
} from "fs";
import { execSync } from "child_process";
import { resolve, relative } from "path";
import { REGISTRY, type ModuleRegistryEntry } from "./registry";
import type { ModuleConfig } from "@/core/lib/module/module-config";

const root = process.cwd();

// ─── Types ─────────────────────────────────────────────────────────────────

interface TableInfo {
  varName: string;
  dbName: string;
  /** Which domain owns this table: 'core' or module id */
  owner: string;
  file: string;
}

interface FkRelation {
  sourceTable: string; // db name
  targetTable: string; // db name
  sourceOwner: string;
  targetOwner: string;
  onDelete: string;
}

// ─── Data collection ───────────────────────────────────────────────────────

function getCoreRouters(): string[] {
  const dir = resolve(root, "src/server/routers");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".ts") && !f.startsWith("_") && !f.startsWith("__"),
    )
    .map((f) => f.replace(".ts", ""));
}

function getCoreSchemaFiles(): string[] {
  const dir = resolve(root, "src/server/db/schema");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => resolve(dir, f));
}

function getModuleSchemaFiles(modules: ModuleConfig[]): string[] {
  const files: string[] = [];
  for (const mod of modules) {
    for (const schemaPath of mod.schema) {
      // Convert @/core-xxx/schema/yyy to absolute path
      const rel = schemaPath.replace(/^@\//, "src/") + ".ts";
      const abs = resolve(root, rel);
      if (existsSync(abs)) files.push(abs);
    }
  }
  return files;
}

function getRegistryMap(): Map<string, ModuleRegistryEntry> {
  const map = new Map<string, ModuleRegistryEntry>();
  for (const entry of REGISTRY) map.set(entry.id, entry);
  return map;
}

// ─── Schema FK parsing ─────────────────────────────────────────────────────

function parseSchemaFiles(
  coreFiles: string[],
  moduleFiles: string[],
  modules: ModuleConfig[],
): { tables: TableInfo[]; relations: FkRelation[] } {
  const tables: TableInfo[] = [];
  const varToDb = new Map<string, string>();

  // Determine owner from file path
  function getOwner(filePath: string): string {
    const rel = relative(root, filePath).replace(/\\/g, "/");
    if (rel.startsWith("src/server/")) return "core";
    const match = rel.match(/^src\/(core-[^/]+)\//);
    return match ? match[1]! : "core";
  }

  const allFiles = [
    ...coreFiles.map((f) => ({ file: f, source: "core" as const })),
    ...moduleFiles.map((f) => ({ file: f, source: "module" as const })),
  ];

  // Pass 1: collect all table definitions
  const tableDefRe =
    /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(\s*['"]([^'"]+)['"]/g;

  for (const { file } of allFiles) {
    const content = readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    tableDefRe.lastIndex = 0;
    while ((m = tableDefRe.exec(content)) !== null) {
      const varName = m[1]!;
      const dbName = m[2]!;
      const owner = getOwner(file);
      tables.push({ varName, dbName, owner, file });
      varToDb.set(varName, dbName);
    }
  }

  // Pass 2: collect FK references
  const relations: FkRelation[] = [];

  for (const { file } of allFiles) {
    const content = readFileSync(file, "utf-8");
    const owner = getOwner(file);

    // Find all pgTable blocks in this file
    const tablePositions: { varName: string; dbName: string; pos: number }[] =
      [];
    tableDefRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tableDefRe.exec(content)) !== null) {
      tablePositions.push({
        varName: m[1]!,
        dbName: m[2]!,
        pos: m.index,
      });
    }
    if (tablePositions.length === 0) continue;

    // Find all .references(() => X.id) in this file
    const refRe = /\.references\s*\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g;
    refRe.lastIndex = 0;
    while ((m = refRe.exec(content)) !== null) {
      const targetVar = m[1]!;
      const refPos = m.index;

      // Find which table this reference belongs to (closest preceding pgTable)
      let sourceTable: (typeof tablePositions)[0] | undefined;
      for (const tp of tablePositions) {
        if (tp.pos <= refPos) sourceTable = tp;
        else break;
      }
      if (!sourceTable) continue;

      const targetDb = varToDb.get(targetVar);
      if (!targetDb) continue;

      // Find target owner
      const targetInfo = tables.find((t) => t.varName === targetVar);
      const targetOwner = targetInfo?.owner ?? "core";

      // Deduplicate
      const exists = relations.some(
        (r) =>
          r.sourceTable === sourceTable.dbName &&
          r.targetTable === targetDb,
      );
      if (!exists) {
        // Extract onDelete
        const after = content.slice(refPos, refPos + 200);
        const deleteMatch = after.match(/onDelete:\s*['"]([^'"]+)['"]/);

        relations.push({
          sourceTable: sourceTable.dbName,
          targetTable: targetDb,
          sourceOwner: owner,
          targetOwner,
          onDelete: deleteMatch?.[1] ?? "no action",
        });
      }
    }
  }

  return { tables, relations };
}

// ─── Mermaid generators ────────────────────────────────────────────────────

function san(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_");
}

function generateDependencyGraph(
  modules: ModuleConfig[],
  registry: Map<string, ModuleRegistryEntry>,
): string {
  const lines: string[] = ["graph LR"];

  // Core as the root
  lines.push(`  core["core\\nCMS + Auth + Orgs + i18n"]:::coreNode`);

  for (const mod of modules) {
    const id = san(mod.id);
    const label = mod.id.replace("core-", "");
    const reg = registry.get(mod.id);
    const tag = reg?.free ? " [free]" : "";
    const counts = `${mod.routers.length}R ${mod.schema.length}S ${mod.jobs.length}J`;
    lines.push(
      `  ${id}["${label}${tag}\\n${counts}"]:::${mod.category}Node`,
    );
  }

  // Only draw dependency edges — inter-module deps from registry
  // Group modules by whether they have deps or not
  const withDeps = new Set<string>();
  for (const mod of modules) {
    const reg = registry.get(mod.id);
    if (reg?.requires?.length) {
      for (const dep of reg.requires) {
        if (modules.find((m) => m.id === dep)) {
          lines.push(
            `  ${san(dep)} --> ${san(mod.id)}`,
          );
          withDeps.add(mod.id);
          withDeps.add(dep);
        }
      }
    }
  }

  // Modules with no inter-module deps connect to core
  for (const mod of modules) {
    if (!withDeps.has(mod.id)) {
      lines.push(`  core --> ${san(mod.id)}`);
    }
  }

  // Root of the dep chains also connect to core
  for (const mod of modules) {
    const reg = registry.get(mod.id);
    if (
      withDeps.has(mod.id) &&
      (!reg?.requires?.length ||
        !reg.requires.some((r) => modules.find((m) => m.id === r)))
    ) {
      lines.push(`  core --> ${san(mod.id)}`);
    }
  }

  return lines.join("\n");
}

function generateModuleFocusDiagrams(
  modules: ModuleConfig[],
  registry: Map<string, ModuleRegistryEntry>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const mod of modules) {
    const lines: string[] = ["graph LR"];
    const reg = registry.get(mod.id);
    const id = san(mod.id);
    const label = mod.id.replace("core-", "");

    // The focused module
    lines.push(
      `  ${id}["${label}\\n${mod.routers.length}R ${mod.schema.length}S ${mod.jobs.length}J"]:::focusNode`,
    );

    // Its dependencies (upstream)
    if (reg?.requires) {
      for (const dep of reg.requires) {
        const depMod = modules.find((m) => m.id === dep);
        if (depMod) {
          const dl = dep.replace("core-", "");
          lines.push(
            `  ${san(dep)}["${dl}\\n${depMod.routers.length}R ${depMod.schema.length}S"]:::upstreamNode`,
          );
          lines.push(`  ${san(dep)} -->|requires| ${id}`);
        }
      }
    }

    // Modules that depend on this one (downstream)
    for (const other of modules) {
      if (other.id === mod.id) continue;
      const otherReg = registry.get(other.id);
      if (otherReg?.requires?.includes(mod.id)) {
        const ol = other.id.replace("core-", "");
        lines.push(
          `  ${san(other.id)}["${ol}\\n${other.routers.length}R ${other.schema.length}S"]:::downstreamNode`,
        );
        lines.push(`  ${id} -->|needed by| ${san(other.id)}`);
      }
    }

    // Core always connects
    lines.push(`  core["core"]:::coreNode`);
    lines.push(`  core --> ${id}`);

    // Routers detail
    if (mod.routers.length > 0) {
      lines.push(
        `  subgraph routers["Routers (${mod.routers.length})"]`,
      );
      for (const r of mod.routers) {
        lines.push(`    r_${san(r.key)}["${r.key}"]:::detailNode`);
      }
      lines.push(`  end`);
      lines.push(`  ${id} --- routers`);
    }

    // Jobs detail
    if (mod.jobs.length > 0) {
      lines.push(`  subgraph jobs["Workers (${mod.jobs.length})"]`);
      for (const j of mod.jobs) {
        const jl = j.name
          .replace(/^start/, "")
          .replace(/Worker$/, "");
        lines.push(`    j_${san(j.name)}["${jl}"]:::detailNode`);
      }
      lines.push(`  end`);
      lines.push(`  ${id} --- jobs`);
    }

    result[mod.id] = lines.join("\n");
  }

  return result;
}

function generateDataModel(
  tables: TableInfo[],
  relations: FkRelation[],
  filterOwner?: string,
): string {
  const lines: string[] = ["erDiagram"];

  // Filter relations by domain if requested
  const filteredRelations = filterOwner
    ? relations.filter(
        (r) =>
          r.sourceOwner === filterOwner || r.targetOwner === filterOwner,
      )
    : relations;

  // Only include tables that participate in filtered relationships
  const participatingTables = new Set<string>();
  for (const r of filteredRelations) {
    participatingTables.add(r.sourceTable);
    participatingTables.add(r.targetTable);
  }

  // Emit relationships
  for (const r of filteredRelations) {
    const rel =
      r.onDelete === "cascade"
        ? "}o--||"
        : r.onDelete === "restrict"
          ? "}|--||"
          : "}o--o|";
    const label = r.onDelete;
    lines.push(
      `  ${san(r.sourceTable)} ${rel} ${san(r.targetTable)} : "${label}"`,
    );
  }

  // Declare entities so Mermaid renders table names
  for (const dbName of participatingTables) {
    lines.push(`  ${san(dbName)} { }`);
  }

  return lines.join("\n");
}

/** Build per-domain ER diagrams for the filter dropdown. */
function generateDataModelByDomain(
  tables: TableInfo[],
  relations: FkRelation[],
): Record<string, string> {
  const owners = new Set<string>();
  for (const t of tables) owners.add(t.owner);

  const result: Record<string, string> = {};
  for (const owner of owners) {
    const diagram = generateDataModel(tables, relations, owner);
    // Only include if it has at least one relationship line
    if (diagram.includes("}o--") || diagram.includes("}|--")) {
      const label = owner === "core" ? "core" : owner;
      result[label] = diagram;
    }
  }
  return result;
}

function generateRouterMap(
  modules: ModuleConfig[],
  coreRouters: string[],
): string {
  const lines: string[] = ["graph LR"];

  lines.push(`  APP(("appRouter")):::appNode`);

  // Core as a single collapsed node
  lines.push(
    `  CORE["Core\\n${coreRouters.length} routers"]:::coreNode`,
  );
  lines.push(`  APP --> CORE`);

  // Each module as a single node
  for (const mod of modules) {
    if (mod.routers.length === 0) continue;
    const id = san(mod.id);
    const label = mod.id.replace("core-", "");
    lines.push(
      `  ${id}["${label}\\n${mod.routers.length} routers"]:::${mod.category}Node`,
    );
    lines.push(`  APP --> ${id}`);
  }

  return lines.join("\n");
}

function generateWorkerMap(modules: ModuleConfig[]): string {
  const lines: string[] = ["graph LR"];

  lines.push(`  BULL(("BullMQ")):::bullNode`);

  lines.push(`  subgraph CORE_W["Core"]`);
  lines.push(`    cw_email["email"]:::coreNode`);
  lines.push(`    cw_publish["scheduled-publish"]:::coreNode`);
  lines.push(`    cw_webhook["webhook"]:::coreNode`);
  lines.push(`    cw_media["media-optimize"]:::coreNode`);
  lines.push(`    cw_maint["maintenance"]:::coreNode`);
  lines.push(`  end`);
  lines.push(`  BULL --> CORE_W`);

  for (const mod of modules) {
    if (mod.jobs.length === 0) continue;
    const modId = san(mod.id);
    const label = mod.id.replace("core-", "");
    lines.push(
      `  subgraph ${modId}_W["${label}"]`,
    );
    for (const j of mod.jobs) {
      const jl = j.name
        .replace(/^start/, "")
        .replace(/Worker$/, "");
      lines.push(
        `    mw_${modId}_${san(j.name)}["${jl}"]:::${mod.category}Node`,
      );
    }
    lines.push(`  end`);
    lines.push(`  BULL --> ${modId}_W`);
  }

  return lines.join("\n");
}

function generateStartupSequence(modules: ModuleConfig[]): string {
  const lines: string[] = ["graph TB"];
  const modulesWithInit = modules.filter((m) => m.serverInit.length > 0);
  const modulesWithJobs = modules.filter((m) => m.jobs.length > 0);

  lines.push(`  START["server.ts"]:::startNode`);
  lines.push(`  NEXT["Next.js"]`);
  lines.push(`  DEPS["initModuleDeps()"]:::genNode`);

  if (modulesWithInit.length > 0) {
    lines.push(`  subgraph DI["Dependency Injection"]`);
    for (const mod of modulesWithInit) {
      for (const init of mod.serverInit) {
        const label = init.split("/").pop() ?? init;
        lines.push(`    dep_${san(mod.id)}["${label}"]:::depNode`);
      }
    }
    lines.push(`  end`);
    lines.push(`  DEPS --> DI`);
  }

  lines.push(`  SYNC["Content Sync"]`);
  lines.push(`  CACHE["Preload Caches"]`);
  lines.push(`  WORKERS["startModuleWorkers()"]:::genNode`);

  if (modulesWithJobs.length > 0) {
    lines.push(`  subgraph JOBS["Background Workers"]`);
    for (const mod of modulesWithJobs) {
      const label = mod.id.replace("core-", "");
      lines.push(
        `    wk_${san(mod.id)}["${label} (${mod.jobs.length})"]:::workerNode`,
      );
    }
    lines.push(`  end`);
    lines.push(`  WORKERS --> JOBS`);
  }

  lines.push(`  CRON["Cron Scheduler"]`);
  lines.push(`  WS["WebSocket"]`);
  lines.push(`  LISTEN[":3000"]:::listenNode`);

  lines.push(`  START --> NEXT --> DEPS`);
  lines.push(`  DEPS --> SYNC --> CACHE --> WORKERS`);
  lines.push(`  WORKERS --> CRON --> WS --> LISTEN`);

  return lines.join("\n");
}

// ─── Stats ─────────────────────────────────────────────────────────────────

function buildStats(
  modules: ModuleConfig[],
  coreRouters: string[],
  tables: TableInfo[],
  relations: FkRelation[],
) {
  return {
    modules: modules.length,
    primitives: modules.filter((m) => m.category === "primitive").length,
    products: modules.filter((m) => m.category === "product").length,
    totalRouters:
      coreRouters.length +
      modules.reduce((s, m) => s + m.routers.length, 0),
    totalSchemas: tables.length,
    totalJobs:
      modules.reduce((s, m) => s + m.jobs.length, 0) + 5,
    totalRelations: relations.length,
  };
}

function buildModuleDetails(
  modules: ModuleConfig[],
  registry: Map<string, ModuleRegistryEntry>,
) {
  return modules.map((m) => {
    const reg = registry.get(m.id);
    return {
      id: m.id,
      category: m.category,
      free: reg?.free ?? false,
      requires: reg?.requires ?? [],
      description: reg?.description ?? "",
      routers: m.routers.map((r) => r.key),
      schemas: m.schema.map((s) => s.split("/").pop() ?? s),
      jobs: m.jobs.map((j) =>
        j.name.replace(/^start/, "").replace(/Worker$/, ""),
      ),
      navItems: m.navItems.map((n) => n.name),
      widgets: (m.dashboardWidgets ?? []).map((w) => w.label),
      serverInit: m.serverInit.map((s) => s.split("/").pop() ?? s),
    };
  });
}

// ─── Mermaid theme wrapper ─────────────────────────────────────────────────

function themed(diagram: string, type: "flow" | "er" = "flow"): string {
  const init =
    type === "er"
      ? `%%{init: {'theme': 'dark', 'themeVariables': {'fontSize': '13px'}}}%%`
      : `%%{init: {'theme': 'dark', 'themeVariables': {'primaryColor': '#818cf8', 'lineColor': '#4a4a6a', 'textColor': '#e0e0e8'}}}%%`;

  const classDefs =
    type === "er"
      ? ""
      : `
classDef coreNode fill:#1a2a3a,stroke:#60a5fa,stroke-width:2px,color:#e0e0e8
classDef primitiveNode fill:#1a2a3a,stroke:#60a5fa,color:#e0e0e8
classDef productNode fill:#2a1a3a,stroke:#c084fc,color:#e0e0e8
classDef appNode fill:#1a1a3a,stroke:#818cf8,stroke-width:2px,color:#e0e0e8
classDef bullNode fill:#3a2a1a,stroke:#fbbf24,stroke-width:2px,color:#e0e0e8
classDef startNode fill:#1a1a3a,stroke:#818cf8,stroke-width:2px,color:#e0e0e8
classDef genNode fill:#2a1a3a,stroke:#c084fc,color:#e0e0e8
classDef depNode fill:#1a2a3a,stroke:#60a5fa,color:#e0e0e8
classDef workerNode fill:#3a2a1a,stroke:#fbbf24,color:#e0e0e8
classDef listenNode fill:#1a3a2a,stroke:#4ade80,stroke-width:2px,color:#e0e0e8
classDef focusNode fill:#2a1a3a,stroke:#c084fc,stroke-width:3px,color:#e0e0e8
classDef upstreamNode fill:#1a2a3a,stroke:#60a5fa,color:#e0e0e8
classDef downstreamNode fill:#3a2a1a,stroke:#fbbf24,color:#e0e0e8
classDef detailNode fill:#1e1e2a,stroke:#4a4a6a,color:#c0c0d0`;

  return `${init}\n${diagram}\n${classDefs}`;
}

// ─── Build HTML from template ──────────────────────────────────────────────

function buildHtml(replacements: Record<string, string>): string {
  const templatePath = resolve(import.meta.dirname, "visualize.html");
  let html = readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function visualize(flags: { mermaid?: boolean } = {}) {
  console.log("\n  Generating architecture diagram...\n");

  const configModule = await import(resolve(root, "indigo.config.ts"));
  const modules: ModuleConfig[] = configModule.default;
  const registry = getRegistryMap();
  const coreRouters = getCoreRouters();

  // Parse real FK relationships from schema files
  const coreSchemaFiles = getCoreSchemaFiles();
  const moduleSchemaFiles = getModuleSchemaFiles(modules);
  const { tables, relations } = parseSchemaFiles(
    coreSchemaFiles,
    moduleSchemaFiles,
    modules,
  );

  console.log(
    `  ${modules.length} modules, ${coreRouters.length} core routers, ${tables.length} tables, ${relations.length} FK relations`,
  );

  const outDir = resolve(root, ".indigo");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Generate all diagrams
  const diagrams = {
    deps: generateDependencyGraph(modules, registry),
    datamodel: generateDataModel(tables, relations),
    routers: generateRouterMap(modules, coreRouters),
    workers: generateWorkerMap(modules),
    startup: generateStartupSequence(modules),
  };

  if (flags.mermaid) {
    const names: Record<string, "flow" | "er"> = {
      deps: "flow",
      datamodel: "er",
      routers: "flow",
      workers: "flow",
      startup: "flow",
    };
    for (const [name, content] of Object.entries(diagrams)) {
      const outPath = resolve(outDir, `${name}.mmd`);
      writeFileSync(outPath, themed(content, names[name]) + "\n", "utf-8");
      console.log(`  ${outPath}`);
    }
    console.log(`\n  ${Object.keys(diagrams).length} Mermaid files written to .indigo/\n`);
    return;
  }

  // Focus diagrams (per-module detail views)
  const focusDiagrams = generateModuleFocusDiagrams(modules, registry);
  const themedFocus: Record<string, string> = {};
  for (const [id, src] of Object.entries(focusDiagrams)) {
    themedFocus[id] = themed(src);
  }

  // Per-domain ER diagrams
  const domainEr = generateDataModelByDomain(tables, relations);
  const themedDomainEr: Record<string, string> = {};
  for (const [domain, src] of Object.entries(domainEr)) {
    themedDomainEr[domain] = themed(src, "er");
  }

  const stats = buildStats(modules, coreRouters, tables, relations);
  const moduleDetails = buildModuleDetails(modules, registry);

  const html = buildHtml({
    DIAGRAM_DEPS: themed(diagrams.deps),
    DIAGRAM_DATAMODEL: themed(diagrams.datamodel, "er"),
    DIAGRAM_ROUTERS: themed(diagrams.routers),
    DIAGRAM_WORKERS: themed(diagrams.workers),
    DIAGRAM_STARTUP: themed(diagrams.startup),
    STATS_JSON: JSON.stringify(stats),
    MODULE_DETAILS_JSON: JSON.stringify(moduleDetails),
    MODULE_FOCUS_JSON: JSON.stringify(themedFocus),
    DOMAIN_ER_JSON: JSON.stringify(themedDomainEr),
    GENERATED_AT: new Date().toISOString().replace("T", " ").slice(0, 19),
  });

  const outPath = resolve(outDir, "architecture.html");
  writeFileSync(outPath, html, "utf-8");

  console.log(`  Written to ${outPath}`);
  console.log("  Opening in browser...\n");

  openInBrowser(outPath);
}

// ─── Browser opener ────────────────────────────────────────────────────────

function openInBrowser(filePath: string) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${filePath}"`
      : process.platform === "darwin"
        ? `open "${filePath}"`
        : `xdg-open "${filePath}"`;
  // Fire and forget — exec is already imported at top level
  execSync(cmd, { stdio: "ignore", windowsHide: true });
}

// ─── Import analysis (dependency-cruiser) ──────────────────────────────────

interface Violation {
  module: string;
  file: string;
  importsFrom: string;
  target: string;
}

/**
 * Fast grep for cross-module imports — no dep-cruiser needed.
 * Respects declared dependencies from the registry (requires field).
 * Deduplicates by file + target module pair.
 */
function detectBoundaryViolations(modules: ModuleConfig[]): Violation[] {
  const violations: Violation[] = [];
  const moduleIds = new Set(modules.map((m) => m.id));
  const registry = getRegistryMap();

  for (const mod of modules) {
    const modDir = resolve(root, "src", mod.id);
    if (!existsSync(modDir)) continue;

    // Build set of allowed cross-module imports for this module
    const reg = registry.get(mod.id);
    const allowedDeps = new Set(reg?.requires ?? []);

    const files = collectTsFiles(modDir);
    const seen = new Set<string>(); // deduplicate by "file|target"

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      // Match: from '@/core-xxx/...' or from "../../core-xxx/..."
      const importRe =
        /(?:from\s+['"]@\/(core-[^/'"]+)|from\s+['"]\.\.\/+\.\.\/(core-[^/'"]+))/g;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        const target = m[1] || m[2];
        if (!target || target === mod.id || !moduleIds.has(target!)) continue;

        // Skip declared dependencies — these are allowed
        if (allowedDeps.has(target!)) continue;

        const relFile = relative(root, file).replace(/\\/g, "/");
        const key = `${relFile}|${target}`;
        if (seen.has(key)) continue;
        seen.add(key);

        violations.push({
          module: mod.id,
          file: relFile,
          importsFrom: target!,
          target: m[0],
        });
      }
    }
  }

  return violations;
}

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "_templates") {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

function runDepcruise(target: string, outFile: string, collapse?: string): boolean {
  const binDir = resolve(root, "node_modules/.bin");
  const hasDepcruise =
    existsSync(resolve(binDir, "depcruise")) ||
    existsSync(resolve(binDir, "depcruise.exe")) ||
    existsSync(resolve(binDir, "depcruise.cmd"));
  if (!hasDepcruise) {
    console.error("  dependency-cruiser not installed. Run: bun add -D dependency-cruiser");
    return false;
  }

  const collapseArg = collapse ? ` --collapse "${collapse}"` : "";
  const bin = resolve(binDir, process.platform === "win32" ? "depcruise.exe" : "depcruise");
  const cmd = `"${bin}" ${target} --config .dependency-cruiser.cjs --output-type html${collapseArg}`;

  try {
    const output = execSync(cmd, {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
    writeFileSync(outFile, output, "utf-8");
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // dep-cruiser exits non-zero when it finds violations, but still produces output
    if (existsSync(outFile) && statSync(outFile).size > 0) return true;
    console.error(`  Failed: ${msg.slice(0, 200)}`);
    return false;
  }
}

function buildImportsIndex(
  outDir: string,
  reports: { id: string; ok: boolean }[],
  violations: Violation[],
  hasOverview: boolean,
): string {
  const violationsByModule = new Map<string, Violation[]>();
  for (const v of violations) {
    if (!violationsByModule.has(v.module)) violationsByModule.set(v.module, []);
    violationsByModule.get(v.module)!.push(v);
  }

  const rows = reports
    .map((r) => {
      const modViolations = violationsByModule.get(r.id) ?? [];
      const badge =
        modViolations.length > 0
          ? `<span class="badge bad">${modViolations.length} violations</span>`
          : `<span class="badge ok">clean</span>`;
      const link = r.ok
        ? `<a href="${r.id}.html">${r.id}</a>`
        : `<span class="dim">${r.id}</span>`;
      const details = modViolations
        .map(
          (v) =>
            `<div class="violation"><code>${v.file}</code> imports from <code>${v.importsFrom}</code></div>`,
        )
        .join("");
      return `<tr><td>${link}</td><td>${badge}</td><td>${details || "\u2014"}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Indigo Import Analysis</title>
<style>
  :root { --bg: #0f0f14; --surface: #16161e; --border: #2a2a3a; --text: #e0e0e8; --dim: #7878a0; --brand: #818cf8; --green: #4ade80; --red: #f87171; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; padding: 32px; }
  h1 { color: var(--brand); font-size: 20px; margin-bottom: 8px; }
  .meta { color: var(--dim); font-size: 12px; margin-bottom: 24px; display: block; }
  .overview-link { display: inline-block; margin-bottom: 20px; color: var(--brand); text-decoration: none; font-size: 14px; padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; }
  .overview-link:hover { border-color: var(--brand); }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; border-bottom: 2px solid var(--border); color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
  a { color: var(--brand); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .dim { color: var(--dim); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: #1a3a2a; color: var(--green); }
  .badge.bad { background: #3a1a1a; color: var(--red); }
  .violation { font-size: 12px; color: var(--dim); margin: 2px 0; }
  .violation code { color: var(--red); font-size: 11px; }
  .summary { margin: 20px 0; padding: 14px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); }
  .summary strong { color: ${violations.length > 0 ? "var(--red)" : "var(--green)"}; }
</style>
</head>
<body>
  <h1>Indigo Import Analysis</h1>
  <span class="meta">Generated by <code>bun run indigo visualize --imports</code> using dependency-cruiser</span>

  <div class="summary">
    <strong>${violations.length} boundary violation${violations.length !== 1 ? "s" : ""}</strong> across ${reports.length} modules.
    ${violations.length > 0 ? "Modules should not import directly from sibling modules &mdash; use DI (deps.ts) instead." : "All module boundaries are clean."}
  </div>

  ${hasOverview ? '<a class="overview-link" href="overview.html">View collapsed overview (all modules)</a>' : ""}

  <table>
    <thead><tr><th>Module</th><th>Boundaries</th><th>Details</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export async function imports(targetModule?: string) {
  console.log("\n  Import analysis (dependency-cruiser)\n");

  const configModule = await import(resolve(root, "indigo.config.ts"));
  const modules: ModuleConfig[] = configModule.default;

  // Step 1: Fast boundary violation scan
  console.log("  Scanning module boundaries...");
  const violations = detectBoundaryViolations(modules);
  for (const mod of modules) {
    const modViolations = violations.filter((v) => v.module === mod.id);
    if (modViolations.length > 0) {
      console.log(`    \u26a0 ${mod.id}: ${modViolations.length} violation(s)`);
      for (const v of modViolations) {
        console.log(`      ${v.file} \u2192 ${v.importsFrom}`);
      }
    } else {
      console.log(`    \u2713 ${mod.id}`);
    }
  }

  // Step 2: Generate dep-cruiser HTML reports
  const outDir = resolve(root, ".indigo/imports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const targets = targetModule
    ? modules.filter((m) => m.id === targetModule)
    : modules;

  if (targets.length === 0 && targetModule) {
    console.error(`\n  Module "${targetModule}" not found.\n`);
    return;
  }

  console.log("\n  Generating dep-cruiser reports...");
  const reports: { id: string; ok: boolean }[] = [];

  for (const mod of targets) {
    const modDir = `src/${mod.id}/`;
    if (!existsSync(resolve(root, modDir))) {
      reports.push({ id: mod.id, ok: false });
      continue;
    }
    process.stdout.write(`    ${mod.id}...`);
    const outFile = resolve(outDir, `${mod.id}.html`);
    const ok = runDepcruise(modDir, outFile);
    reports.push({ id: mod.id, ok });
    console.log(ok ? " done" : " failed");
  }

  // Step 3: Collapsed overview (all modules as single nodes)
  let hasOverview = false;
  if (!targetModule) {
    process.stdout.write("    overview (collapsed)...");
    const overviewFile = resolve(outDir, "overview.html");
    hasOverview = runDepcruise(
      "src/",
      overviewFile,
      "^src/(core-[^/]+|core|server|lib|generated|config)/",
    );
    console.log(hasOverview ? " done" : " failed");
  }

  // Step 4: Generate index
  const indexHtml = buildImportsIndex(outDir, reports, violations, hasOverview);
  const indexPath = resolve(outDir, "index.html");
  writeFileSync(indexPath, indexHtml, "utf-8");

  console.log(`\n  Written to ${outDir}/`);
  console.log("  Opening in browser...\n");

  openInBrowser(indexPath);
}
