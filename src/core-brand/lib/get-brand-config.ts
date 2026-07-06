/**
 * Brand config registry — DI registration + access.
 *
 * Why DI: per the core boundary rules (`dev/src/core/CLAUDE.md`), modules
 * may only import from a small allowlist of project paths. `@/config/brand`
 * is not on that list. So instead of the module importing the project's
 * config directly, the project calls `setBrandConfig(brand)` once at boot
 * — the same pattern core-comments / core-payments / others use via their
 * `setXxxDeps()` functions in `src/config/deps/*-deps.ts`.
 *
 * Wiring:
 *   - `src/config/deps/brand-deps.ts` calls `setBrandConfig(brand)` once
 *   - Imported as side-effect from BOTH `src/server.ts` (Bun-direct context)
 *     AND `src/instrumentation.ts` (Next.js bundle context — needed because
 *     RSC runs there, not in server.ts; see the CLAUDE.md note about module
 *     instance separation)
 *
 * SVG caching: at `setBrandConfig()` time we eagerly read the referenced
 * SVG files into memory. `BrandLogo` renders read from this cache — never
 * touches the filesystem at render time. Trade-off: SVG file changes
 * require server restart (acceptable for a config-grade file).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateBrandConfig, formatValidationErrors } from './validate-config';
import type { BrandConfig } from '../types/brand-config';

interface CachedSvgs {
  icon?: string;
  lockup?: string;
}

let registered: BrandConfig | null = null;
let svgs: CachedSvgs = {};

const PROJECT_ROOT = process.cwd();

function absPath(relativePath: string): string {
  const cleaned = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return resolve(PROJECT_ROOT, cleaned);
}

/**
 * Registers the project's brand config. Validates synchronously and throws
 * on failure (so misconfiguration fails loudly at boot rather than producing
 * broken assets silently).
 *
 * Also eagerly reads any referenced SVG files (icon, lockup) into an in-memory
 * cache so render-time access is filesystem-free.
 *
 * Idempotent — safe to call from multiple boot paths (server.ts +
 * instrumentation.ts). Each call re-validates and re-reads the SVGs.
 */
export function setBrandConfig(config: BrandConfig): void {
  const result = validateBrandConfig(config);
  if (!result.ok) {
    throw new Error(
      `core-brand: brand config is invalid:\n${formatValidationErrors(result.errors)}`,
    );
  }

  const next: CachedSvgs = {};
  if ('icon' in config && config.icon) {
    try {
      next.icon = readFileSync(absPath(config.icon), 'utf-8');
    } catch (err) {
      throw new Error(
        `core-brand: failed to read icon SVG at ${config.icon}: ${(err as Error).message}`,
      );
    }
  }
  if (config.mode === 'lockup' && config.lockup) {
    try {
      next.lockup = readFileSync(absPath(config.lockup), 'utf-8');
    } catch (err) {
      throw new Error(
        `core-brand: failed to read lockup SVG at ${config.lockup}: ${(err as Error).message}`,
      );
    }
  }

  registered = config;
  svgs = next;
}

/**
 * Returns the registered brand config. Throws if `setBrandConfig` was never
 * called — typically means the project forgot to add the side-effect import
 * of `@/config/deps/brand-deps` to server.ts + instrumentation.ts.
 */
export function getBrandConfig(): BrandConfig {
  if (!registered) {
    throw new Error(
      "core-brand: brand config not registered. Add `import '@/config/deps/brand-deps';` to server.ts and instrumentation.ts. See src/core-brand/CLAUDE.md.",
    );
  }
  return registered;
}

/** Returns the cached icon SVG string. Empty string if not configured. */
export function getBrandIconSvg(): string {
  return svgs.icon ?? '';
}

/** Returns the cached lockup SVG string. Empty string if mode !== 'lockup'. */
export function getBrandLockupSvg(): string {
  return svgs.lockup ?? '';
}

/** Test helper — resets the in-memory state. Do not use in production code. */
export function _resetBrandConfigCache(): void {
  registered = null;
  svgs = {};
}
