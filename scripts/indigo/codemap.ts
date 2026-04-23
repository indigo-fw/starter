/**
 * Interactive code map using TypeScript compiler API + Cytoscape.js.
 *
 * Uses ts.createSourceFile (parser-only, no type checking) for speed.
 * Detects components via JSX AST nodes, not string heuristics.
 *
 * Usage:
 *   bun run indigo map                 → defaults to src/core
 *   bun run indigo map <module>        → deep file-level map of one module
 *   bun run indigo map src/server      → deep map of any directory
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { execSync } from "child_process";
import { resolve, relative, dirname, basename } from "path";
import ts from "typescript";

const root = process.cwd();

// ─── Types ─────────────────────────────────────────────────────────────────

interface FileNode {
  id: string;
  label: string;
  dir: string;
  type: "component" | "router" | "schema" | "lib" | "config" | "style" | "type" | "other";
  exports: ExportInfo[];
  importEdges: ImportEdge[];
  cssImports: string[];
  lines: number;
}

interface ExportInfo {
  name: string;
  kind: "function" | "class" | "type" | "interface" | "const" | "component" | "enum";
  isDefault: boolean;
  line: number;
}

interface ImportEdge {
  target: string;
  names: string[];
  isTypeOnly: boolean;
}

interface GraphData {
  nodes: FileNode[];
  directories: string[];
  moduleId: string;
  generatedAt: string;
}

// ─── File classification ───────────────────────────────────────────────────

function classifyFile(filePath: string): FileNode["type"] {
  const p = filePath.replace(/\\/g, "/");
  if (/\.(css|scss|module\.css)$/.test(p)) return "style";
  if (p.includes("/routers/")) return "router";
  if (p.includes("/schema/")) return "schema";
  if (p.includes("/types/") || p.endsWith(".d.ts")) return "type";
  if (p.includes("/config/") || p.includes("/deps")) return "config";
  if (p.includes("/lib/") || p.includes("/hooks/") || p.includes("/utils")) return "lib";
  // .tsx classified later based on JSX detection
  return "other";
}

// ─── Collect files ─────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "_templates", "__tests__", ".next", "dist"].includes(entry.name)) continue;
      results.push(...collectFiles(full));
    } else if (/\.(ts|tsx|css|scss)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

// ─── AST helpers ───────────────────────────────────────────────────────────

/** Recursively check if a node or any descendant is a JSX element. */
function containsJsx(node: ts.Node): boolean {
  if (
    node.kind === ts.SyntaxKind.JsxElement ||
    node.kind === ts.SyntaxKind.JsxSelfClosingElement ||
    node.kind === ts.SyntaxKind.JsxFragment ||
    node.kind === ts.SyntaxKind.JsxExpression
  ) {
    return true;
  }
  return ts.forEachChild(node, containsJsx) ?? false;
}

/** Check if a node has the `export` modifier. */
function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** Check if a node has the `default` modifier. */
function hasDefaultModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

/** Determine the export kind, using JSX detection for component classification. */
function getKind(node: ts.Node): ExportInfo["kind"] {
  if (ts.isFunctionDeclaration(node)) {
    return containsJsx(node) ? "component" : "function";
  }
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableDeclaration(node)) {
    const init = node.initializer;
    if (init) {
      // Arrow function or function expression
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        return containsJsx(init) ? "component" : "function";
      }
      // Call expression: createTRPCRouter(...), pgTable(...)
      if (ts.isCallExpression(init)) {
        const text = init.expression.getText();
        if (text === "createTRPCRouter") return "function";
      }
    }
    return "const";
  }
  return "const";
}

// ─── Parser ────────────────────────────────────────────────────────────────

function parseFile(filePath: string, baseDir: string): FileNode {
  const content = readFileSync(filePath, "utf-8");
  const relPath = relative(resolve(root, baseDir), filePath).replace(/\\/g, "/");
  const dir = dirname(relPath);
  const isTsx = filePath.endsWith(".tsx");

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const exports: ExportInfo[] = [];
  const importEdges: ImportEdge[] = [];
  const cssImports: string[] = [];
  let hasJsx = false;

  function visit(node: ts.Node) {
    // ── Imports ──
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (ts.isStringLiteral(specifier)) {
        const path = specifier.text;

        // CSS imports
        if (/\.(css|scss|module\.css)$/.test(path)) {
          cssImports.push(path);
          return;
        }

        // Skip external packages
        if (!path.startsWith(".") && !path.startsWith("@/")) return;

        const names: string[] = [];
        const clause = node.importClause;
        if (clause) {
          if (clause.name) names.push(clause.name.text);
          const bindings = clause.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              names.push(el.name.text);
            }
          }
        }

        importEdges.push({
          target: path,
          names,
          isTypeOnly: clause?.isTypeOnly ?? false,
        });
      }
      return;
    }

    // ── Export declarations: `export { foo, bar }` ──
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          const name = el.name.text;
          exports.push({
            name,
            kind: "const", // Can't determine kind without type info
            isDefault: false,
            line: sourceFile.getLineAndCharacterOfPosition(el.getStart()).line + 1,
          });
        }
      }
      return;
    }

    // ── Exported function declarations ──
    if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
      const name = node.name?.text ?? "default";
      const isDefault = hasDefaultModifier(node);
      exports.push({
        name,
        kind: containsJsx(node) ? "component" : "function",
        isDefault,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      if (containsJsx(node)) hasJsx = true;
      return;
    }

    // ── Exported class declarations ──
    if (ts.isClassDeclaration(node) && hasExportModifier(node)) {
      exports.push({
        name: node.name?.text ?? "default",
        kind: "class",
        isDefault: hasDefaultModifier(node),
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }

    // ── Exported type/interface/enum ──
    if (ts.isTypeAliasDeclaration(node) && hasExportModifier(node)) {
      exports.push({
        name: node.name.text,
        kind: "type",
        isDefault: false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }
    if (ts.isInterfaceDeclaration(node) && hasExportModifier(node)) {
      exports.push({
        name: node.name.text,
        kind: "interface",
        isDefault: false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }
    if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
      exports.push({
        name: node.name.text,
        kind: "enum",
        isDefault: false,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }

    // ── Exported variable statements: `export const foo = ...` ──
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const kind = getKind(decl);
          if (kind === "component") hasJsx = true;
          exports.push({
            name: decl.name.text,
            kind,
            isDefault: false,
            line: sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1,
          });
        }
      }
      return;
    }

    // ── Default export: `export default ...` ──
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      let name = "default";
      let kind: ExportInfo["kind"] = "const";
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        name = expr.text;
      } else if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        kind = containsJsx(expr) ? "component" : "function";
        if (kind === "component") hasJsx = true;
      }
      exports.push({
        name,
        kind,
        isDefault: true,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
      });
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  // Classify file type
  let type = classifyFile(relPath);
  if (type === "other" && hasJsx) type = "component";
  if (type === "other" && isTsx) {
    // Check if any export is a component
    if (exports.some((e) => e.kind === "component")) type = "component";
  }

  return {
    id: relPath,
    label: basename(filePath),
    dir: dir === "." ? "" : dir,
    type,
    exports,
    importEdges,
    cssImports,
    lines: sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1,
  };
}

// ─── Import resolution ─────────────────────────────────────────────────────

/**
 * Build a lookup index for fast import resolution.
 * Maps every possible specifier to its actual file ID.
 */
function buildFileIndex(fileIds: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const id of fileIds) {
    // Register the full path
    index.set(id, id);
    // Without extension: "routers/products.ts" → "routers/products"
    const noExt = id.replace(/\.(ts|tsx)$/, "");
    if (!index.has(noExt)) index.set(noExt, id);
    // Index file shorthand: "components/cart/index.ts" → "components/cart"
    if (id.endsWith("/index.ts") || id.endsWith("/index.tsx")) {
      const dir = dirname(id);
      if (!index.has(dir)) index.set(dir, id);
    }
  }
  return index;
}

function resolveImport(
  fromFile: string,
  specifier: string,
  baseDir: string,
  index: Map<string, string>,
): string | null {
  // @/ alias — resolve relative to project src/
  if (specifier.startsWith("@/")) {
    const aliasedFull = resolve(root, specifier.replace("@/", "src/"));
    const rel = relative(resolve(root, baseDir), aliasedFull).replace(/\\/g, "/");
    return index.get(rel) ?? index.get(rel + ".ts") ?? index.get(rel + ".tsx") ?? null;
  }

  // Relative imports
  if (specifier.startsWith(".")) {
    const fromDir = dirname(fromFile);
    const resolved = resolve(resolve(root, baseDir, fromDir), specifier);
    const rel = relative(resolve(root, baseDir), resolved).replace(/\\/g, "/");
    return index.get(rel) ?? null;
  }

  return null;
}

// ─── Build graph data ──────────────────────────────────────────────────────

function buildGraph(targetDir: string, moduleId: string): GraphData {
  const absDir = resolve(root, targetDir);
  const files = collectFiles(absDir);
  const tsFiles = files.filter((f) => /\.(ts|tsx)$/.test(f));
  const cssFiles = files.filter((f) => /\.(css|scss)$/.test(f));

  // Parse all TS files
  const nodes: FileNode[] = [];
  for (const f of tsFiles) {
    try {
      nodes.push(parseFile(f, targetDir));
    } catch {
      // Skip files that fail to parse
    }
  }

  // Add CSS files as simple nodes
  for (const f of cssFiles) {
    const relPath = relative(absDir, f).replace(/\\/g, "/");
    nodes.push({
      id: relPath,
      label: basename(f),
      dir: dirname(relPath) === "." ? "" : dirname(relPath),
      type: "style",
      exports: [],
      importEdges: [],
      cssImports: [],
      lines: 0,
    });
  }

  // Resolve import targets using the file index
  const fileIndex = buildFileIndex(nodes.map((n) => n.id));
  for (const node of nodes) {
    for (const edge of node.importEdges) {
      const resolved = resolveImport(node.id, edge.target, targetDir, fileIndex);
      if (resolved) {
        edge.target = resolved;
      }
    }
  }

  // Collect unique directories
  const dirs = new Set<string>();
  for (const node of nodes) {
    if (node.dir) {
      const parts = node.dir.split("/");
      for (let i = 1; i <= parts.length; i++) {
        dirs.add(parts.slice(0, i).join("/"));
      }
    }
  }

  return {
    nodes,
    directories: [...dirs].sort(),
    moduleId,
    generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
}

// ─── HTML builder ──────────────────────────────────────────────────────────

function buildHtml(data: GraphData): string {
  const templatePath = resolve(import.meta.dir, "codemap.html");
  let html = readFileSync(templatePath, "utf-8");
  const allIds = new Set(data.nodes.map((n) => n.id));
  html = html.replaceAll("{{GRAPH_DATA}}", JSON.stringify(data));
  html = html.replaceAll("{{MODULE_ID}}", data.moduleId);
  html = html.replaceAll("{{GENERATED_AT}}", data.generatedAt);
  html = html.replaceAll("{{FILE_COUNT}}", String(data.nodes.length));
  html = html.replaceAll(
    "{{EXPORT_COUNT}}",
    String(data.nodes.reduce((s, n) => s + n.exports.length, 0)),
  );
  html = html.replaceAll(
    "{{EDGE_COUNT}}",
    String(
      data.nodes.reduce(
        (s, n) => s + n.importEdges.filter((e) => allIds.has(e.target)).length,
        0,
      ),
    ),
  );
  return html;
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function codemap(target?: string) {
  console.log("\n  Building code map...\n");

  const outDir = resolve(root, ".indigo");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let targetDir: string;
  let moduleId: string;

  if (!target) {
    targetDir = "src/core";
    moduleId = "core";
  } else if (existsSync(resolve(root, "src", target))) {
    targetDir = `src/${target}`;
    moduleId = target;
  } else if (existsSync(resolve(root, target))) {
    targetDir = target;
    moduleId = basename(target);
  } else {
    console.error(`  "${target}" not found. Try: bun run indigo map core-store\n`);
    return;
  }

  console.log(`  Scanning ${targetDir}/...`);

  const startTime = Date.now();
  const data = buildGraph(targetDir, moduleId);
  const elapsed = Date.now() - startTime;

  const allIds = new Set(data.nodes.map((n) => n.id));
  const edgeCount = data.nodes.reduce(
    (s, n) => s + n.importEdges.filter((e) => allIds.has(e.target)).length,
    0,
  );

  console.log(
    `  ${data.nodes.length} files, ${data.nodes.reduce((s, n) => s + n.exports.length, 0)} exports, ${edgeCount} edges`,
  );
  console.log(`  Parsed in ${elapsed}ms`);

  const html = buildHtml(data);
  const outPath = resolve(outDir, "codemap.html");
  writeFileSync(outPath, html, "utf-8");

  console.log(`  Written to ${outPath}`);
  console.log("  Opening in browser...\n");

  const cmd =
    process.platform === "win32"
      ? `start "" "${outPath}"`
      : process.platform === "darwin"
        ? `open "${outPath}"`
        : `xdg-open "${outPath}"`;
  execSync(cmd, { stdio: "ignore", windowsHide: true });
}
