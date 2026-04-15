import type { ModuleConfig } from '@/core/lib/module/module-config';

const config: ModuleConfig = {
  id: 'core-import',
  category: 'primitive',
  routers: [
    { name: 'importRouter', key: 'import', from: '@/core-import/routers/import' },
  ],
  schema: [],
  serverInit: [],
  jobs: [],
  seed: [],
  layoutWidgets: [],
  pageWidgets: [],
  navItems: [
    { groupId: 'settings', name: 'Import', href: '/dashboard/settings/import', icon: 'Upload' },
  ],
  projectFiles: [
    'app/dashboard/(panel)/settings/import/page.tsx',
  ],
};

export default config;
