/**
 * Wire the project brand config into the core-brand module.
 *
 * Imported as a side-effect from:
 *   - server.ts (via the generated initModuleDeps) — Bun-direct context
 *   - instrumentation.ts                            — Next.js bundle context
 *
 * Both are required because RSC runs in the Next.js bundle and workers/CLI
 * run in the Bun-direct bundle, and the two are separate module instances
 * (see the CLAUDE.md note about module-instance separation).
 */
import { setBrandConfig } from '@/core-brand/lib/get-brand-config';
import { brand } from '@/config/brand';

setBrandConfig(brand);
