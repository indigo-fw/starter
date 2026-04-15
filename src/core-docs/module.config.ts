import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-docs',
  category: 'primitive',
  routers: [
    { name: 'docsRouter', key: 'docs', from: '@/core-docs/routers/docs' },
  ],
  schema: [
    '@/core-docs/schema/docs',
  ],
  serverInit: [],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [],
  projectFiles: [
    'app/docs/data.ts',
    'app/docs/page.tsx',
    'app/docs/[...slug]/page.tsx',
    'app/api/docs/llms.txt/route.ts',
  ],
};

export default config;
