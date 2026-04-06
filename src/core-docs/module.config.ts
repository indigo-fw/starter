import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-docs',
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
  projectFiles: [
    'app/docs/[...slug]/page.tsx',
    'app/api/docs/llms.txt/route.ts',
  ],
};

export default config;
