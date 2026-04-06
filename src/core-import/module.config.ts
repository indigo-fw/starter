import type { ModuleConfig } from '@/core/lib/module-config';

const config: ModuleConfig = {
  id: 'core-import',
  routers: [
    { name: 'importRouter', key: 'import', from: '@/core-import/routers/import' },
  ],
  schema: [],
  serverInit: [],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  projectFiles: [
    'app/dashboard/(panel)/settings/import/page.tsx',
  ],
};

export default config;
