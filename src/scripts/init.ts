/**
 * Indigo Init Script
 *
 * Single command to fully set up and populate the database:
 *   bun run init                  — interactive mode
 *   bun run init -- -y            — auto-accept all prompts (uses env/defaults)
 *   bun run init -- -y --reset    — force reset + re-seed (for demo deployments)
 *   bun run init -- --no-seed     — DB + migrations + superadmin only, skip all seeding
 *
 * Non-interactive answers (for agents/CI — no TTY required):
 *   --modules <ids|all|recommended>  — module keep-list, e.g. --modules core-payments,core-subscriptions
 *   --admin-email / --admin-password / --admin-name — override the INIT_* env vars
 *
 * Flow: .env + secrets → create DB → migrate → module selection → superadmin →
 * company info → seeding → translations → git init + first commit (degit
 * installs get a fresh, self-owned repo; the framework dev repo is never
 * touched — `indigo.role=framework` / `INDIGO_MAINTAINER=1`).
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { count, eq } from "drizzle-orm";
import { execSync, execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { hashPassword } from "@/lib/password";
import { REGISTRY } from "../../scripts/indigo/registry";
import {
  log,
  prompt,
  promptPassword,
  promptWithDefault,
  promptYesNo,
  type CompanyInfo,
} from "./seed/helpers";
import { seedMedia, seedCmsContent } from "./seed/cms-content";
import { seedUsersAndOrgs } from "./seed/users-orgs";
import { seedExtras } from "./seed/extras";
import { applySearchTriggersWithConnection } from "./apply-search-triggers";

// Lazy-loaded after .env is ensured (top-level import triggers env validation)
async function getModuleSeeds() {
  const { MODULE_SEEDS } = await import("@/generated/module-seeds");
  return MODULE_SEEDS;
}

// ─── CLI Flags ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const AUTO_YES = args.includes("-y") || args.includes("--yes");
const FORCE_RESET = args.includes("--reset");
const NO_SEED = args.includes("--no-seed");

/** Value of `--flag <value>`, or null when absent. */
function flagValue(name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")
    ? args[i + 1]!
    : null;
}

// Module keep-list for non-interactive runs: IDs, 'all', or 'recommended'.
const MODULES_FLAG = flagValue("--modules");

// Flag overrides for the INIT_* env vars (same downstream behavior).
for (const [flag, env] of [
  ["--admin-email", "INIT_ADMIN_EMAIL"],
  ["--admin-password", "INIT_ADMIN_PASSWORD"],
  ["--admin-name", "INIT_ADMIN_NAME"],
] as const) {
  const v = flagValue(flag);
  if (v) process.env[env] = v;
}

/** Prompt or auto-accept. In -y mode, always returns the default value. */
async function confirm(message: string, defaultValue = true): Promise<boolean> {
  if (AUTO_YES) return defaultValue;
  return promptYesNo(message, defaultValue);
}

/** Prompt or use fallback. In -y mode, returns env value or fallback. */
async function ask(
  message: string,
  envValue?: string,
  fallback = "",
): Promise<string> {
  if (AUTO_YES) return envValue || fallback;
  if (envValue) return promptWithDefault(message, envValue);
  return (await prompt(message)) || fallback;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();
const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const ENV_EXAMPLE_PATH = path.join(PROJECT_ROOT, ".env.example");

/** Reload .env into process.env (bun only auto-loads if .env exists at startup) */
function reloadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key] || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

async function ensureDatabaseUrl(): Promise<string> {
  // Reload in case .env was just created
  reloadEnv();

  let url = process.env.DATABASE_URL;
  const defaultUrl = "postgresql://postgres:@localhost:5432/indigo";

  if (!url || url === defaultUrl) {
    if (AUTO_YES) {
      url = url || defaultUrl;
    } else {
      url = await promptWithDefault("  Database URL:", url || defaultUrl);
    }

    // Write back to .env
    if (fs.existsSync(ENV_PATH)) {
      let envContent = fs.readFileSync(ENV_PATH, "utf-8");
      envContent = envContent.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL=${url}`,
      );
      fs.writeFileSync(ENV_PATH, envContent);
    }
    process.env.DATABASE_URL = url;
  }

  return url;
}

/** Query all application tables from the database (excludes drizzle internals) */
async function getAllTables(
  rawSql: ReturnType<typeof postgres>,
): Promise<string[]> {
  const rows = await rawSql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '__drizzle%'
  `;
  return rows.map((r) => `"${r.tablename}"`);
}

// ─── Final step: ensure a clean, self-owned git repo ────────────────────────

const STARTER_REPO_HINT = "indigo-fw/starter";

/** Run `git …`; let stderr through (stdin/stdout swallowed) so failures are diagnosable. */
function gitCmd(args: string[]): void {
  execFileSync("git", args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function gitOriginUrl(): string | null {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function gitHasCommits(): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: PROJECT_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function gitConfigLocal(key: string): string | null {
  try {
    return (
      execFileSync("git", ["config", "--local", "--get", key], {
        cwd: PROJECT_ROOT,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * True if this checkout is the Indigo framework/dev repo and must NOT be touched
 * by `ensureGitRepo`. Signalled by `git config indigo.role framework` (persisted
 * in `.git/config`, never copied by `git clone` or `degit`) or `INDIGO_MAINTAINER=1`.
 */
function isProtectedFrameworkRepo(): boolean {
  return (
    process.env.INDIGO_MAINTAINER === "1" ||
    gitConfigLocal("indigo.role") === "framework"
  );
}

/**
 * Local-only ignore rules that apply to *the framework dev checkout only*. They
 * live in `.git/info/exclude` — not tracked, not pushed, not copied by clone or
 * degit, so downstream user installs are unaffected. Currently: hide the
 * install-seeded `content/{locale}/*.md` files so they don't clutter
 * `git status` in dev work. (Downstream users may want to track their
 * customized versions, which is why this isn't in `.gitignore`.)
 *
 * Idempotent: detected via the pattern itself, so re-running is a no-op and the
 * pre-existing block I wrote manually in the framework dev repo is recognised.
 */
const FRAMEWORK_EXCLUDES_BLOCK = `
# ─── indigo-framework-excludes (managed by bun run init) ──────────────────────
# Local to this checkout. Templates live in src/core/_templates/content/;
# bun run init copies them per locale to content/{locale}/*.md. We don't want
# them in git status here. Downstream users may want them tracked, so this rule
# is intentionally NOT in .gitignore — it lives only in .git/info/exclude.
/content/*/**/*.md
`;

function bootstrapFrameworkExcludes(): void {
  const excludePath = path.join(PROJECT_ROOT, ".git", "info", "exclude");
  try {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    const existing = fs.existsSync(excludePath)
      ? fs.readFileSync(excludePath, "utf-8")
      : "";
    if (existing.includes("/content/*/**/*.md")) return; // already there
    const sep = existing && !existing.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(excludePath, sep + FRAMEWORK_EXCLUDES_BLOCK);
    log("🚫", "Added framework-dev local excludes to .git/info/exclude.");
  } catch {
    /* non-critical — couldn't write .git/info/exclude */
  }
}

/** `git init` (idempotent) + first commit + re-install husky hooks (a new `.git` has none). */
function freshGitInit(): boolean {
  try {
    gitCmd(["init"]);
    gitCmd(["add", "-A"]);
  } catch {
    log("⚠️", "git init failed (see error above) — run `git init` yourself before `bun run indigo add`.");
    return false;
  }
  try {
    gitCmd(["commit", "-m", "Initial commit from Indigo starter"]);
  } catch {
    log("⚠️", "Could not create the initial commit (git identity not configured?).");
    console.log('     git config user.name  "Your Name"');
    console.log('     git config user.email "you@example.com"');
    console.log('     git add -A && git commit -m "Initial commit from Indigo starter"');
    return false;
  }
  try {
    execFileSync("bun", ["run", "prepare"], { cwd: PROJECT_ROOT, stdio: "ignore" }); // husky → .git/hooks
  } catch {
    /* husky hooks are non-critical */
  }
  return true;
}

/**
 * Files that belong to the indigo-fw/starter repo itself, not to apps built
 * from it. deploy-demo.yml can never succeed in a customer repo (its secrets
 * and registry permissions live in the starter; it also self-guards with
 * `if: github.repository == 'indigo-fw/starter'`). Deleted before the first
 * commit so a fresh project's history never carries them. The framework/dev
 * repo never reaches this path — ensureGitRepo returns earlier for it.
 */
const STARTER_ONLY_FILES = [
  ".github/workflows/deploy-demo.yml",
  ".degitignore", // legacy — degit never actually supported it
];

function removeStarterOnlyFiles(): void {
  for (const rel of STARTER_ONLY_FILES) {
    const p = path.join(PROJECT_ROOT, rel);
    if (!fs.existsSync(p)) continue;
    try {
      fs.rmSync(p);
      log("🧹", `Removed starter-only file: ${rel}`);
    } catch {
      /* non-critical */
    }
  }
}

async function promptForOrigin(): Promise<void> {
  if (AUTO_YES) return;
  const url = (await prompt("  Your git remote URL (blank to skip): ")).trim();
  if (!url) return;
  try {
    gitCmd(["remote", "add", "origin", url]);
    log("🔗", `Set origin → ${url}`);
  } catch {
    log("⚠️", `Could not set origin — add it manually: git remote add origin "${url}"`);
  }
}

/**
 * Make sure the project has its own git history — not the starter's. Runs at the
 * end of init so the first commit reflects the seeded project.
 *
 * - Repo marked `indigo.role=framework` (or `INDIGO_MAINTAINER=1`): do nothing.
 *   This is the canonical dev/starter repo — it must never be re-initialised.
 * - No `.git` (degit/tarball install), or a repo that was init'd but never got
 *   its first commit: `git init` + initial commit, then offer to set the user's
 *   own `origin`. Also unblocks `bun run indigo add` (subtree-pull needs a repo
 *   with a commit).
 * - `.git` present, has commits, `origin` → indigo-fw/starter: either a plain
 *   `git clone` install (should be detached) or the framework dev repo (should
 *   be marked + left alone). Ask which; the destructive path needs a typed
 *   confirmation; nothing happens in `-y` mode.
 */
async function ensureGitRepo(): Promise<void> {
  if (!gitAvailable()) {
    log("ℹ️", "git not found on PATH — skipping repo setup.");
    return;
  }

  const hasRepo = fs.existsSync(path.join(PROJECT_ROOT, ".git"));

  // Hard guard: never touch the framework/dev repo, period.
  if (hasRepo && isProtectedFrameworkRepo()) {
    log("ℹ️", "Indigo framework/dev repo (indigo.role=framework) — leaving git untouched.");
    bootstrapFrameworkExcludes();
    return;
  }

  // Case A: no repo (degit / ZIP), or a repo with no commits yet (a previous
  // run init'd it but the commit failed). Either way: get to a committed state.
  if (!hasRepo || !gitHasCommits()) {
    removeStarterOnlyFiles();
    if (freshGitInit()) {
      log("📦", hasRepo ? "Created the initial commit." : "Initialized a fresh git repository (no starter history).");
      await promptForOrigin();
    }
    return;
  }

  // Case B: a real repo that still points at the starter.
  const origin = gitOriginUrl();
  if (!origin || !origin.includes(STARTER_REPO_HINT)) return;
  if (AUTO_YES) return; // never touch git history non-interactively

  console.log("");
  log("⚠️", `This repo's "origin" is ${origin} — looks like a clone of the Indigo starter.`);
  console.log("     [1] This IS the Indigo framework/dev repo — keep everything (won't ask again)");
  console.log("     [2] This is MY app project — detach: wipe .git, start a fresh repo");
  const choice = (await prompt("  Choose 1 or 2 [1]: ")).trim() || "1";

  if (choice !== "2") {
    try {
      gitCmd(["config", "--local", "indigo.role", "framework"]);
      log("✔", "Marked as framework dev repo (git config indigo.role=framework). Won't ask again.");
      bootstrapFrameworkExcludes();
    } catch {
      log("ℹ️", "Left git untouched. (Set `git config indigo.role framework` to silence this prompt.)");
    }
    return;
  }

  // Destructive — require an explicit typed confirmation, not just "y".
  const confirm = (
    await prompt('  Type "detach" to confirm wiping .git and starting fresh: ')
  ).trim();
  if (confirm !== "detach") {
    log("ℹ️", "Cancelled — git left untouched.");
    return;
  }

  fs.rmSync(path.join(PROJECT_ROOT, ".git"), { recursive: true, force: true });
  removeStarterOnlyFiles();
  if (freshGitInit()) {
    log("📦", "Re-initialized git with a fresh history.");
    await promptForOrigin();
  }
}

// ─── Step 1: Ensure .env ──────────────────────────────────────────────────────

function ensureEnvFile(): boolean {
  if (!fs.existsSync(ENV_PATH)) {
    if (fs.existsSync(ENV_EXAMPLE_PATH)) {
      fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
      log("📄", "Created .env from .env.example.");
    } else {
      log(
        "⚠️",
        "No .env or .env.example found. Create .env with DATABASE_URL, then re-run.",
      );
      return false;
    }
  }

  // Auto-generate secrets if they're still placeholder values
  let envContent = fs.readFileSync(ENV_PATH, "utf-8");
  let changed = false;

  // BETTER_AUTH_SECRET — 32 random bytes = 64 hex chars
  if (
    /BETTER_AUTH_SECRET=your-secret/.test(envContent) ||
    !/BETTER_AUTH_SECRET=.{32}/.test(envContent)
  ) {
    const secret = crypto.randomBytes(32).toString("hex");
    envContent = envContent.replace(
      /^BETTER_AUTH_SECRET=.*$/m,
      `BETTER_AUTH_SECRET=${secret}`,
    );
    changed = true;
    log("🔑", "Generated BETTER_AUTH_SECRET.");
  }

  // ENCRYPTION_KEY — 32 random bytes = 64 hex chars (for dashboard credential encryption)
  if (!/^ENCRYPTION_KEY=.{64}$/m.test(envContent)) {
    const key = crypto.randomBytes(32).toString("hex");
    if (/^#?\s*ENCRYPTION_KEY=/m.test(envContent)) {
      envContent = envContent.replace(
        /^#?\s*ENCRYPTION_KEY=.*$/m,
        `ENCRYPTION_KEY=${key}`,
      );
    } else {
      envContent += `\nENCRYPTION_KEY=${key}`;
    }
    changed = true;
    log("🔑", "Generated ENCRYPTION_KEY.");
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, envContent);
  }

  if (!AUTO_YES && !fs.existsSync(ENV_PATH.replace(".env", ".env.generated"))) {
    // Only pause on first-ever .env creation (not on secret rotation)
    if (!changed) return true;
  }

  return true;
}

// ─── Step 2: Create database ──────────────────────────────────────────────────

/**
 * Environment diagnostics for the "can't reach PostgreSQL" failure path.
 * Written for coding agents as much as humans: states the OS, what was
 * detected, and the exact commands that fix it — so an agent can relay the
 * options to its user in chat and (with consent) run the right one.
 */
function printEnvironmentDiagnostics(): void {
  const platform =
    process.platform === "win32"
      ? "Windows"
      : process.platform === "darwin"
        ? "macOS"
        : "Linux";
  const has = (cmd: string, args: string[]): boolean => {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  const hasDocker = has("docker", ["--version"]);
  const dockerRunning = hasDocker && has("docker", ["info"]);

  console.error("");
  console.error("── Environment diagnostics (for you or your coding agent) ──");
  console.error(`   OS: ${platform} (${os.release()}) · Bun ${Bun.version}`);
  console.error(
    `   Docker: ${hasDocker ? (dockerRunning ? "installed, running" : "installed, daemon NOT running") : "not found"}`,
  );
  console.error("");
  if (dockerRunning) {
    console.error("   Fix: start PostgreSQL + Redis from the bundled compose file:");
    console.error("        docker compose up -d");
    console.error("   then re-run `bun run init` (idempotent).");
  } else if (hasDocker) {
    console.error("   Fix: Docker is installed but the daemon isn't running.");
    console.error(
      platform === "Linux"
        ? "        sudo systemctl start docker   then: docker compose up -d"
        : "        Start Docker Desktop, then: docker compose up -d",
    );
  } else {
    console.error(
      "   Option A — install Docker, then `docker compose up -d` starts PostgreSQL + Redis:",
    );
    if (platform === "Windows") {
      console.error("        winget install Docker.DockerDesktop   (needs admin; may require a restart)");
    } else if (platform === "macOS") {
      console.error("        brew install --cask docker");
    } else {
      console.error("        https://docs.docker.com/engine/install/  (pick your distro)");
    }
    console.error(
      "   Option B — use an existing PostgreSQL server: set DATABASE_URL in .env, re-run `bun run init`.",
    );
  }
  console.error("");
  console.error(
    "   Agents: relay these options to your user in chat and ask before installing anything.",
  );
  console.error("─────────────────────────────────────────────────────────────");
}

async function ensureDatabase(): Promise<string> {
  const databaseUrl = await ensureDatabaseUrl();
  const dbUrl = new URL(databaseUrl);
  const dbName = dbUrl.pathname.slice(1);
  const maintenanceUrl = `${dbUrl.protocol}//${dbUrl.username}${dbUrl.password ? ":" + dbUrl.password : ""}@${dbUrl.host}/postgres`;

  log("🗄️", `Checking database "${dbName}"...`);

  const sql = postgres(maintenanceUrl, { max: 1 });

  try {
    const result =
      await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;

    if (result.length === 0) {
      log("📦", `Creating database "${dbName}"...`);
      await sql.unsafe(`CREATE DATABASE "${dbName}"`);
      log("✅", `Database "${dbName}" created.`);
    } else {
      log("✅", `Database "${dbName}" already exists.`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to connect to PostgreSQL: ${message}`);
    console.error(
      "Make sure PostgreSQL is running and DATABASE_URL is correct.",
    );
    printEnvironmentDiagnostics();
    process.exit(1);
  } finally {
    await sql.end();
  }

  return databaseUrl;
}

// ─── Step 3: Run migrations ─────────────────────────────────────────────────

function runMigrations() {
  // No fallback to `drizzle-kit generate`: it's a maintainer step that needs a
  // real TTY for rename prompts and can't run in CI/Docker. Committed migrations
  // are required. If they're missing, the starter is broken — bail loudly.
  const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
  if (!fs.existsSync(journalPath)) {
    console.error(
      "drizzle/meta/_journal.json is missing. The starter ships committed migrations — generate them with `bunx drizzle-kit generate` in a real terminal (maintainer-only) and commit `drizzle/`.",
    );
    process.exit(1);
  }

  log("🔄", "Running database migrations...");
  try {
    execSync("bunx drizzle-kit migrate", { stdio: "inherit" });
    log("✅", "Migrations applied.");
  } catch {
    console.error("Migration failed. Check the error above.");
    process.exit(1);
  }
}

// ─── Step 3.5: Choose which optional modules to keep ────────────────────────

/** Module IDs currently wired into indigo.config.ts. */
function getInstalledModuleIds(): string[] {
  const configPath = path.resolve(process.cwd(), "indigo.config.ts");
  if (!fs.existsSync(configPath)) return [];
  const content = fs.readFileSync(configPath, "utf-8");
  return REGISTRY.filter((e) =>
    content.includes(`./src/${e.id}/module.config`),
  ).map((e) => e.id);
}

/**
 * The starter ships with every module. On a fresh install, let the user keep
 * only the ones they want — the rest are removed via `indigo remove`. Skipped
 * for the framework dev repo and for `-y` runs (demo keeps all modules).
 */
async function selectModules(): Promise<void> {
  if (isProtectedFrameworkRepo()) return;

  const installed = getInstalledModuleIds();
  if (installed.length === 0) return;

  const entries = installed
    .map((id) => REGISTRY.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const keep = new Set<string>();

  if (MODULES_FLAG) {
    const value = MODULES_FLAG.trim().toLowerCase();
    if (value === "all") {
      log("📦", `Keeping all ${installed.length} module(s) (--modules all).`);
      return;
    }
    if (value === "recommended") {
      for (const e of entries) if (e.free) keep.add(e.id);
    } else {
      const unknown: string[] = [];
      for (const part of value.split(",")) {
        const id = part.trim();
        if (!id) continue;
        if (installed.includes(id)) keep.add(id);
        else unknown.push(id);
      }
      if (unknown.length > 0) {
        console.error(
          `Unknown module id(s) in --modules: ${unknown.join(", ")}\n` +
            `Installed modules: ${installed.join(", ")}`,
        );
        process.exit(1);
      }
    }
    log("📦", `Module keep-list from --modules: ${[...keep].join(", ")}`);
  } else if (AUTO_YES) {
    log("📦", `Keeping all ${installed.length} module(s) (auto mode).`);
    return;
  } else {
    console.log("");
    log("📦", "Optional modules:");
    console.log(
      "   This starter ships with every module. Keep the ones you want — the",
    );
    console.log(
      "   rest are removed (re-add later with `bun run indigo add <id>`).",
    );
    console.log("");
    entries.forEach((e, i) => {
      const tag = e.required ? "  (required)" : e.free ? "  (recommended)" : "";
      console.log(`   ${String(i + 1).padStart(2)}. ${e.id}${tag}`);
      console.log(`       ${e.description}`);
    });
    console.log("");

    const freeIdx = entries
      .map((e, i) => (e.free ? i + 1 : null))
      .filter((n): n is number => n !== null);

    const answer = (
      await prompt(
        `  Modules to KEEP — comma-separated numbers, 'all', or blank for recommended [${freeIdx.join(",")}]: `,
      )
    )
      .trim()
      .toLowerCase();

    if (answer === "all") {
      log("✔", "Keeping all modules.");
      return;
    }

    if (answer === "") {
      for (const e of entries) if (e.free) keep.add(e.id);
    } else {
      for (const part of answer.split(",")) {
        const n = Number.parseInt(part.trim(), 10);
        if (n >= 1 && n <= entries.length) keep.add(entries[n - 1]!.id);
      }
    }
  }

  // Required primitives — core still depends on them (see registry.ts).
  for (const e of entries) {
    if (e.required && !keep.has(e.id)) {
      keep.add(e.id);
      log("📌", `${e.id} is a required primitive — kept.`);
    }
  }

  // Transitively pull in required dependencies of kept modules.
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...keep]) {
      const e = REGISTRY.find((r) => r.id === id);
      for (const dep of e?.requires ?? []) {
        if (installed.includes(dep) && !keep.has(dep)) {
          keep.add(dep);
          changed = true;
        }
      }
    }
  }

  const toRemove = installed.filter((id) => !keep.has(id));
  if (toRemove.length === 0) {
    log("✔", "Keeping all modules.");
    return;
  }

  // Order so a dependent module is removed before the module it requires —
  // `indigo remove` refuses to remove a module that still-installed code needs.
  const ordered: string[] = [];
  const pending = new Set(toRemove);
  while (pending.size > 0) {
    let progressed = false;
    for (const id of [...pending]) {
      const blocked = [...pending].some((other) =>
        REGISTRY.find((r) => r.id === other)?.requires?.includes(id),
      );
      if (!blocked) {
        ordered.push(id);
        pending.delete(id);
        progressed = true;
      }
    }
    if (!progressed) {
      ordered.push(...pending);
      break;
    }
  }

  console.log("");
  log("🗑️", `Removing ${ordered.length} module(s): ${ordered.join(", ")}`);
  for (const id of ordered) {
    try {
      execSync(`bun run indigo remove ${id} --yes --keep-db`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } catch {
      log(
        "⚠️",
        `Could not remove ${id} — remove it later with \`bun run indigo remove ${id}\`.`,
      );
    }
  }
  log("✔", `Kept: ${[...keep].join(", ") || "none"}`);
}

// ─── Step 4: Check existing data & offer reset ──────────────────────────────

type ResetResult = "no_data" | "reset" | "skip";

async function checkAndResetIfNeeded(
  db: ReturnType<typeof drizzle>,
  rawSql: ReturnType<typeof postgres>,
): Promise<ResetResult> {
  const { cmsPosts } = await import("../server/db/schema/cms");
  const { cmsMenus } = await import("../server/db/schema/menu");

  const [postCount] = await db.select({ count: count() }).from(cmsPosts);
  const [menuCount] = await db.select({ count: count() }).from(cmsMenus);

  const hasData = (postCount?.count ?? 0) > 0 || (menuCount?.count ?? 0) > 0;

  if (!hasData) return "no_data";

  // --reset flag forces reset without asking
  if (FORCE_RESET) {
    log("🗑️", "Force resetting all data (--reset flag)...");
  } else {
    console.log("");
    log("⚠️", "Data already exists in the database.");
    const shouldReset = await confirm("  Reset and re-seed all data?", false);

    if (!shouldReset) {
      log("⏭️", "Keeping existing data.");
      return "skip";
    }

    log("🗑️", "Resetting all data...");
  }

  const tables = await getAllTables(rawSql);
  if (tables.length > 0) {
    await rawSql.unsafe(`TRUNCATE TABLE ${tables.join(", ")} CASCADE`);
  }

  const seedDir = path.join(PROJECT_ROOT, "uploads", "seed");
  if (fs.existsSync(seedDir)) {
    fs.rmSync(seedDir, { recursive: true, force: true });
  }

  log("✅", "All data cleared.");
  return "reset";
}

// ─── Step 5: Ensure superadmin exists ───────────────────────────────────────

async function ensureSuperadmin(
  db: ReturnType<typeof drizzle>,
): Promise<string> {
  const { user, account } = await import("../server/db/schema/auth");

  const [existingAdmin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "superadmin"))
    .limit(1);

  if (existingAdmin) {
    log("✅", "Superadmin user exists.");
    return existingAdmin.id;
  }

  log("👤", "Creating superadmin...");
  if (!AUTO_YES) console.log("");

  const defaultEmail = process.env.INIT_ADMIN_EMAIL || "admin@example.com";
  const envPassword = process.env.INIT_ADMIN_PASSWORD;

  // In auto mode without explicit password: generate a secure random password
  // NEVER use a hardcoded default — especially in production (--no-seed path)
  const fallbackPassword =
    AUTO_YES && !envPassword
      ? crypto.randomBytes(16).toString("base64url")
      : "asdfasdf";

  const email = AUTO_YES
    ? defaultEmail
    : await promptWithDefault("  Admin email:", defaultEmail);
  const name = process.env.INIT_ADMIN_NAME || email.split("@")[0];

  let password: string;
  if (AUTO_YES) {
    password = envPassword || fallbackPassword;
    if (!envPassword) {
      console.log("");
      log("🔑", `Generated admin password: ${password}`);
      log(
        "⚠️",
        "Change this password immediately! Set INIT_ADMIN_PASSWORD env var for future inits.",
      );
      console.log("");
    }
  } else {
    password = await promptPassword(`  Admin password [asdfasdf]: `);
    if (!password) password = "asdfasdf";
  }

  if (!name || !email || !password) {
    console.error("All fields are required.");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  // In production, refuse known-weak passwords — catches "I forgot to change .env.example"
  // Skipped for intentional demo deployments (INDIGO_ROBOTS_PROFILE=demo) — temporary until demo module
  const KNOWN_WEAK = ['asdfasdf', 'password', 'admin', '123456', 'demo1234', 'qwerty', 'letmein'];
  const isDemo = process.env.INDIGO_ROBOTS_PROFILE === 'demo';
  if (process.env.NODE_ENV === 'production' && !isDemo && KNOWN_WEAK.includes(password)) {
    console.error("");
    console.error("❌  Refusing to create production superadmin with a known-weak password.");
    console.error(`    Password "${password}" is on the weak-passwords list.`);
    console.error("    Set a strong INIT_ADMIN_PASSWORD in your .env and re-run.");
    console.error("");
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);
  const userId = crypto.randomUUID();

  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: "superadmin",
  });

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashedPassword,
  });

  const { cmsAuditLog } = await import("../server/db/schema/audit");
  await db
    .insert(cmsAuditLog)
    .values({
      userId,
      action: "init.superadmin",
      entityType: "user",
      entityId: userId,
      entityTitle: name,
    })
    .catch(() => {});

  console.log("");
  log("✅", `Superadmin "${name}" <${email}> created.`);
  return userId;
}

// ─── Step 6: Company info ──────────────────────────────────────────────────

async function readCurrentOptions(db: ReturnType<typeof drizzle>): Promise<Record<string, string>> {
  try {
    const { cmsOptions } = await import("../server/db/schema/cms");
    const rows = await db.select().from(cmsOptions).limit(100);
    const opts: Record<string, string> = {};
    for (const row of rows) {
      if (typeof row.value === 'string') opts[row.key] = row.value;
    }
    return opts;
  } catch {
    return {};
  }
}

async function promptCompanyInfo(db: ReturnType<typeof drizzle>): Promise<CompanyInfo> {
  const opts = await readCurrentOptions(db);

  if (!AUTO_YES) {
    log("🏢", "Company info (used in legal page templates)...");
    console.log("");
  }

  const siteName = await ask(
    "  Site name: ",
    process.env.NEXT_PUBLIC_SITE_NAME,
    opts['site.name'] ?? "Indigo",
  );
  const siteUrl = await ask(
    "  Site URL: ",
    process.env.NEXT_PUBLIC_APP_URL,
    opts['site.url'] ?? "http://localhost:3000",
  );
  const companyName = await ask(
    '  Company legal name (e.g. "Acme Corp s.r.o."): ',
    undefined,
    opts['company.name'] ?? "Indigo Inc.",
  );
  const companyAddress = await ask(
    "  Company address: ",
    undefined,
    opts['company.address'] ?? "123 Main Street, City, Country",
  );
  const companyId = await ask(
    "  Company registration number: ",
    undefined,
    opts['company.id'] ?? "N/A",
  );
  const companyJurisdiction = await ask(
    '  Governing law jurisdiction (e.g. "the Slovak Republic"): ',
    undefined,
    opts['company.jurisdiction'] ?? "the United States",
  );
  const contactEmail = await ask(
    "  Contact email: ",
    undefined,
    opts['company.contact_email'] ?? "info@example.com",
  );
  const companyVat = await ask(
    "  VAT number (optional): ",
    undefined,
    opts['company.vat'] ?? "",
  );
  const companyPhone = await ask(
    "  Phone number (optional): ",
    undefined,
    opts['company.phone'] ?? "",
  );
  const companyCountry = await ask(
    "  Country: ",
    undefined,
    opts['company.country'] ?? "",
  );
  const supportEmail = await ask(
    "  Support email (leave empty to use contact email): ",
    undefined,
    opts['company.support_email'] ?? "",
  );

  if (!AUTO_YES) console.log("");
  return {
    siteName,
    siteUrl,
    companyName,
    companyAddress,
    companyId,
    companyJurisdiction,
    contactEmail,
    companyVat,
    companyPhone,
    companyCountry,
    supportEmail,
  };
}

// ─── Step 7: Update .env with site values ───────────────────────────────────

function updateEnvFile(companyInfo: CompanyInfo) {
  if (!fs.existsSync(ENV_PATH)) return;

  let envContent = fs.readFileSync(ENV_PATH, "utf-8");
  let changed = false;

  const updates: Record<string, string> = {
    NEXT_PUBLIC_SITE_NAME: companyInfo.siteName,
    NEXT_PUBLIC_APP_URL: companyInfo.siteUrl,
  };

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(envContent)) {
      const currentMatch = envContent.match(regex);
      if (currentMatch && currentMatch[0] !== `${key}=${value}`) {
        envContent = envContent.replace(regex, `${key}=${value}`);
        changed = true;
      }
    } else {
      envContent += `\n${key}=${value}`;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, envContent);
    log("📝", ".env updated with site name and URL.");
  }
}

// ─── Step 8: Seed options ───────────────────────────────────────────────────

async function seedOptions(
  db: ReturnType<typeof drizzle>,
  companyInfo: CompanyInfo,
) {
  const { cmsOptions } = await import("../server/db/schema/cms");

  const [existing] = await db.select({ count: count() }).from(cmsOptions);

  if ((existing?.count ?? 0) > 0) {
    // Options exist — still upsert company info in case it changed
    const companyOpts: Record<string, unknown> = {
      "site.name": companyInfo.siteName,
      "site.url": companyInfo.siteUrl,
      "company.name": companyInfo.companyName,
      "company.address": companyInfo.companyAddress,
      "company.id": companyInfo.companyId,
      "company.jurisdiction": companyInfo.companyJurisdiction,
      "company.contact_email": companyInfo.contactEmail,
      "company.vat": companyInfo.companyVat,
      "company.phone": companyInfo.companyPhone,
      "company.country": companyInfo.companyCountry,
      "company.support_email": companyInfo.supportEmail,
    };
    for (const [key, value] of Object.entries(companyOpts)) {
      await db.insert(cmsOptions).values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: cmsOptions.key, set: { value, updatedAt: new Date() } });
    }
    log("⏭️", "Options already seeded. Company info updated.");
    return;
  }

  log("⚙️", "Seeding default site options...");

  const defaults: Record<string, unknown> = {
    "site.name": companyInfo.siteName,
    "site.tagline": "AI Agent-driven T3 SaaS starter with integrated CMS",
    "site.description": "",
    "site.url": companyInfo.siteUrl,
    "site.logo": "",
    "site.favicon": "",
    "site.social.twitter": "",
    "site.social.github": "",
    "site.social.facebook": "",
    "site.social.instagram": "",
    "site.social.linkedin": "",
    "site.social.youtube": "",
    "site.social.tiktok": "",
    "site.social.discord": "",
    "site.social.mastodon": "",
    "site.social.pinterest": "",
    "company.privacy_email": "",
    "site.analytics.ga_id": "",
    "site.posts_per_page": 10,
    "site.allow_registration": true,
    // Company info (used as %VAR% content variables in legal pages)
    "company.name": companyInfo.companyName,
    "company.address": companyInfo.companyAddress,
    "company.id": companyInfo.companyId,
    "company.jurisdiction": companyInfo.companyJurisdiction,
    "company.contact_email": companyInfo.contactEmail,
    "company.vat": companyInfo.companyVat,
    "company.phone": companyInfo.companyPhone,
    "company.country": companyInfo.companyCountry,
    "company.support_email": companyInfo.supportEmail,
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(cmsOptions).values({
      key,
      value,
      updatedAt: new Date(),
    });
  }

  log("✅", `${Object.keys(defaults).length} default options created.`);

  const { cmsAuditLog } = await import("../server/db/schema/audit");
  await db
    .insert(cmsAuditLog)
    .values({
      userId: "system",
      action: "init.options",
      entityType: "system",
      entityId: crypto.randomUUID(),
      entityTitle: `Seeded ${Object.keys(defaults).length} default options`,
    })
    .catch(() => {});
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("  ╔═══════════════════════════════╗");
  console.log("  ║      Indigo Initialization     ║");
  console.log("  ╚═══════════════════════════════╝");
  if (AUTO_YES) {
    console.log(`  Mode: auto${FORCE_RESET ? " + force reset" : ""}`);
  }
  console.log("");

  // Step 1
  if (!ensureEnvFile()) {
    process.exit(0);
  }

  // Step 2
  const databaseUrl = await ensureDatabase();

  // Step 3
  await runMigrations();

  // Step 3.5 — pick which optional modules to keep (removes the rest)
  await selectModules();

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  // Apply full-text search triggers (idempotent — safe to re-run)
  log("🔍", "Applying full-text search triggers...");
  try {
    await applySearchTriggersWithConnection(sql);
  } catch {
    console.error("Search trigger setup failed. Search will not work correctly.");
  }

  try {
    // Step 4
    const resetResult = await checkAndResetIfNeeded(db, sql);

    // Step 5
    const superadminUserId = await ensureSuperadmin(db);

    const needsSeed = resetResult !== "skip";

    if (!needsSeed) {
      log("⏭️", "Nothing to do.");
    } else {
      // Step 6
      const companyInfo = await promptCompanyInfo(db);

      // Step 7
      updateEnvFile(companyInfo);

      // Step 8
      await seedOptions(db, companyInfo);

      // Step 9: Seed
      if (NO_SEED) {
        log("⏭️", "Skipping seed (--no-seed flag)");
      } else {
        console.log("");
        log("📋", "What to seed:");
        const wantCms = await confirm(
          "  Seed CMS content (categories, tags, content templates)?",
          true,
        );
        let wantBlogs = false;
        let wantPortfolio = false;
        let wantShowcase = false;
        if (wantCms) {
          wantBlogs = await confirm("    Seed demo blog posts (101)?", true);
          wantPortfolio = await confirm("    Seed demo portfolio items (4)?", true);
          wantShowcase = await confirm("    Seed demo showcase items?", true);
        }

        const MODULE_SEEDS = await getModuleSeeds();
        const hasModuleSeeds = MODULE_SEEDS.length > 0;
        const wantDemoUsers = hasModuleSeeds
          ? await confirm(
              "  Seed demo users & organizations (required for module data)?",
              true,
            )
          : false;

        const moduleSeeds: {
          label: string;
          fn: (typeof MODULE_SEEDS)[number]["fn"];
          accepted: boolean;
        }[] = [];
        if (wantDemoUsers) {
          for (const seed of MODULE_SEEDS) {
            // Smart default: YES when empty (fresh install), NO when data exists (protect existing)
            let defaultYes = true;
            if (seed.hasData) {
              try {
                defaultYes = !(await seed.hasData(db));
              } catch {
                /* default YES on error */
              }
            }
            const hint = defaultYes ? "" : " (data exists)";
            const accepted = await confirm(
              `  Seed ${seed.label}?${hint}`,
              defaultYes,
            );
            moduleSeeds.push({ label: seed.label, fn: seed.fn, accepted });
          }
        }

        const wantExtras = await confirm(
          "  Seed extras (menus, forms, audit log, notifications)?",
          true,
        );
        console.log("");

        let cmsResult: Awaited<ReturnType<typeof seedCmsContent>> | undefined;

        if (wantCms) {
          await seedMedia(db);
          cmsResult = await seedCmsContent(db, companyInfo, {
            blogs: wantBlogs,
            portfolio: wantPortfolio,
            showcase: wantShowcase,
          });
        }

        let seedContext = { userIds: [] as string[], orgIds: [] as string[] };
        if (wantDemoUsers) {
          const usersOrgsResult = await seedUsersAndOrgs(db, superadminUserId);
          seedContext = {
            userIds: usersOrgsResult.userIds,
            orgIds: usersOrgsResult.orgIds,
          };
        }

        const seededModules: string[] = [];
        for (const seed of moduleSeeds) {
          if (!seed.accepted) continue;
          await seed.fn(db, superadminUserId, seedContext);
          seededModules.push(seed.label);
        }

        if (wantExtras) {
          await seedExtras(db, {
            superadminUserId,
            postIds: cmsResult?.postIds ?? [],
            categoryIds: cmsResult?.categoryIds ?? [],
            userIds: seedContext.userIds,
            orgIds: seedContext.orgIds,
          });
        }

        const { cmsAuditLog } = await import("../server/db/schema/audit");
        const seeded = [
          wantCms && "cms",
          ...seededModules,
          wantExtras && "extras",
        ].filter(Boolean);
        if (seeded.length > 0) {
          await db
            .insert(cmsAuditLog)
            .values({
              userId: superadminUserId,
              action: "init.seed",
              entityType: "system",
              entityId: crypto.randomUUID(),
              entityTitle: `Database seeded: ${seeded.join(", ")}`,
              metadata: { seeded },
            })
            .catch(() => {});
        }
      } // end if (!NO_SEED)
    }

    // Mint a dev MCP API key so Claude Code (via .mcp.json) works out-of-the-box.
    // Idempotent: skips if .env.local already has INDIGO_MCP_KEY.
    try {
      // Computed specifier: core-api is optional — typecheck must pass without it.
      const coreApiInitKey = '../core-api/lib/init-dev-key';
      const { mintDevMcpKey } = await import(coreApiInitKey);
      const result = await mintDevMcpKey(db, superadminUserId);
      if (result.status === 'minted') {
        log('🤖', `Minted dev MCP key — Claude Code is wired up via ${result.envPath}`);
      } else if (result.status === 'already-present') {
        log('🤖', `MCP key already in .env.local — skipped`);
      } else if (result.status === 'no-org') {
        log('⚠️', `MCP key skipped: superadmin has no organization yet`);
      }
    } catch (err) {
      console.warn('  Skipped MCP key minting:', err instanceof Error ? err.message : String(err));
    }
  } finally {
    await sql.end();
  }

  // Final step — make this the user's own repo, not the starter's (after seeding,
  // so the initial commit reflects the full project).
  // Compile translations (locales/build/ is gitignored, so fresh installs
  // lack it until this runs — the i18n request handler falls back to English
  // source strings without it, but typecheck and non-EN locales need it).
  log("🌐", "Compiling translations...");
  try {
    execSync("bun scripts/i18n/po-to-json.mjs", { stdio: "ignore" });
    log("✅", "Translations compiled.");
  } catch {
    log("⚠️", "Translation compile failed — run `bun run i18n` manually.");
  }

  await ensureGitRepo();

  console.log("");
  log("🚀", "Indigo is ready! Run `bun run dev` to start.");
  console.log("");
}

main().catch((err) => {
  console.error("Init failed:", err);
  process.exit(1);
});
