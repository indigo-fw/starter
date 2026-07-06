import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-brand',
  category: 'primitive',
  routers: [],
  schema: [],
  // Registers the project's brand config via DI (per core boundary rules —
  // see src/core-brand/CLAUDE.md). Picked up by `initModuleDeps()` in the
  // generated module-server bootstrap.
  serverInit: [
    '@/config/deps/brand-deps',
  ],
  jobs: [],
  layoutWidgets: [],
  seed: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'config/brand.ts',
    'config/deps/brand-deps.ts',
    'brand/icon.svg',
    'brand/og-image.svg',
  ],
};

export default config;
